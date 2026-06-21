import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { taskPath, type Scope } from '../../src/paths.js';
import { listTaskArtifacts, readImplementation, readTaskArtifact, writeTask, readTask } from '../../src/store/index.js';
import { implementationProgress, archiveTask } from '../../src/task/index.js';
import { writeTextFile, writeJsonFile, nowIso } from '../../src/utils/index.js';
import type { Task } from '../../src/types.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-task-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

// Archive validates terminal state only, so a task fixture just needs its status.
function seedTask(scope: Scope, status: Task['status']): void {
  writeTask(scope, {
    id: 't',
    title: 'T',
    workflow: 'default',
    status,
    creator: 'y',
    assignee: 'y',
    priority: 'normal',
    tags: [],
    createdAt: nowIso(),
    completedAt: status === 'completed' ? nowIso() : null,
    archivedAt: null,
  });
}

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

describe('listTaskArtifacts', () => {
  it('returns an empty list when the task directory has no documents', () => {
    expect(listTaskArtifacts(createScope(), 'task-1')).toEqual([]);
  });

  it('lists non-empty markdown documents, sorted, excluding runtime state and empty files', () => {
    const scope = createScope();
    writeTextFile(taskPath(scope, 'task-1', 'design.md'), '# Design\n');
    writeTextFile(taskPath(scope, 'task-1', 'prd.md'), '# PRD\n');
    writeTextFile(taskPath(scope, 'task-1', 'empty.md'), '');
    writeJsonFile(taskPath(scope, 'task-1', 'task.json'), { id: 'task-1' });
    writeTextFile(taskPath(scope, 'task-1', 'events.jsonl'), '{}\n');

    expect(listTaskArtifacts(scope, 'task-1')).toEqual(['design.md', 'prd.md']);
  });
});

describe('readTaskArtifact', () => {
  it('returns the body of an existing artifact', () => {
    const scope = createScope();
    writeTextFile(taskPath(scope, 'task-1', 'prd.md'), '# PRD\nbody\n');
    expect(readTaskArtifact(scope, 'task-1', 'prd.md')).toBe('# PRD\nbody\n');
  });

  it('returns null when the artifact does not exist', () => {
    expect(readTaskArtifact(createScope(), 'task-1', 'missing.md')).toBeNull();
  });

  it('rejects unsafe names (traversal, separators, non-md)', () => {
    const scope = createScope();
    for (const name of ['../secret.md', 'a/b.md', 'a\\b.md', '..', '.', 'task.json', 'prd']) {
      expect(() => readTaskArtifact(scope, 'task-1', name)).toThrow();
    }
  });
});

describe('archiveTask gate', () => {
  it('blocks archiving a task that is not completed', () => {
    const scope = createScope();
    seedTask(scope, 'in_progress');
    expect(() => archiveTask(scope, 't')).toThrow(/not completed/);
  });

  it('blocks archiving a planning task', () => {
    const scope = createScope();
    seedTask(scope, 'planning');
    expect(() => archiveTask(scope, 't')).toThrow(/not completed/);
  });

  it('archives a completed task without mutating its status', () => {
    const scope = createScope();
    seedTask(scope, 'completed');
    expect(() => archiveTask(scope, 't')).not.toThrow();
    const archived = readTask(scope, 't');
    expect(archived.status).toBe('completed');
    expect(archived.archivedAt).not.toBeNull();
  });

  it('blocks archiving a completed task whose implementation checklist is unfinished', () => {
    const scope = createScope();
    seedTask(scope, 'completed');
    writeTextFile(taskPath(scope, 't', 'implement.md'), '- [x] done\n- [ ] still open\n');
    expect(() => archiveTask(scope, 't')).toThrow(/unchecked implementation step/);
  });

  it('archives a completed task once every implementation step is checked', () => {
    const scope = createScope();
    seedTask(scope, 'completed');
    writeTextFile(taskPath(scope, 't', 'implement.md'), '- [x] one\n- [x] two\n');
    expect(() => archiveTask(scope, 't')).not.toThrow();
  });

  it('abandons an unfinished task as cancelled with the explicit cancel option, skipping the checklist', () => {
    const scope = createScope();
    seedTask(scope, 'in_progress');
    writeTextFile(taskPath(scope, 't', 'implement.md'), '- [ ] not done\n');
    expect(() => archiveTask(scope, 't', { markCancelled: true })).not.toThrow();
    expect(readTask(scope, 't').status).toBe('cancelled');
  });
});
