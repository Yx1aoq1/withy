import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { GLOBAL_DIR_NAME, PROJECT_DIR_NAME } from './constants.js';
import { isDirectory } from './utils/fs.js';

export interface Scope {
  kind: 'global' | 'project';
  /** Repo root (project) or home (global) — the dir that *contains* the .withy dir. */
  root: string;
  /** Absolute path to the .withy directory. */
  withyDir: string;
}

/** Global scope: ~/.withy (config + project registry + templates; no tasks). */
export function resolveGlobalScope(): Scope {
  const root = homedir();
  return { kind: 'global', root, withyDir: resolve(root, GLOBAL_DIR_NAME) };
}

/**
 * Project scope: walk up from `from` (or WITHY_PROJECT_ROOT / INIT_CWD / cwd)
 * looking for a directory that contains a `.withy/` dir. Returns null if none.
 */
export function resolveProjectScope(from?: string): Scope | null {
  const start = from ?? process.env.WITHY_PROJECT_ROOT ?? process.env.INIT_CWD ?? process.cwd();
  let current = resolve(start);

  // Never treat the home directory's own ~/.withy as a project scope.
  const home = homedir();

  while (true) {
    const candidate = resolve(current, PROJECT_DIR_NAME);
    if (current !== home && isDirectory(candidate)) {
      return { kind: 'project', root: current, withyDir: candidate };
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/** True if `path` looks like an initialized Withy project (has a .withy dir). */
export function detectWithy(path: string): boolean {
  return isDirectory(resolve(path, PROJECT_DIR_NAME));
}

export function tasksDir(scope: Scope): string {
  return resolve(scope.withyDir, 'tasks');
}

export function taskDir(scope: Scope, id: string): string {
  return resolve(tasksDir(scope), id);
}

export function archiveDir(scope: Scope): string {
  return resolve(tasksDir(scope), 'archive');
}

export function taskPath(scope: Scope, id: string, rel: string): string {
  return resolve(taskDir(scope, id), rel);
}

export function workflowsDir(scope: Scope): string {
  return resolve(scope.withyDir, 'workflows');
}

export function workflowPath(scope: Scope, id: string): string {
  return resolve(workflowsDir(scope), `${id}.workflow.json`);
}

export function runtimeDir(scope: Scope): string {
  return resolve(scope.withyDir, 'runtime');
}

export function guidePath(scope: Scope): string {
  return resolve(scope.withyDir, 'guide.md');
}

export function knowledgeDir(scope: Scope): string {
  return resolve(scope.withyDir, 'knowledge');
}

export function knowledgeWikiPath(scope: Scope, id: string): string {
  return resolve(knowledgeDir(scope), 'wiki', `${id}.md`);
}

export function currentTaskPointerPath(scope: Scope): string {
  return resolve(runtimeDir(scope), 'current-task.json');
}

// ── Global root files (config + project registry — core.md §2.1) ─────────────

export function globalConfigPath(scope: Scope): string {
  return resolve(scope.withyDir, 'config.yaml');
}

export function projectsRegistryPath(scope: Scope): string {
  return resolve(scope.withyDir, 'projects.json');
}
