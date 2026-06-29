import { artifactPath } from './interpret.js';
import type { Gate, SkillNode } from '../types.js';

// ──────────────────────────────────────────────────────────────────────────
// Gate evaluation as a checker registry. Each checker turns one gate facet into
// a list of blocking reasons (empty = pass). Adding a gate kind = adding a
// checker + a Gate field — no edits to the engine or the step policy. IO is
// injected via GateContext so this module stays unit-testable without fs/spawn.
// ──────────────────────────────────────────────────────────────────────────

export interface GateContext {
  // Does the artifact at this task-relative path exist and is non-empty?
  artifactExists(relPath: string): boolean;
  // Run a check command; only the exit code + output tail matter.
  runCheck(cmd: string): { code: number; output: string };
  // Has the current node been approved? (bound to the node by the caller)
  isApproved(): boolean;
  // Has a node summary been recorded for the current round of this node?
  hasNote(): boolean;
  // Does a non-empty implementation plan exist (checklist.json)?
  hasProgress(): boolean;
  // Does the task's dispatch.json have ≥1 real `read` entry (curation gate)?
  hasCuratedDispatch(): boolean;
}

type GateChecker = (gate: Gate, ctx: GateContext) => string[];

const artifactsChecker: GateChecker = (gate, ctx) =>
  (gate.artifacts ?? []).flatMap(spec => {
    const rel = artifactPath(spec);
    return ctx.artifactExists(rel) ? [] : [`missing or empty artifact: ${rel}`];
  });

const checksChecker: GateChecker = (gate, ctx) =>
  (gate.checks ?? []).flatMap(cmd => {
    const { code, output } = ctx.runCheck(cmd);
    return code === 0 ? [] : [`check failed (exit ${code}): ${cmd}\n${tail(output)}`];
  });

const approvalChecker: GateChecker = (gate, ctx) =>
  gate.approval && !ctx.isApproved() ? ['needs approval: run "withy approve --json"'] : [];

const noteChecker: GateChecker = (gate, ctx) =>
  gate.note && !ctx.hasNote() ? ['record a node summary: run "withy note \\"<summary>\\""'] : [];

const progressChecker: GateChecker = (gate, ctx) =>
  gate.progress && !ctx.hasProgress() ? ['missing implementation plan: run "withy checklist add \\"<step>\\""'] : [];

const curatedChecker: GateChecker = (gate, ctx) =>
  gate.curated && !ctx.hasCuratedDispatch()
    ? ["curate the dispatch reading list: fill dispatch.json's `read` (knowledge ids / artifacts)"]
    : [];

const CHECKERS: GateChecker[] = [
  artifactsChecker,
  checksChecker,
  approvalChecker,
  noteChecker,
  progressChecker,
  curatedChecker,
];

/** Evaluate a skill node's gate. Empty `reasons` = pass; reasons block the step. */
export function evaluateGate(node: SkillNode, ctx: GateContext): { ok: boolean; reasons: string[] } {
  const gate = node.gate ?? {};
  const reasons = CHECKERS.flatMap(checker => checker(gate, ctx));
  return { ok: reasons.length === 0, reasons };
}

function tail(text: string, lines = 10): string {
  return text.split('\n').slice(-lines).join('\n').trim();
}
