import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { writeFileSync, readFileSync } from 'atomically';
import { ensureDir } from './fs.js';

/** Read and JSON-parse a file. Throws with the path on missing/invalid input. */
export function readJsonFile(path: string): unknown {
  if (!existsSync(path)) {
    throw new Error(`file not found: ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`invalid JSON: ${path}\n  ${(error as Error).message}`);
  }
}

/** Write a value as pretty JSON (trailing newline) atomically; creates parent dirs. */
export function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Write JSON only when the file is absent; records the created path. */
export function writeJsonFileIfMissing(path: string, value: unknown, createdPaths: string[]): boolean {
  if (existsSync(path)) {
    return false;
  }
  ensureDir(dirname(path), createdPaths); // track created dirs for installer rollback before the atomic write
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  createdPaths.push(path);
  return true;
}
