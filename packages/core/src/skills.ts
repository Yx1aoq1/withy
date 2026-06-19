import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { getGlobalSkillDirs, getProjectSkillDirs } from './agents/registry.js';
import { PRODUCT_SLUG } from './constants.js';
import { readTextFile, isDirectory } from './utils/fs.js';
import type { Scope } from './paths.js';

export interface DiscoveredSkill {
  name: string; // real installed skill directory name (e.g. `withy-dev`)
  description?: string;
  source: 'project' | 'global';
  /** Directories this skill was found in (one skill may be installed in several tools). */
  paths: string[];
}

/** Strip the bundled `withy-` prefix to get the logical (workflow-referenced) name. */
export function logicalSkillName(dirName: string): string {
  const prefix = `${PRODUCT_SLUG}-`;
  return dirName.startsWith(prefix) ? dirName.slice(prefix.length) : dirName;
}

/**
 * Discover skills across project + agent home dirs, deduped by their real
 * installed directory name. Skill directories come from the single agent
 * registry (core §5.1), so the set of scanned locations is maintained in
 * exactly one place. Workflows reference and store this real name verbatim.
 */
export function discoverSkills(scope: Scope): DiscoveredSkill[] {
  const byName = new Map<string, DiscoveredSkill>();

  const collect = (baseDir: string, dirs: string[], source: 'project' | 'global'): void => {
    for (const rel of dirs) {
      const root = resolve(baseDir, rel);
      if (!isDirectory(root)) continue;
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillFile = resolve(root, entry.name, 'SKILL.md');
        if (!existsSync(skillFile)) continue;
        const name = entry.name;
        const existing = byName.get(name);
        if (existing) {
          existing.paths.push(resolve(root, entry.name));
        } else {
          byName.set(name, {
            name,
            description: readDescription(skillFile),
            source,
            paths: [resolve(root, entry.name)],
          });
        }
      }
    }
  };

  collect(scope.root, getProjectSkillDirs(), 'project');
  collect(homedir(), getGlobalSkillDirs(), 'global');

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface ResolvedSkill {
  name: string;
  path: string;
}

/**
 * Resolve a workflow `skill` name to a concrete SKILL.md directory in the project.
 * Checks the logical name and the bundled `withy-<name>` form across skill dirs.
 * Throws when nothing resolves (surfaced at validate / run time — harness §5).
 */
export function resolveSkillRef(scope: Scope, skill: string): ResolvedSkill {
  const candidates = [skill, `${PRODUCT_SLUG}-${skill}`];
  for (const rel of getProjectSkillDirs()) {
    for (const candidate of candidates) {
      const dir = resolve(scope.root, rel, candidate);
      if (existsSync(resolve(dir, 'SKILL.md'))) return { name: skill, path: dir };
    }
  }
  throw new Error(`skill "${skill}" not found in project skill directories`);
}

/** Non-throwing form of {@link resolveSkillRef} for validation (harness §5). */
export function skillExists(scope: Scope, skill: string): boolean {
  try {
    resolveSkillRef(scope, skill);
    return true;
  } catch {
    return false;
  }
}

function readDescription(skillFile: string): string | undefined {
  try {
    const text = readTextFile(skillFile);
    const match = text.match(/^description:\s*(.+)$/m); // simple frontmatter scan
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}
