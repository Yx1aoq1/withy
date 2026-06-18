import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeJsonFile, readJsonFile } from './json.js';
import { writeTextFile } from './fs.js';

const dirs: string[] = [];

function tmp(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'tuteur-json-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('writeJsonFile / readJsonFile', () => {
  it('round-trips a value through pretty JSON with a trailing newline', () => {
    const file = resolve(tmp(), 'a.json');
    const value = { id: '06-12-add-auth', items: [1, 2], nested: { ok: true } };

    writeJsonFile(file, value);

    expect(readJsonFile(file)).toEqual(value);
    expect(readFileSync(file, 'utf8')).toBe(`${JSON.stringify(value, null, 2)}\n`);
  });

  it('creates missing parent directories on write', () => {
    const file = resolve(tmp(), 'deep', 'nested', 'b.json');

    writeJsonFile(file, { ok: true });

    expect(readJsonFile(file)).toEqual({ ok: true });
  });

  it('throws with the path when the file is missing', () => {
    expect(() => readJsonFile(resolve(tmp(), 'missing.json'))).toThrow(/file not found/);
  });

  it('throws with the path on invalid JSON', () => {
    const file = resolve(tmp(), 'bad.json');
    writeTextFile(file, '{ not: valid');
    expect(() => readJsonFile(file)).toThrow(/invalid JSON/);
  });
});
