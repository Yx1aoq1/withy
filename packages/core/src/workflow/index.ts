// Workflow subsystem barrel — the state machine in one place: a generic engine
// (engine.ts), the Withy policy that compiles the workflow onto it and reads it
// back (interpret.ts), the gate checker registry (gate.ts), the IO shell that
// persists steps (runtime.ts), and the static-graph validator (validate.ts).
// Only the host-facing surface is re-exported; engine/compile internals stay in
// the directory. Explicit named re-exports only (CLAUDE.md).

export { approveCurrentNode, nextNode, rewindTo, skipNode } from './runtime.js';
export type { NextOptions, NextResult } from './runtime.js';

export { describeNext, deriveStatus, initialState, nodeById, phaseOf } from './interpret.js';
export type { NextStep, BranchView } from './interpret.js';

export { validateWorkflow } from './validate.js';
export type { ValidateContext, WorkflowIssue } from './validate.js';
