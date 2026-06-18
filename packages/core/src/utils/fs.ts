import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, readFileSync } from 'node:fs';
import { writeFileSync as writeFileAtomic } from 'atomically';
import { dirname } from 'node:path';

/** Create a directory (recursive) if absent, tracking the created path. */
export function ensureDir(path: string, createdPaths: string[], writtenPaths?: string[]): boolean {
  if (existsSync(path)) {
    return false;
  }
  mkdirSync(path, { recursive: true });
  createdPaths.push(path);
  writtenPaths?.push(path);
  return true;
}

/** Write text atomically, creating parent dirs; records the path only when newly created. */
export function writeText(path: string, value: string, createdPaths: string[]): boolean {
  const existed = existsSync(path);
  ensureDir(dirname(path), createdPaths); // track created dirs for installer rollback before the atomic write
  writeFileAtomic(path, value, 'utf8');
  if (!existed) {
    createdPaths.push(path);
  }
  return !existed;
}

/** Read a text file (utf8). Throws on missing/unreadable input. */
export function readTextFile(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Read a text file, or null when it is absent. */
export function readTextFileIfExists(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, 'utf8');
}

/** Write text atomically (temp file + rename); creates parent dirs. Untracked variant of {@link writeText}. */
export function writeTextFile(path: string, value: string): void {
  writeFileAtomic(path, value, 'utf8');
}

/** Append one compact JSON line to a JSONL log (creates parent dirs). Append-only — no whole-file atomicity. */
export function appendJsonlLine(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(value)}\n`, 'utf8');
}

/** Write text only when the file is absent. */
export function writeTextIfMissing(path: string, value: string, createdPaths: string[]): boolean {
  if (existsSync(path)) {
    return false;
  }
  ensureDir(dirname(path), createdPaths);
  return writeText(path, value, createdPaths);
}

/** True when the path exists and is a non-empty file. */
export function existsNonEmpty(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).size > 0;
  } catch {
    return false;
  }
}

/** True when the path exists and is a directory. */
export function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Alias of {@link isDirectory} for call sites that read better as a guard. */
export function dirExists(path: string): boolean {
  return isDirectory(path);
}

/** Move a directory within the same volume (creates the target parent). */
export function moveDir(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}
