import { existsSync, lstatSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { confirm } from '@inquirer/prompts';
import { resolveGlobalScope } from '@tuteur/core';
import type { Command } from 'commander';
import { PRODUCT_DISPLAY_NAME, PROJECT_DIR_NAME } from '../constants/product.js';
import {
  cleanupEmptyManagedDirs,
  getBundledSkillNames,
  removeKnownWorkflowSkillPaths,
} from '../installation/managed-templates.js';

interface UninstallCommandOptions {
  yes?: boolean;
  dryRun?: boolean;
  global?: boolean;
}

interface UninstallPlan {
  skillPaths: string[];
  removeProjectDir: boolean;
}

export default function registerUninstallCommand(program: Command): void {
  program
    .command('uninstall')
    .description(
      `Remove ${PRODUCT_DISPLAY_NAME}-managed skills and ${PROJECT_DIR_NAME}/ from this project, or the global ~/.tuteur root with --global`,
    )
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--dry-run', 'List what would be removed without changing anything')
    .option('--global', 'Remove the global ~/.tuteur root instead of the project install')
    .action(runUninstallCommand);
}

async function runUninstallCommand(options: UninstallCommandOptions): Promise<void> {
  if (options.global) {
    return runGlobalUninstall(options);
  }

  const projectRoot = process.cwd();
  const projectDir = resolve(projectRoot, PROJECT_DIR_NAME);
  if (!existsSync(projectDir)) {
    throw new Error(
      `${PRODUCT_DISPLAY_NAME} is not installed in this project (no ${PROJECT_DIR_NAME}/ directory found).`,
    );
  }

  const plan = buildUninstallPlan(projectRoot);
  renderUninstallPlan(projectRoot, plan);

  if (options.dryRun) {
    console.log('Dry run only. No files were removed.');
    return;
  }

  if (!(await confirmOrThrow(options, `Remove these ${PRODUCT_DISPLAY_NAME} files from this project?`))) {
    console.log('Uninstall canceled.');
    return;
  }

  const removedSkillPaths = removeKnownWorkflowSkillPaths(projectRoot);
  rmSync(projectDir, { recursive: true, force: true });
  const removedEmptyDirs = cleanupEmptyManagedDirs(projectRoot);

  console.log(
    `Uninstalled ${PRODUCT_DISPLAY_NAME}: ${removedSkillPaths} skill path(s), ${PROJECT_DIR_NAME}/, and ${removedEmptyDirs} empty dir(s) removed.`,
  );
}

// Remove the global root ~/.tuteur (own namespace; no agent dirs were ever
// written there — core §2.3 — so this only deletes config + registry + templates).
async function runGlobalUninstall(options: UninstallCommandOptions): Promise<void> {
  const globalDir = resolveGlobalScope().tuteurDir;
  if (!existsSync(globalDir)) {
    throw new Error(`${PRODUCT_DISPLAY_NAME} global root is not installed (no ${globalDir}).`);
  }

  console.log(`${PRODUCT_DISPLAY_NAME} global uninstall plan`);
  console.log(`  - ${globalDir}`);

  if (options.dryRun) {
    console.log('Dry run only. No files were removed.');
    return;
  }

  if (!(await confirmOrThrow(options, `Remove the ${PRODUCT_DISPLAY_NAME} global root at ${globalDir}?`))) {
    console.log('Uninstall canceled.');
    return;
  }

  rmSync(globalDir, { recursive: true, force: true });
  console.log(`Uninstalled ${PRODUCT_DISPLAY_NAME} global root: ${globalDir} removed.`);
}

// Confirm a destructive removal: honor --yes, refuse to guess in a non-interactive
// shell, otherwise prompt. Returns true when the caller should proceed.
async function confirmOrThrow(options: UninstallCommandOptions, message: string): Promise<boolean> {
  if (options.yes) {
    return true;
  }
  if (!input.isTTY || !output.isTTY) {
    throw new Error('Refusing to uninstall in a non-interactive shell. Pass --yes to confirm.');
  }

  return confirm({ message, default: false });
}

function buildUninstallPlan(projectRoot: string): UninstallPlan {
  const skillPaths: string[] = [];

  for (const skillName of getBundledSkillNames()) {
    for (const relativePath of [`.agent/skill/${skillName}`, `.claude/skills/${skillName}`]) {
      const absolutePath = resolve(projectRoot, relativePath);
      if (pathExists(absolutePath) && isRemovablePath(absolutePath)) {
        skillPaths.push(relativePath);
      }
    }
  }

  return {
    skillPaths,
    removeProjectDir: true,
  };
}

function renderUninstallPlan(projectRoot: string, plan: UninstallPlan): void {
  console.log(`${PRODUCT_DISPLAY_NAME} uninstall plan`);
  if (plan.skillPaths.length === 0) {
    console.log(`  No ${PRODUCT_DISPLAY_NAME} workflow skill paths found.`);
  } else {
    for (const path of plan.skillPaths) {
      console.log(`  - ${path}`);
    }
  }

  if (plan.removeProjectDir) {
    console.log(`  - ${resolve(projectRoot, PROJECT_DIR_NAME)}`);
  }
}

function isRemovablePath(path: string): boolean {
  const stat = lstatSync(path);
  return stat.isDirectory() || stat.isSymbolicLink();
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
