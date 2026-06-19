import { getBundledSkillName, PHASE_PLANNING } from '../constants.js';
import { logicalSkillName } from '../skills.js';
import { nowIso } from '../utils/index.js';
import { rewind, send } from './engine.js';
import type { Cursor, GuardReport, MachineDef } from './engine.js';
import type { ArtifactSpec, State, TaskEvent, TaskStatus, Workflow, WorkflowNode } from '../types.js';

// ──────────────────────────────────────────────────────────────────────────
// Withy ⇆ generic engine adapter. This is the ONLY module that understands the
// Withy workflow schema (skill/switch/gate/branch/default). It compiles a
// Workflow into the generic MachineDef, interprets engine results back into
// Withy state + events, and answers schema queries. The engine (engine.ts) and
// the gate checkers (gate.ts) stay free of these concerns; change business
// fields here, not there.
// ──────────────────────────────────────────────────────────────────────────

// The implicit event a skill node / `withy next` (no branch) sends.
export const ADVANCE = 'advance';

// Guard id for a skill node's gate (compile + runtime must agree on the key).
export const gateGuardId = (nodeId: string): string => `gate:${nodeId}`;

// ── Schema queries ─────────────────────────────────────────────────────────

export function nodeById(wf: Workflow, id: string): WorkflowNode | undefined {
  return wf.nodes.find(n => n.id === id);
}

/** The path a gate checks for an artifact spec (bare path, or the `path` field). */
export function artifactPath(spec: ArtifactSpec): string {
  return typeof spec === 'string' ? spec : spec.path;
}

/** A node's phase membership (the container it lives in); null = pre-phase triage. */
export function phaseOf(wf: Workflow, nodeId: string | null): string | null {
  if (!nodeId) return null;
  return nodeById(wf, nodeId)?.phase ?? null;
}

/** Macro task status derived from the current node's phase container. */
export function deriveStatus(wf: Workflow, currentNode: string | null): TaskStatus {
  if (currentNode === null) return 'completed';
  const phase = phaseOf(wf, currentNode);
  if (phase === null || phase === PHASE_PLANNING) return 'planning';
  return 'in_progress';
}

export function initialState(wf: Workflow): State {
  return { taskId: '', currentNode: wf.entry, completedNodes: [], decisions: {}, approvals: {}, updatedAt: nowIso() };
}

// ── Compile Workflow → generic machine ──────────────────────────────────────

/**
 * Flatten the Withy workflow into the engine's generic shape: a skill node
 * becomes one guarded `advance` edge (its gate → a guard ref); a switch node
 * becomes one edge per branch keyed by the branch label, with `default` marked.
 */
export function compileWorkflow(wf: Workflow): MachineDef {
  return {
    initial: wf.entry,
    nodes: wf.nodes.map(node =>
      node.type === 'switch'
        ? { id: node.id, transitions: node.branches.map(b => ({ on: b.label, target: b.next, default: b.default })) }
        : {
            id: node.id,
            transitions: [
              { on: ADVANCE, target: node.next, guard: node.gate ? gateGuardId(node.id) : undefined, default: true },
            ],
          },
    ),
  };
}

// ── State ⇆ cursor mapping ───────────────────────────────────────────────────

function cursorOf(state: State): Cursor {
  return { current: state.currentNode, visited: state.completedNodes };
}

function applyCursor(state: State, cursor: Cursor): State {
  return { ...state, currentNode: cursor.current, completedNodes: cursor.visited, updatedAt: nowIso() };
}

// ── Step (pure policy: action → engine event → Withy state + events) ─────────

export interface BranchView {
  label: string;
  criteria?: string;
  default?: boolean;
}

export interface NextStep {
  node: string | null;
  type?: 'skill' | 'switch';
  skill?: string;
  phase?: string | null;
  branches?: BranchView[];
  message?: string;
}

export interface StepResult {
  ok: boolean;
  node: string | null;
  done?: string;
  blocked?: string[];
  needsBranch?: boolean;
  branches?: BranchView[];
  nextAction?: string;
  state?: State;
  events: TaskEvent[];
}

// One thing the host wants to do at the current node.
export type WorkflowAction =
  | { kind: 'advance' }
  | { kind: 'branch'; label: string; reason?: string; by?: string }
  | { kind: 'skip'; reason: string; by?: string };

function toBranchView(b: { label: string; criteria?: string; default?: boolean }): BranchView {
  return { label: b.label, criteria: b.criteria, default: b.default };
}

function failEvent(node: string, reasons: string[]): TaskEvent {
  return { ts: nowIso(), type: 'complete_attempt', node, ok: false, reason: reasons.join('; ') };
}

/**
 * Drive the compiled machine for one action and translate the engine's result
 * into Withy events + next state. Pure: guard results for the current node are
 * injected (the IO that computes them lives in runtime.ts). harness §2/§3.
 */
