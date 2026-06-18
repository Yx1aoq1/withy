import { DEFAULT_STUCK_THRESHOLD } from './constants.js';
import { type Scope, archiveDir, taskDir } from './paths.js';
import {
  clearCurrentTaskPointer,
  readCurrentTaskPointer,
  readImplementation,
  taskExists,
  readEvents,
  listTasks,
  writeTask,
  readTask,
} from './store.js';
import { moveDir, nowIso } from './utils/index.js';

// ── Task lifecycle + derived metrics ──────────────────────────────────────────
// Task-level concerns that sit beside the workflow state machine (workflow/):
// current-task resolution, archiving, and read-only metrics derived from events
// and the implementation plan. No cursor transitions here — those live in workflow/.

// ── Current-task resolution (harness §7.1) ───────────────────────────────────

export type CurrentTask = { taskId: string } | { stale: string } | { ambiguous: string[] } | null;

export function resolveCurrentTask(scope: Scope, explicit?: string): CurrentTask {
  if (explicit) return { taskId: explicit };

  const pointer = readCurrentTaskPointer(scope);
  if (pointer) return taskExists(scope, pointer) ? { taskId: pointer } : { stale: pointer };

  const open = listTasks(scope).filter(t => t.status === 'planning' || t.status === 'in_progress');
  if (open.length === 1) return { taskId: open[0].id };
  if (open.length > 1) return { ambiguous: open.map(t => t.id) };
  return null;
}

// ── Archive (core §9) ────────────────────────────────────────────────────────

export interface ArchiveOptions {
  markCancelled?: boolean;
}

export function archiveTask(scope: Scope, taskId: string, options: ArchiveOptions = {}): void {
  const task = readTask(scope, taskId);
  if (task.archivedAt) throw new Error(`task "${taskId}" is already archived`);

  const archivedAt = nowIso();
  const status = options.markCancelled ? 'cancelled' : task.status;
  writeTask(scope, { ...task, status, archivedAt });

  const bucket = archivedAt.slice(0, 7); // YYYY-MM
  moveDir(taskDir(scope, taskId), `${archiveDir(scope)}/${bucket}/${taskId}`);

  if (readCurrentTaskPointer(scope) === taskId) clearCurrentTaskPointer(scope);
}

// ── Stuck alarm (derived from events; never auto-passes — core §4.4) ──────────

export function countConsecutiveFailures(scope: Scope, taskId: string, node: string): number {
  let count = 0;
  for (const event of readEvents(scope, taskId)) {
    if (event.type === 'rewind' && event.node === node) count = 0;
    if (event.type === 'complete_attempt' && event.node === node) {
      count = event.ok ? 0 : count + 1;
    }
  }
  return count;
}

export function isStuck(scope: Scope, taskId: string, node: string, threshold = DEFAULT_STUCK_THRESHOLD): boolean {
  return countConsecutiveFailures(scope, taskId, node) >= threshold;
}

// ── Implementation progress (derived; web third tier — §4.7) ─────────────────

export function implementationProgress(
  scope: Scope,
  taskId: string,
): { done: number; total: number; unparsed: number } {
  const { items, unparsed } = readImplementation(scope, taskId);
  return { done: items.filter(item => item.done).length, total: items.length, unparsed };
}
