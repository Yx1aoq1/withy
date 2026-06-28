import { readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { type Scope, taskDir, archiveDir, guidePath } from '../paths.js';
import { type Developer, DeveloperSchema } from '../types.js';
import { readTextFileIfExists, existsNonEmpty, writeTextFile } from '../utils/index.js';
import { readValidated } from './errors.js';
import { taskReadPath } from './tasks.js';

// ── Task artifacts (tasks/<id>/*.md — agent-authored planning docs) ──────────

/**
 * List a task's existing planning artifacts: the non-empty Markdown files in the
 * task directory. Runtime state (task.json/state.json/events.jsonl) is JSON/JSONL
 * and is excluded by construction, so callers get only authored documents.
 * @param scope Resolved project scope.
 * @param id Task id (archived tasks are resolved via the same fallback as reads).
 */
export function listTaskArtifacts(scope: Scope, id: string): string[] {
  const dir = dirname(taskReadPath(scope, id, 'task.json'));
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter(
      entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md') && existsNonEmpty(resolve(dir, entry.name)),
    )
    .map(entry => entry.name)
    .sort();
}

// 安全产物文件名:单段 .md basename(无路径分隔符、非 . / ..),拒绝目录穿越。
const SAFE_DOC_NAME = /^[^/\\]+\.md$/i;

/**
 * Read a single task artifact's body (read-only). `name` must be a safe Markdown
 * basename — no path separators and not `.`/`..` — anything else throws to refuse
 * traversal. The path resolves with the same archive fallback as other reads, then
 * is asserted to sit inside this task's live or archived directory (defence in
 * depth). A missing file returns null.
 * @param scope Resolved project scope.
 * @param id Task id (archived tasks are resolved via the same fallback as reads).
 * @param name Artifact file name, e.g. `prd.md`.
 * @return The file body, or null when the artifact does not exist.
 */
export function readTaskArtifact(scope: Scope, id: string, name: string): string | null {
  if (name === '.' || name === '..' || !SAFE_DOC_NAME.test(name)) {
    throw new Error(`unsafe task artifact name: ${name}`);
  }

  const file = taskReadPath(scope, id, name);
  if (!isInsideTaskDir(scope, id, file)) {
    throw new Error(`task artifact path escapes task dir: ${name}`);
  }

  return readTextFileIfExists(file);
}

// 断言解析后的产物路径落在该任务目录(live 或归档桶 archive/<bucket>/<id>)之内。
// 配合 basename 正则双重防越界:即便 taskReadPath 行为改变,也不会读到任务目录之外。
function isInsideTaskDir(scope: Scope, id: string, file: string): boolean {
  const parent = dirname(file);
  if (basename(parent) !== id) return false;
  if (parent === taskDir(scope, id)) return true;

  return dirname(dirname(parent)) === archiveDir(scope); // archive/<bucket>/<id>
}

// ── Session guide (.withy/guide.md — tool-level intro, injected verbatim) ───

export function readGuide(scope: Scope): string | null {
  return readTextFileIfExists(guidePath(scope));
}

/** Overwrite the session guide (.withy/guide.md). Backs the web context editor — design §6.2. */
export function writeGuide(scope: Scope, body: string): void {
  writeTextFile(guidePath(scope), body);
}

// ── Developer identity (.withy/.developer — local, gitignored) ───────────────

export function readDeveloper(scope: Scope): Developer | null {
  const file = resolve(scope.withyDir, '.developer');
  if (!existsSync(file)) return null;
  return readValidated(file, DeveloperSchema, '.developer');
}
