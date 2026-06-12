import { copyFileSync, existsSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir } from '../utils/fs.js';
import type { TemplateContext } from '../types/agent.js';

export interface ResolvedSkillTemplate {
  name: string;
  content: string;
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const templateRoot = resolve(currentDir, '../templates');
const canonicalSkillsDir = '.agent/skill';

export function getCanonicalSkillsDir(projectRoot: string): string {
  return resolve(projectRoot, canonicalSkillsDir);
}

export function installCanonicalWorkflowSkills(input: { projectRoot: string; createdPaths: string[] }): string[] {
  return writeSkills({
    skillsRoot: getCanonicalSkillsDir(input.projectRoot),
    skills: resolveWorkflowSkills({
      cmdRefPrefix: '$',
      userActionLabel: 'Skills',
      cliFlag: 'codex',
    }),
    createdPaths: input.createdPaths,
  });
}

export function resolveWorkflowSkills(context: TemplateContext): ResolvedSkillTemplate[] {
  const skillsRoot = resolve(templateRoot, 'common/skills');
  if (!existsSync(skillsRoot)) {
    return [];
  }

  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const skillPath = resolve(skillsRoot, entry.name, 'SKILL.md');
      return {
        name: entry.name,
        content: renderTemplate(readFileSync(skillPath, 'utf8'), context),
      };
    });
}

export function writeSkills(input: {
  skillsRoot: string;
  skills: ResolvedSkillTemplate[];
  createdPaths: string[];
}): string[] {
  const writtenPaths: string[] = [];
  ensureDir(input.skillsRoot, input.createdPaths, writtenPaths);

  for (const skill of input.skills) {
    const skillDir = resolve(input.skillsRoot, skill.name);
    const skillFile = resolve(skillDir, 'SKILL.md');
    ensureDir(skillDir, input.createdPaths, writtenPaths);

    if (existsSync(skillFile)) {
      continue;
    }

    writeFileSync(skillFile, skill.content, 'utf8');
    input.createdPaths.push(skillFile);
    writtenPaths.push(skillFile);
  }

  return writtenPaths;
}

export function linkSkills(input: { projectRoot: string; linkRoot: string; createdPaths: string[] }): string[] {
  const writtenPaths: string[] = [];
  const canonicalRoot = getCanonicalSkillsDir(input.projectRoot);
  const targetRoot = resolve(input.projectRoot, input.linkRoot);
  ensureDir(targetRoot, input.createdPaths, writtenPaths);

  if (!existsSync(canonicalRoot)) {
    return writtenPaths;
  }

  for (const entry of readdirSync(canonicalRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const source = resolve(canonicalRoot, entry.name);
    const target = resolve(targetRoot, entry.name);
    if (existsSync(target)) {
      continue;
    }

    const relativeSource = relative(dirname(target), source);
    symlinkSync(relativeSource, target, process.platform === 'win32' ? 'junction' : 'dir');
    input.createdPaths.push(target);
    writtenPaths.push(target);
  }

  return writtenPaths;
}

export function copyCanonicalSkills(input: {
  projectRoot: string;
  targetRoot: string;
  createdPaths: string[];
}): string[] {
  return copyTemplateTreeIfMissing({
    sourceDir: getCanonicalSkillsDir(input.projectRoot),
    targetDir: resolve(input.projectRoot, input.targetRoot),
    createdPaths: input.createdPaths,
  });
}

export function copyTemplateTreeIfMissing(input: {
  sourceDir: string;
  targetDir: string;
  createdPaths: string[];
}): string[] {
  const writtenPaths: string[] = [];
  if (!existsSync(input.sourceDir)) {
    return writtenPaths;
  }

  copyDirIfMissing(input.sourceDir, input.targetDir, input.createdPaths, writtenPaths);
  return writtenPaths;
}

function renderTemplate(content: string, context: TemplateContext): string {
  return content
    .replaceAll('{{CMD_REF_PREFIX}}', context.cmdRefPrefix)
    .replaceAll('{{USER_ACTION_LABEL}}', context.userActionLabel)
    .replaceAll('{{CLI_FLAG}}', context.cliFlag);
}

function copyDirIfMissing(source: string, target: string, createdPaths: string[], writtenPaths: string[]): void {
  ensureDir(target, createdPaths, writtenPaths);

  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = resolve(source, entry.name);
    const to = resolve(target, entry.name);

    if (entry.isDirectory()) {
      copyDirIfMissing(from, to, createdPaths, writtenPaths);
      continue;
    }

    if (existsSync(to)) {
      continue;
    }

    ensureDir(dirname(to), createdPaths, writtenPaths);
    copyFileSync(from, to);
    createdPaths.push(to);
    writtenPaths.push(to);
  }
}
