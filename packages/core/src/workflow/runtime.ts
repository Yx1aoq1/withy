import { spawnSync } from 'node:child_process';
import { type Scope, taskPath } from '../paths.js';
import {
  clearCurrentTaskPointer,
  readWorkflow,
  appendEvent,
  readProgress,
  isApproved,
  readEvents,
  writeState,
  readState,
  writeTask,
  readTask,
} from '../store/index.js';
import { existsNonEmpty, nowIso } from '../utils/index.js';
import {
  approveState,
  describeNext,
  deriveStatus,
  rewindState,
  gateGuardId,
  stepWorkflow,
  nodeById,
} from './interpret.js';
import { dispatchBlock, isDispatchCurated } from './dispatch.js';
import { evaluateGate } from './gate.js';
import type { StepResult, NextStep, WorkflowAction } from './interpret.js';
import type { GateContext } from './gate.js';
import type { GuardReport } from './engine.js';
import type { State, Task, Workflow, SkillNode, TaskEvent } from '../types.js';

// ──────────────────────────────────────────────────────────────────────────
// IO shell over the state machine. Loads `.withy/`, computes the current node's
// gate result (the only IO the pure step needs), drives `stepWorkflow`, then
// persists the returned state + events. No transition/branch/gate *logic* lives
// here — that's engine.ts (mechanics), interpret.ts (Withy policy), gate.ts
// (checkers). This file only does fs/spawn + bookkeeping.
//
// Naming note: "runtime" is overloaded across the repo. THIS file is the
// workflow state-machine IO shell. It is unrelated to the `.withy/runtime/`
// transient-state directory (paths.ts `runtimeDir`) and to the CLI's
// `harness/runtime.ts` output layer. See design/core.md ("三处 runtime 命名").
// ──────────────────────────────────────────────────────────────────────────

export interface NextResult {
  ok: boolean;
  exitCode: 0 | 2;
  node: string | null;
  done?: string;
  blocked?: string[];
  needsBranch?: boolean;
  branches?: { label: string; criteria?: string; default?: boolean }[];
  nextAction?: string;
  next?: NextStep;
  state?: State;
}

export interface NextOptions {
  branch?: string;
  reason?: string;
  by?: string;
}

/**
 * Render the agent-facing relay for a task's current node, attaching the dispatch
 * block when that node carries an `agent` (the IO `describeNext` can't: it needs
 * scope + taskId to read dispatch.json for `curated`, and lazily seeds the shell).
 * design §2.1 — the dispatch block is composed on the relay, not inside the pure
 * `describeNext`. Both `withy next` and `task status` go through here.
 */
export function relayNext(scope: Scope, taskId: string, wf: Workflow, state: State): NextStep {
  const next = describeNext(wf, state);
  const node = state.currentNode ? nodeById(wf, state.currentNode) : null;
  if (node?.type === 'skill' && node.agent) {
    next.dispatch = dispatchBlock(scope, taskId, wf, node);
  }
  return next;
}

/**
 * The sole agent-facing advance gate (`withy next`). Reads `state.currentNode` —
 * the caller never names a node. For a skill node we evaluate its gate (fs/checks/
 * approval) into a guard report and hand it to the pure `stepWorkflow`; switch
 * routing is decided in interpret.ts over the generic engine. harness §2.
 */
export function nextNode(scope: Scope, taskId: string, opts: NextOptions = {}): NextResult {
  const task = readTask(scope, taskId);
  const wf = readWorkflow(scope, task.workflow);
  const state = readState(scope, taskId);

  if (state.currentNode === null)
    return { ok: true, exitCode: 0, node: null, next: relayNext(scope, taskId, wf, state) };

  const node = nodeById(wf, state.currentNode);
  const action: WorkflowAction = opts.branch
    ? { kind: 'branch', label: opts.branch, reason: opts.reason, by: opts.by }
    : { kind: 'advance' };
  const guards = node?.type === 'skill' ? skillGuards(scope, taskId, node) : {};

  return persist(scope, taskId, task, wf, stepWorkflow(wf, state, action, guards));
}

/** Explicit human skip — bypass the current node's gate, advance, leave a trace. harness §2.4 */
export function skipNode(scope: Scope, taskId: string, by: string | undefined, reason: string): NextResult {
  const task = readTask(scope, taskId);
  const wf = readWorkflow(scope, task.workflow);
  const state = readState(scope, taskId);

  if (state.currentNode === null)
    return { ok: true, exitCode: 0, node: null, next: relayNext(scope, taskId, wf, state) };

  return persist(scope, taskId, task, wf, stepWorkflow(wf, state, { kind: 'skip', by, reason }));
}

