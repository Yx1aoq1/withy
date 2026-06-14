import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { confirm, select } from '@inquirer/prompts';
import type { Command } from 'commander';
import { PRODUCT_DISPLAY_NAME, PROJECT_DIR_NAME } from '../constants/product.js';
import {
  copyTemplateBackup,
  getInstalledWorkflowSkillTemplates,
  hashContent,
  loadTemplateHashes,
  recordCurrentTemplateHashes,
  saveTemplateHashes,
  type ManagedTemplate,
  type TemplateHashes,
} from '../installation/managed-templates.js';
import { ensureDir } from '@tuteur/core';

interface UpdateCommandOptions {
  dryRun?: boolean;
  force?: boolean;
  skipAll?: boolean;
  createNew?: boolean;
}

type ConflictAction = 'overwrite' | 'skip' | 'create-new';
type TemplateChangeKind = 'create' | 'auto-update' | 'conflict' | 'unchanged';

interface TemplateChange {
  kind: TemplateChangeKind;
  template: ManagedTemplate;
}

interface UpdateStats {
  created: number;
  autoUpdated: number;
  overwritten: number;
  copied: number;
  skipped: number;
  unchanged: number;
}

export default function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description(`Update ${PRODUCT_DISPLAY_NAME}-managed workflow skills to the current CLI templates`)
    .option('--dry-run', 'Preview changes without applying them')
    .option('-f, --force', `Overwrite changed ${PRODUCT_DISPLAY_NAME}-managed files without prompting`)
    .option('-s, --skip-all', 'Skip all changed files without prompting')
    .option('-n, --create-new', 'Write changed templates next to existing files as .new copies')
    .action(runUpdateCommand);
}

async function runUpdateCommand(options: UpdateCommandOptions): Promise<void> {
  const projectRoot = process.cwd();
  const projectDir = resolve(projectRoot, PROJECT_DIR_NAME);
  if (!existsSync(projectDir)) {
    throw new Error(`${PRODUCT_DISPLAY_NAME} is not initialized in this project. Run ttur init first.`);
  }

  const templates = getInstalledWorkflowSkillTemplates(projectRoot);
  const hashes = loadTemplateHashes(projectRoot);
  const changes = templates.map(template => analyzeTemplateChange(template, hashes));

  printUpdatePlan(changes, options);

  if (options.dryRun) {
    console.log('Dry run only. No files were changed.');
    return;
  }

  if (!hasActionableChanges(changes)) {
    printUpdateSummary(createUpdateStats(changes), null);
    return;
  }

  await confirmUpdate(options);

  const nextHashes: TemplateHashes = { ...hashes };
  const stats = createEmptyStats();
  let backupDir: string | null = null;

  for (const change of changes) {
    const result = await applyTemplateChange(projectRoot, change, nextHashes, options, stats, backupDir);
    backupDir = result.backupDir;
  }

  saveTemplateHashes(projectRoot, nextHashes);
  recordCurrentTemplateHashes(projectRoot, templates);
  printUpdateSummary(stats, backupDir);
}

function analyzeTemplateChange(template: ManagedTemplate, hashes: TemplateHashes): TemplateChange {
  if (!existsSync(template.absolutePath)) {
    return { kind: 'create', template };
  }

  const currentContent = readFileSync(template.absolutePath, 'utf8');
  if (currentContent === template.content) {
    return { kind: 'unchanged', template };
  }

  const currentHash = hashContent(currentContent);
  if (hashes[template.relativePath] === currentHash) {
    return { kind: 'auto-update', template };
  }

  return { kind: 'conflict', template };
}

async function applyTemplateChange(
  projectRoot: string,
  change: TemplateChange,
  nextHashes: TemplateHashes,
  options: UpdateCommandOptions,
  stats: UpdateStats,
  backupDir: string | null,
): Promise<{ backupDir: string | null }> {
  const { template } = change;

  if (change.kind === 'unchanged') {
    nextHashes[template.relativePath] = hashContent(readFileSync(template.absolutePath, 'utf8'));
    stats.unchanged += 1;
    return { backupDir };
  }

  if (change.kind === 'create') {
    console.log(`  + ${template.relativePath}`);
    writeTemplate(template);
    nextHashes[template.relativePath] = hashContent(template.content);
    stats.created += 1;
    return { backupDir };
  }

  if (change.kind === 'auto-update') {
    console.log(`  ~ ${template.relativePath}`);
    writeTemplate(template);
    nextHashes[template.relativePath] = hashContent(template.content);
    stats.autoUpdated += 1;
    return { backupDir };
  }

  const action = await resolveConflictAction(template, options);
  if (action === 'skip') {
    console.log(`  - ${template.relativePath} (skipped: modified locally)`);
    stats.skipped += 1;
    return { backupDir };
  }

  if (action === 'create-new') {
    const copyPath = nextCopyPath(template.absolutePath);
    console.log(`  > ${template.relativePath} -> ${copyPath.slice(projectRoot.length + 1)}`);
    ensureDir(dirname(copyPath), []);
    writeFileSync(copyPath, template.content, 'utf8');
    stats.copied += 1;
    return { backupDir };
  }

  const nextBackupDir = backupDir ?? createBackupDir(projectRoot);
  console.log(`  ! ${template.relativePath} (overwritten)`);
  ensureDir(nextBackupDir, []);
  copyTemplateBackup(nextBackupDir, template);
  writeTemplate(template);
  nextHashes[template.relativePath] = hashContent(template.content);
  stats.overwritten += 1;
  return { backupDir: nextBackupDir };
}

