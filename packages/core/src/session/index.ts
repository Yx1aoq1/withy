// Session assembly module — composes business modules (task/workflow/knowledge +
// context) into host-facing capabilities (session-start injection). Pure
// orchestration; touches no fs. Explicit named re-exports only (CLAUDE.md).

export { renderUserPromptSubmit, renderSessionStart } from './hook.js';
export type { SessionStartResult } from './hook.js';

export { resolvePlannedContext } from './context.js';
export type { PlannedEntry } from './context.js';
