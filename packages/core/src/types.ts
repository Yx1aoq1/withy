import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────
// Task (tasks/<id>/task.json) — core.md §4.1
// ──────────────────────────────────────────────────────────────────────────

export const TaskStatusSchema = z.enum(['planning', 'in_progress', 'completed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['low', 'normal', 'high']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  workflow: z.string(),
  status: TaskStatusSchema,
  creator: z.string(),
  assignee: z.string(),
  priority: TaskPrioritySchema.default('normal'),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  completedAt: z.string().nullable().default(null),
  archivedAt: z.string().nullable().default(null),
});
export type Task = z.infer<typeof TaskSchema>;

// ──────────────────────────────────────────────────────────────────────────
// State (tasks/<id>/state.json) — core.md §4.2
// ──────────────────────────────────────────────────────────────────────────

export const DecisionRecordSchema = z.object({
  branch: z.string(),
  reason: z.string().optional(),
  by: z.string().optional(),
  at: z.string(),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

// Human approval records live inside state (gate input), keyed by node id.
export const ApprovalRecordSchema = z.object({ approvedAt: z.string(), by: z.string() });
export const ApprovalsSchema = z.record(ApprovalRecordSchema).default({});
export type Approvals = z.infer<typeof ApprovalsSchema>;

export const StateSchema = z.object({
  taskId: z.string(),
  currentNode: z.string().nullable(),
  completedNodes: z.array(z.string()).default([]),
  decisions: z.record(DecisionRecordSchema).default({}),
  approvals: ApprovalsSchema,
  updatedAt: z.string(),
});
export type State = z.infer<typeof StateSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Workflow (workflows/<id>.workflow.json) — core.md §4.3
// Fixed three phases + two node types (skill | switch).
// ──────────────────────────────────────────────────────────────────────────

// Canvas coordinate of a node (free-form layout). Persisted for the editor to
// restore positions; never participates in validation — web §3.3, core §4.3.
export const PositionSchema = z.object({ x: z.number(), y: z.number() });
export type Position = z.infer<typeof PositionSchema>;

// A gate artifact: a bare path (back-compat) or an object adding a display title
// and a template knowledge-id reference. The gate only checks `path` (exists +
// non-empty); title/template are for display and template injection — core §4.3.1.
export const ArtifactSpecSchema = z.union([
  z.string(),
  z.object({ path: z.string(), title: z.string().optional(), template: z.string().optional() }),
]);
export type ArtifactSpec = z.infer<typeof ArtifactSpecSchema>;

export const GateSchema = z.object({
  artifacts: z.array(ArtifactSpecSchema).optional(),
  checks: z.array(z.string()).optional(),
  approval: z.boolean().optional(),
});
export type Gate = z.infer<typeof GateSchema>;

export const SkillNodeSchema = z.object({
  id: z.string(),
  type: z.literal('skill'),
  skill: z.string(),
  next: z.string().nullable(),
  phase: z.string().nullable().optional(),
  pos: PositionSchema.optional(),
  gate: GateSchema.optional(),
});
export type SkillNode = z.infer<typeof SkillNodeSchema>;

export const BranchSchema = z.object({
  label: z.string(),
  criteria: z.string().optional(),
  next: z.string().nullable(),
  default: z.boolean().optional(),
});
export type Branch = z.infer<typeof BranchSchema>;

export const SwitchNodeSchema = z.object({
  id: z.string(),
  type: z.literal('switch'),
  phase: z.string().nullable().optional(),
  pos: PositionSchema.optional(),
  branches: z.array(BranchSchema).min(1),
});
export type SwitchNode = z.infer<typeof SwitchNodeSchema>;

export const WorkflowNodeSchema = z.discriminatedUnion('type', [SkillNodeSchema, SwitchNodeSchema]);
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const PhaseSchema = z.object({
  id: z.string(),
  label: z.string(),
  entry: z.string().optional(),
});
export type Phase = z.infer<typeof PhaseSchema>;

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  version: z.string().optional(),
  entry: z.string(),
  phases: z.array(PhaseSchema).default([]),
  nodes: z.array(WorkflowNodeSchema).min(1),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Events (tasks/<id>/events.jsonl) — core.md §4.4
// ──────────────────────────────────────────────────────────────────────────

export const TaskEventSchema = z.discriminatedUnion('type', [
  z.object({
    ts: z.string(),
    type: z.literal('complete_attempt'),
    node: z.string(),
    ok: z.boolean(),
    reason: z.string().optional(),
  }),
  z.object({
    ts: z.string(),
    type: z.literal('decision'),
    node: z.string(),
    branch: z.string(),
    reason: z.string().optional(),
    by: z.string().optional(),
  }),
  z.object({
    ts: z.string(),
    type: z.literal('rewind'),
    node: z.string(),
    by: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    ts: z.string(),
    type: z.literal('skip'),
    node: z.string(),
    by: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({ ts: z.string(), type: z.literal('approval'), node: z.string(), by: z.string().optional() }),
  z.object({ ts: z.string(), type: z.literal('session_start'), injected: z.array(z.string()) }),
]);
export type TaskEvent = z.infer<typeof TaskEventSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Checklist (tasks/<id>/checklist.json) — core.md §4.7
// Structured acceptance items: validated, web-renderable, never a hard gate.
// ──────────────────────────────────────────────────────────────────────────

export const ChecklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean().default(false),
  // The node this item accepts (optional; lets web group by node).
  node: z.string().optional(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const ChecklistSchema = z.object({ items: z.array(ChecklistItemSchema).default([]) });
export type Checklist = z.infer<typeof ChecklistSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Context config (context.json) — core.md §4.5
// ──────────────────────────────────────────────────────────────────────────

const ContextSetSchema = z.object({
  required: z.array(z.string()).default([]),
  optional: z.array(z.string()).default([]),
  disabled: z.array(z.string()).default([]),
});

export const ContextConfigSchema = z.object({
  default: ContextSetSchema.default({ required: [], optional: [], disabled: [] }),
  nodes: z.record(ContextSetSchema).default({}),
});
export type ContextConfig = z.infer<typeof ContextConfigSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Local developer identity (.developer) — core.md §3
// ──────────────────────────────────────────────────────────────────────────

export const DeveloperSchema = z.object({
  name: z.string(),
  slug: z.string(),
  initializedAt: z.string().optional(),
});
export type Developer = z.infer<typeof DeveloperSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Global project registry (~/.tuteur/projects.json) — core.md §2.1
// The global root is config + project registry + templates; it holds no tasks.
// ──────────────────────────────────────────────────────────────────────────

// A registered project in the global multi-project registry (web dashboard source).
export const ProjectRefSchema = z.object({
  path: z.string(),
  name: z.string(),
  addedAt: z.string(),
});
export type ProjectRef = z.infer<typeof ProjectRefSchema>;

export const ProjectsRegistrySchema = z.object({ projects: z.array(ProjectRefSchema).default([]) });
export type ProjectsRegistry = z.infer<typeof ProjectsRegistrySchema>;