async function confirmUpdate(options: UpdateCommandOptions): Promise<void> {
  if (options.force || options.skipAll || options.createNew) {
    return;
  }

  if (!input.isTTY || !output.isTTY) {
    throw new Error('Update requires confirmation. Re-run with --force, --skip-all, --create-new, or --dry-run.');
  }

  const shouldContinue = await confirm({
    message: `Apply these ${PRODUCT_DISPLAY_NAME} template updates?`,
    default: false,
  });

  if (!shouldContinue) {
    throw new Error('Update canceled.');
  }
}

async function resolveConflictAction(
  template: ManagedTemplate,
  options: UpdateCommandOptions,
): Promise<ConflictAction> {
  if (options.force) {
    return 'overwrite';
  }
  if (options.skipAll) {
    return 'skip';
  }
  if (options.createNew) {
    return 'create-new';
  }
  if (!input.isTTY || !output.isTTY) {
    throw new Error(
      `${template.relativePath} was modified locally. Re-run with --force, --skip-all, --create-new, or --dry-run.`,
    );
  }

  return select<ConflictAction>({
    message: `${template.relativePath} was modified locally. How should update handle it?`,
    default: 'skip',
    choices: [
      { name: 'Overwrite', value: 'overwrite', description: 'Back up the current file, then replace it.' },
      { name: 'Skip', value: 'skip', description: 'Keep the current file unchanged.' },
      { name: 'Create .new copy', value: 'create-new', description: 'Write the new template next to it.' },
    ],
  });
}

function printUpdatePlan(changes: TemplateChange[], options: UpdateCommandOptions): void {
  console.log(options.dryRun ? `${PRODUCT_DISPLAY_NAME} update dry run` : `${PRODUCT_DISPLAY_NAME} update plan`);
  printChangeGroup(changes, 'create', 'Will be created', '+');
  printChangeGroup(changes, 'auto-update', 'Will be updated automatically', '~');
  printChangeGroup(changes, 'conflict', 'Modified locally, needs a decision', '!');

  const unchangedCount = changes.filter(change => change.kind === 'unchanged').length;
  if (unchangedCount > 0) {
    console.log(`  ${unchangedCount} unchanged file(s).`);
  }
}

function printChangeGroup(changes: TemplateChange[], kind: TemplateChangeKind, label: string, marker: string): void {
  const matchingChanges = changes.filter(change => change.kind === kind);
  if (matchingChanges.length === 0) {
    return;
  }

  console.log(`${label}:`);
  for (const change of matchingChanges) {
    console.log(`  ${marker} ${change.template.relativePath}`);
  }
}

function hasActionableChanges(changes: TemplateChange[]): boolean {
  return changes.some(change => change.kind !== 'unchanged');
}

function createEmptyStats(): UpdateStats {
  return {
    created: 0,
    autoUpdated: 0,
    overwritten: 0,
    copied: 0,
    skipped: 0,
    unchanged: 0,
  };
}

function createUpdateStats(changes: TemplateChange[]): UpdateStats {
  const stats = createEmptyStats();
  for (const change of changes) {
    if (change.kind === 'unchanged') {
      stats.unchanged += 1;
    }
  }
  return stats;
}

function writeTemplate(template: ManagedTemplate): void {
  ensureDir(dirname(template.absolutePath), []);
  writeFileSync(template.absolutePath, template.content, 'utf8');
}

function nextCopyPath(path: string): string {
  let candidate = `${path}.new`;
  let index = 1;
  while (existsSync(candidate)) {
    candidate = `${path}.new.${index}`;
    index += 1;
  }
  return candidate;
}

function createBackupDir(projectRoot: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(projectRoot, PROJECT_DIR_NAME, `backup-update-${timestamp}`);
}

function printUpdateSummary(stats: UpdateStats, backupDir: string | null): void {
  console.log(
    [
      `Update complete: ${stats.created} created`,
      `${stats.autoUpdated} auto-updated`,
      `${stats.overwritten} overwritten`,
      `${stats.copied} copied`,
      `${stats.skipped} skipped`,
      `${stats.unchanged} unchanged`,
    ].join(', '),
  );

  if (backupDir) {
    console.log(`Backup: ${backupDir}`);
  }
}