export function stepWorkflow(wf: Workflow, state: State, action: WorkflowAction, guards: GuardReport = {}): StepResult {
  const nodeId = state.currentNode;
  if (nodeId === null) return { ok: true, node: null, events: [] };

  const node = nodeById(wf, nodeId);
  if (!node) {
    const reasons = [`"${nodeId}" is not a node in workflow "${wf.id}"`];
    return { ok: false, node: nodeId, blocked: reasons, events: [failEvent(nodeId, reasons)] };
  }

  const def = compileWorkflow(wf);
  const eventName = action.kind === 'branch' ? action.label : ADVANCE;
  const result = send(def, cursorOf(state), eventName, guards, { forced: action.kind === 'skip' });

  if (result.status === 'moved') {
    let nextState = applyCursor(state, result.cursor);
    let event: TaskEvent;
    if (action.kind === 'branch') {
      nextState = {
        ...nextState,
        decisions: {
          ...state.decisions,
          [nodeId]: { branch: action.label, reason: action.reason, by: action.by, at: nowIso() },
        },
      };
      event = {
        ts: nowIso(),
        type: 'decision',
        node: nodeId,
        branch: action.label,
        reason: action.reason,
        by: action.by,
      };
    } else if (action.kind === 'skip') {
      event = { ts: nowIso(), type: 'skip', node: nodeId, by: action.by, reason: action.reason };
    } else {
      event = { ts: nowIso(), type: 'complete_attempt', node: nodeId, ok: true };
    }
    return { ok: true, node: nodeId, done: nodeId, state: nextState, events: [event] };
  }

  if (result.status === 'blocked') {
    return { ok: false, node: nodeId, blocked: result.reasons, events: [failEvent(nodeId, result.reasons)] };
  }

  // unhandled: an event matched no edge. For a switch that means "no/invalid branch".
  if (node.type === 'switch') {
    const labels = node.branches.map(b => b.label).join(' | ');
    if (action.kind !== 'branch') {
      const reasons = [`switch "${nodeId}" needs --branch <${labels}>`];
      return {
        ok: false,
        node: nodeId,
        blocked: reasons,
        needsBranch: true,
        branches: node.branches.map(toBranchView),
        nextAction: 'withy next --branch <label> --reason "..." --json',
        events: [failEvent(nodeId, reasons)],
      };
    }
    const reasons = [`"${action.label}" is not a branch of "${nodeId}"; valid: ${labels}`];
    return { ok: false, node: nodeId, blocked: reasons, events: [failEvent(nodeId, reasons)] };
  }

  const reasons = [`"${nodeId}" has no transition for "${eventName}"`];
  return { ok: false, node: nodeId, blocked: reasons, events: [failEvent(nodeId, reasons)] };
}

/**
 * Rewind to `nodeId` (switch misjudge recovery): the engine drops the cursor +
 * downstream visited; here we also drop that node's decision and prune approvals
 * to whatever stays completed. harness §3.1.
 */
export function rewindState(wf: Workflow, state: State, nodeId: string): State {
  const cursor = rewind(compileWorkflow(wf), cursorOf(state), nodeId); // throws on unknown node
  const decisions = { ...state.decisions };
  delete decisions[nodeId];
  const approvals = Object.fromEntries(Object.entries(state.approvals).filter(([n]) => cursor.visited.includes(n)));
  return { ...applyCursor(state, cursor), decisions, approvals };
}

/** Record human approval for the current node (gate input; harness §2.6). Throws if done. */
export function approveState(state: State, by: string): State {
  const nodeId = state.currentNode;
  if (nodeId === null) throw new Error('no current node to approve');
  return { ...state, approvals: { ...state.approvals, [nodeId]: { approvedAt: nowIso(), by } }, updatedAt: nowIso() };
}

// ── Next-step rendering (agent-facing relay) ──────────────────────────────────

export function describeNext(wf: Workflow, state: State): NextStep {
  if (state.currentNode === null) {
    return { node: null, message: 'workflow complete — run "withy task archive <id>"' };
  }
  const node = nodeById(wf, state.currentNode);
  if (!node) return { node: state.currentNode, message: 'unknown node' };
  if (node.type === 'switch') {
    return { node: node.id, type: 'switch', phase: node.phase ?? null, branches: node.branches.map(toBranchView) };
  }
  // Relay the agent-invocable skill name. Workflows now store the real installed
  // name (e.g. `withy-dev`); normalize idempotently so legacy logical names
  // (`dev`) still resolve and a real name never double-prefixes.
  return {
    node: node.id,
    type: 'skill',
    skill: getBundledSkillName(logicalSkillName(node.skill)),
    phase: node.phase ?? null,
  };
}
