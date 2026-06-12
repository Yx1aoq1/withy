import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function ensureDir(path: string, createdPaths: string[], writtenPaths?: string[]): boolean {
  if (existsSync(path)) {
    return false;
  }

  mkdirSync(path, { recursive: true });
  createdPaths.push(path);
  writtenPaths?.push(path);
  return true;
}

export function writeJsonIfMissing(path: string, value: unknown, createdPaths: string[]): boolean {
  if (existsSync(path)) {
    return false;
  }

  ensureDir(dirname(path), createdPaths);
  return writeText(path, `${JSON.stringify(value, null, 2)}\n`, createdPaths);
}

export function writeTextIfMissing(path: string, value: string, createdPaths: string[]): boolean {
  if (existsSync(path)) {
    return false;
  }

  ensureDir(dirname(path), createdPaths);
  return writeText(path, value, createdPaths);
}

export function writeText(path: string, value: string, createdPaths: string[]): boolean {
  const existed = existsSync(path);
  ensureDir(dirname(path), createdPaths);
  writeFileSync(path, value, 'utf8');
  if (!existed) {
    createdPaths.push(path);
  }
  return !existed;
}
