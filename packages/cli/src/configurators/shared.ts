import { copyFileSync, existsSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, type TemplateContext } from '@tuteur/core';
import { getBundledSkillName, PRODUCT_DISPLAY_NAME } from '../constants/product.js';

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
      const skillName = getBundledSkillName(entry.name);
      return {
        name: skillName,
        content: renderTemplate(readFileSync(skillPath, 'utf8'), {
          ...context,
          skillName,
        }),
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

const TEMPLATE_EXCLUDE_SUFFIXES = ['.ts', '.js', '.map'];
const TEMPLATE_EXCLUDE_NAMES = ['.gitkeep'];

function shouldSkipTemplateEntry(name: string): boolean {
  return TEMPLATE_EXCLUDE_NAMES.includes(name) || TEMPLATE_EXCLUDE_SUFFIXES.some(suffix => name.endsWith(suffix));
}

/**
 * Copy a platform's template tree (`templates/<templateId>/`) into the project's
 * agent config dir. Build/index artifacts and `.gitkeep` markers are filtered out;
 * `.json` declaration files (hooks.json / settings.json) get placeholder rendering.
 * Existing files are left untouched (idempotent re-init).
 */
export function copyAgentTemplates(input: {
  projectRoot: string;
  templateId: string;
  configDir: string;
  templateContext: TemplateContext;
  createdPaths: string[];
}): string[] {
  const sourceDir = resolve(templateRoot, input.templateId);
  const targetDir = resolve(input.projectRoot, input.configDir);
  const writtenPaths: string[] = [];
  if (!existsSync(sourceDir)) {
    return writtenPaths;
  }

  copyAgentTemplateDir(sourceDir, targetDir, input.templateContext, input.createdPaths, writtenPaths);
  return writtenPaths;
}

function copyAgentTemplateDir(
  source: string,
  target: string,
  context: TemplateContext,
  createdPaths: string[],
  writtenPaths: string[],
): void {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (shouldSkipTemplateEntry(entry.name)) {
      continue;
    }

    const from = resolve(source, entry.name);
    const to = resolve(target, entry.name);

    if (entry.isDirectory()) {
      copyAgentTemplateDir(from, to, context, createdPaths, writtenPaths);
      continue;
    }

    if (existsSync(to)) {
      continue;
    }

    ensureDir(dirname(to), createdPaths, writtenPaths);
    const raw = readFileSync(from, 'utf8');
    const content = entry.name.endsWith('.json') ? resolvePlaceholders(raw, context) : raw;
    writeFileSync(to, content, 'utf8');
    createdPaths.push(to);
    writtenPaths.push(to);
  }
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

export function resolvePlaceholders(content: string, context: TemplateContext): string {
  return content
    .replaceAll('{{PRODUCT_NAME}}', PRODUCT_DISPLAY_NAME)
    .replaceAll('{{CMD_REF_PREFIX}}', context.cmdRefPrefix)
    .replaceAll('{{USER_ACTION_LABEL}}', context.userActionLabel)
    .replaceAll('{{CLI_FLAG}}', context.cliFlag);
}

function renderTemplate(content: string, context: TemplateContext & { skillName: string }): string {
  return resolvePlaceholders(content, context).replaceAll('{{SKILL_NAME}}', context.skillName);
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