// Evaluate the current skill node's gate into a guard report keyed for the engine.
function skillGuards(scope: Scope, taskId: string, node: SkillNode): GuardReport {
  const events = readEvents(scope, taskId);
  const ctx: GateContext = {
    artifactExists: rel => existsNonEmpty(taskPath(scope, taskId, rel)),
    runCheck: cmd => runCommand(cmd, scope.root),
    isApproved: () => isApproved(scope, taskId, node.id),
    hasNote: () => hasFreshNote(events, node.id),
    hasProgress: () => readProgress(scope, taskId).source !== 'none',
    hasCuratedDispatch: () => isDispatchCurated(scope, taskId),
  };
  return { [gateGuardId(node.id)]: evaluateGate(node, ctx) };
}

// A note is "fresh" when it post-dates this node's freshness floor — the latest of
// (last rewind to it, last successful completion). The append-only log keeps prior
// completions, so re-traversing a node after a rewind-to-ancestor correctly invalidates
// the stale note. No floor (first entry) → any note for the node counts.
// Exported (not in the barrel) for direct unit testing with crafted event streams.
export function hasFreshNote(events: TaskEvent[], node: string): boolean {
  let floor = '';
  for (const event of events) {
    const isFloor =
      (event.type === 'rewind' && event.node === node) ||
      (event.type === 'complete_attempt' && event.node === node && event.ok);
    if (isFloor && event.ts > floor) floor = event.ts;
  }
  return events.some(event => event.type === 'note' && event.node === node && event.ts >= floor);
}

// Append the step's events, persist its state on success, map to a NextResult.
function persist(scope: Scope, taskId: string, task: Task, wf: Workflow, result: StepResult): NextResult {
  for (const event of result.events) appendEvent(scope, taskId, event);

  if (result.ok && result.state) {
    writeState(scope, result.state);
    syncTaskStatus(scope, task, wf, result.state);
    return {
      ok: true,
      exitCode: 0,
      node: result.node,
      done: result.done,
      next: relayNext(scope, taskId, wf, result.state),
      state: result.state,
    };
  }

  return {
    ok: false,
    exitCode: 2,
    node: result.node,
    blocked: result.blocked,
    needsBranch: result.needsBranch,
    branches: result.branches,
    nextAction: result.nextAction,
  };
}

// ── rewind (switch misjudge recovery) ────────────────────────────────────────

export function rewindTo(scope: Scope, taskId: string, nodeId: string, by?: string, reason?: string): State {
  const task = readTask(scope, taskId);
  const wf = readWorkflow(scope, task.workflow);
  const state = readState(scope, taskId);

  const next = rewindState(wf, state, nodeId); // throws on unknown node
  writeState(scope, next);
  syncTaskStatus(scope, task, wf, next);
  appendEvent(scope, taskId, { ts: nowIso(), type: 'rewind', node: nodeId, by, reason });
  return next;
}

// ── approve (human gate input; agent or web may write — harness §2.6) ─────────

export function approveCurrentNode(scope: Scope, taskId: string, by: string): State {
  const state = readState(scope, taskId);
  if (state.currentNode === null) throw new Error(`task "${taskId}" has no current node to approve`);

  const next = approveState(state, by);
  writeState(scope, next);
  appendEvent(scope, taskId, { ts: nowIso(), type: 'approval', node: state.currentNode, by });
  return next;
}

// ── note (node summary; the note gate's evidence — §note gate) ────────────────

/** Append a node summary for the current node. Throws on empty summary or no current node. */
export function recordNote(scope: Scope, taskId: string, summary: string, by?: string): string {
  const trimmed = summary.trim();
  if (!trimmed) throw new Error('note summary must not be empty');

  const state = readState(scope, taskId);
  if (state.currentNode === null) throw new Error(`task "${taskId}" has no current node to annotate`);

  appendEvent(scope, taskId, { ts: nowIso(), type: 'note', node: state.currentNode, summary: trimmed, by });
  return state.currentNode;
}

// ── Task status sync + pointer cleanup ───────────────────────────────────────

function syncTaskStatus(scope: Scope, task: Task, wf: Workflow, state: State): void {
  const status = deriveStatus(wf, state.currentNode);
  const completedAt = status === 'completed' ? (task.completedAt ?? nowIso()) : null;
  if (status !== task.status || completedAt !== task.completedAt) {
    writeTask(scope, { ...task, status, completedAt });
  }
  if (state.currentNode === null) clearCurrentTaskPointer(scope); // workflow done → drop pointer
}

// ── small utils ──────────────────────────────────────────────────────────────

function runCommand(cmd: string, cwd: string): { code: number; output: string } {
  const result = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { code: result.status ?? 1, output };
}
