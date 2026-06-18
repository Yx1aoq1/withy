import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { taskPath, type Scope } from './paths.js';
import { readImplementation } from './store.js';
import { implementationProgress } from './task.js';
import { writeTextFile } from './utils/index.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'tuteur-task-'));
  dirs.push(root);
  return { kind: 'project', root, tuteurDir: resolve(root, '.tuteur') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('markdown implementation plan', () => {
  it('returns empty progress when implement.md is absent', () => {
    expect(implementationProgress(createScope(), 'task-1')).toEqual({ done: 0, total: 0, unparsed: 0 });
  });

  it('parses checkbox bullets and reports other bullet lines', () => {
    const scope = createScope();
    writeTextFile(
      taskPath(scope, 'task-1', 'implement.md'),
      [
        '# Implementation Plan',
        '- [ ] first',
        '  * [X] nested done',
        '- plain bullet',
        '+ [x] final',
        'paragraph',
      ].join('\n'),
    );

    expect(readImplementation(scope, 'task-1')).toEqual({
      items: [
        { id: 'line-2', text: 'first', done: false },
        { id: 'line-3', text: 'nested done', done: true },
        { id: 'line-5', text: 'final', done: true },
      ],
      unparsed: 1,
    });
    expect(implementationProgress(scope, 'task-1')).toEqual({ done: 2, total: 3, unparsed: 1 });
  });

  it('counts malformed checkbox bullets as unparsed instead of silently dropping them', () => {
    const scope = createScope();
    writeTextFile(taskPath(scope, 'task-1', 'implement.md'), '- [maybe] unclear\n- [ ]\n');

    expect(implementationProgress(scope, 'task-1')).toEqual({ done: 0, total: 0, unparsed: 2 });
  });
});
