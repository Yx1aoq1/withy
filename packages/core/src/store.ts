import { readdirSync, existsSync, rmSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { z } from 'zod';
import { EVENT_REASON_MAX } from './constants.js';
import {
  type Scope,
  currentTaskPointerPath,
  projectsRegistryPath,
  knowledgeWikiPath,
  knowledgeDir,
  workflowPath,
  archiveDir,
  guidePath,
  taskPath,
  tasksDir,
} from './paths.js';
import {
  type ProjectsRegistry,
  type ContextConfig,
  type ImplementationPlan,
  type Developer,
  type ProjectRef,
  type TaskEvent,
  type Workflow,
  type State,
  type Task,
  ProjectsRegistrySchema,
  ContextConfigSchema,
  DeveloperSchema,
  TaskEventSchema,
  WorkflowSchema,
  StateSchema,
  TaskSchema,
} from './types.js';
import {
  readTextFileIfExists,
  appendJsonlLine,
  writeJsonFile,
  writeTextFile,
  readJsonFile,
  readTextFile,
  nowIso,
} from './utils/index.js';

/** Raised when a `.tuteur/` file is missing or fails schema validation. */
export class StoreError extends Error {}

function readValidated<S extends z.ZodTypeAny>(path: string, schema: S, label: string): z.output<S> {
  let raw: unknown;
  try {
    raw = readJsonFile(path);
  } catch (error) {
    throw new StoreError(`${label}: ${(error as Error).message}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new StoreError(
      `${label} failed validation: ${path}\n  ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n  ')}`,
    );
  }
  return parsed.data;
}

// ── Tasks ──────────────────────────────────────────────────────────────────

// 归档后任务目录会移入 archive/YYYY-MM/<id>/(task.ts archiveTask)。按 id 读取时优先 live 路径,
// 缺失则回退遍历归档桶,让 web 等只读消费方能按 id 读到已归档任务的 task/state/implement/events。
// 写入始终用 live taskPath —— 不回退,杜绝往归档任务写盘。
function taskReadPath(scope: Scope, id: string, rel: string): string {
  const live = taskPath(scope, id, rel);
  if (existsSync(live)) return live;

  const archive = archiveDir(scope);
  if (existsSync(archive)) {
    for (const bucket of readdirSync(archive, { withFileTypes: true })) {
      if (!bucket.isDirectory()) continue;
      const candidate = resolve(archive, bucket.name, id, rel);
      if (existsSync(candidate)) return candidate;
    }
  }

  return live; // 都不存在:返回 live 路径,交由调用方按缺失处理(校验读抛错、可选读返回默认)
}

export function readTask(scope: Scope, id: string): Task {
  return readValidated(taskReadPath(scope, id, 'task.json'), TaskSchema, 'task.json');
}

export function writeTask(scope: Scope, task: Task): void {
  writeJsonFile(taskPath(scope, task.id, 'task.json'), task);
}

export function taskExists(scope: Scope, id: string): boolean {
  return existsSync(taskPath(scope, id, 'task.json'));
}

export interface ListTasksOptions {
  includeArchived?: boolean;
}

export function listTasks(scope: Scope, options: ListTasksOptions = {}): Task[] {
  const tasks: Task[] = [];
  const root = tasksDir(scope);
  if (existsSync(root)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'archive') continue;
      if (existsSync(resolve(root, entry.name, 'task.json'))) tasks.push(readTask(scope, entry.name));
    }
  }
  if (options.includeArchived) {
    const archive = archiveDir(scope);
    if (existsSync(archive)) {
      for (const bucket of readdirSync(archive, { withFileTypes: true })) {
        if (!bucket.isDirectory()) continue;
        const bucketDir = resolve(archive, bucket.name);
        for (const entry of readdirSync(bucketDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const file = resolve(bucketDir, entry.name, 'task.json');
          if (existsSync(file)) tasks.push(readValidated(file, TaskSchema, 'task.json'));
        }
      }
    }
  }
  return tasks.sort((a, b) => a.id.localeCompare(b.id));
}

// ── State ──────────────────────────────────────────────────────────────────

export function readState(scope: Scope, id: string): State {
  return readValidated(taskReadPath(scope, id, 'state.json'), StateSchema, 'state.json');
}

export function writeState(scope: Scope, state: State): void {
  writeJsonFile(taskPath(scope, state.taskId, 'state.json'), state);
}

// ── Workflow ─────────────────────────────────────────────────────────────────

export function readWorkflow(scope: Scope, id: string): Workflow {
  return readValidated(workflowPath(scope, id), WorkflowSchema, `workflow ${id}`);
}

/**
 * Persist a workflow graph to `workflows/<id>.workflow.json`. Schema-validates
 * before writing so a malformed edit (e.g. from the web canvas) never lands on
 * disk; structural/reference checks (connectivity, cycles, skill refs) are the
 * caller's job via {@link validateWorkflow}. core.md §4.3.
 *
 * @param scope the project scope to write into
 * @param workflow the workflow to persist (its `id` picks the file name)
 */
export function writeWorkflow(scope: Scope, workflow: Workflow): void {
  const parsed = WorkflowSchema.safeParse(workflow);
  if (!parsed.success) {
    throw new StoreError(
      `workflow ${workflow.id} failed validation:\n  ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n  ')}`,
    );
  }
  writeJsonFile(workflowPath(scope, parsed.data.id), parsed.data);
}

// ── Events (append-only, single-process; no lock — core.md §4.4) ─────────────

export function appendEvent(scope: Scope, taskId: string, event: TaskEvent): void {
  appendJsonlLine(taskPath(scope, taskId, 'events.jsonl'), truncateReason(event));
}

export function readEvents(scope: Scope, taskId: string): TaskEvent[] {
  const file = taskReadPath(scope, taskId, 'events.jsonl');
  if (!existsSync(file)) return [];
  const events: TaskEvent[] = [];
  for (const line of readTextFile(file).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = TaskEventSchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) events.push(parsed.data); // tolerate stray lines in the log
    } catch {
      // skip malformed event line — the timeline should survive one bad row
    }
  }
  return events;
}

function truncateReason(event: TaskEvent): TaskEvent {
  if ('reason' in event && typeof event.reason === 'string' && event.reason.length > EVENT_REASON_MAX) {
    return { ...event, reason: `${event.reason.slice(0, EVENT_REASON_MAX)}…` };
  }
  return event;
}

// ── Approvals (stored inside state.json — gate input) ────────────────────────

export function isApproved(scope: Scope, taskId: string, node: string): boolean {
  return Boolean(readState(scope, taskId).approvals[node]);
}

// ── Implementation plan (tasks/<id>/implement.md — agent-maintained, §4.7) ──

export function readImplementation(scope: Scope, taskId: string): ImplementationPlan {
  const content = readTextFileIfExists(taskReadPath(scope, taskId, 'implement.md'));
  if (content === null) return { items: [], unparsed: 0 };

  const items: ImplementationPlan['items'] = [];
  let unparsed = 0;
  for (const [index, line] of content.split('\n').entries()) {
    const checkbox = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
    if (checkbox) {
      items.push({ id: `line-${index + 1}`, text: checkbox[2], done: checkbox[1].toLowerCase() === 'x' });
    } else if (/^\s*[-*+]\s+/.test(line)) {
      unparsed += 1;
    }
  }
  return { items, unparsed };
}

// ── Context config ───────────────────────────────────────────────────────────

export function readContextConfig(scope: Scope): ContextConfig {
  const file = resolve(scope.tuteurDir, 'context.json');
  if (!existsSync(file)) return ContextConfigSchema.parse({});
  return readValidated(file, ContextConfigSchema, 'context.json');
}

// ── Session guide (.tuteur/guide.md — tool-level intro, injected verbatim) ───

export function readGuide(scope: Scope): string | null {
  return readTextFileIfExists(guidePath(scope));
}

// ── Knowledge entries (raw markdown; frontmatter parsed in knowledge.ts) ─────

export function readKnowledgeSource(scope: Scope, id: string): string | null {
  return readTextFileIfExists(knowledgeWikiPath(scope, id));
}

// One wiki page file on disk (raw; frontmatter parsed in knowledge.ts).
export interface KnowledgeFile {
  // File basename without the .md extension (the default entry id).
  id: string;

  // Path relative to knowledge/wiki/, posix separators (e.g. "api.md", "backend/api.md").
  wikiRelPath: string;

  // Raw file contents.
  raw: string;
}

/**
 * List every wiki page under `knowledge/wiki/` (recursive), skipping the generated
 * `index.md` navigation files. Returns raw contents for knowledge.ts to parse.
 *
 * @param scope target scope (project or global)
 * @return one entry per page; empty when there is no wiki dir
 */
export function listKnowledgeFiles(scope: Scope): KnowledgeFile[] {
  const wikiRoot = resolve(knowledgeDir(scope), 'wiki');
  if (!existsSync(wikiRoot)) return [];

  const files: KnowledgeFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
        files.push({
          id: entry.name.slice(0, -'.md'.length),
          wikiRelPath: relative(wikiRoot, full).split(/[\\/]/).join('/'),
          raw: readTextFile(full),
        });
      }
    }
  };

  walk(wikiRoot);
  return files;
}

/** Write text to a path relative to `knowledge/` (creates parents). Backs `ttur knowledge index`. */
export function writeKnowledgeFile(scope: Scope, relPath: string, content: string): void {
  writeTextFile(resolve(knowledgeDir(scope), relPath), content);
}

// ── Developer identity ───────────────────────────────────────────────────────

export function readDeveloper(scope: Scope): Developer | null {
  const file = resolve(scope.tuteurDir, '.developer');
  if (!existsSync(file)) return null;
  return readValidated(file, DeveloperSchema, '.developer');
}

// ── Global root: project registry (core.md §2.1) ─────────────────────────────

export function readProjects(scope: Scope): ProjectsRegistry {
  const file = projectsRegistryPath(scope);
  if (!existsSync(file)) return ProjectsRegistrySchema.parse({});
  return readValidated(file, ProjectsRegistrySchema, 'projects.json');
}

/**
 * Look up a registered project by its (URL-identity) name. Names are the unique
 * key the web dashboard routes on (`/<name>`), so the add flow checks this to
 * reject duplicates before registering. core.md §2.1, web.md §2.1.
 *
 * @param scope global scope holding the registry
 * @param name project name to match (exact)
 * @return the matching project, or null when the name is free
 */
export function findProjectByName(scope: Scope, name: string): ProjectRef | null {
  return readProjects(scope).projects.find(entry => entry.name === name) ?? null;
}

/** Register (or refresh) a project in the global registry, deduped by path. */
export function upsertProject(scope: Scope, project: { path: string; name: string }): ProjectsRegistry {
  const registry = readProjects(scope);
  const existing = registry.projects.find(entry => entry.path === project.path);
  if (existing) {
    existing.name = project.name;
  } else {
    registry.projects.push({ path: project.path, name: project.name, addedAt: nowIso() });
  }
  writeJsonFile(projectsRegistryPath(scope), registry);
  return registry;
}

// ── Current-task pointer (runtime/current-task.json) ─────────────────────────

export function readCurrentTaskPointer(scope: Scope): string | null {
  const file = currentTaskPointerPath(scope);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readTextFile(file)) as { taskId?: unknown };
    return typeof raw.taskId === 'string' ? raw.taskId : null;
  } catch {
    return null;
  }
}

export function writeCurrentTaskPointer(scope: Scope, taskId: string): void {
  writeJsonFile(currentTaskPointerPath(scope), { taskId, updatedAt: nowIso() });
}

export function clearCurrentTaskPointer(scope: Scope): void {
  const file = currentTaskPointerPath(scope);
  if (existsSync(file)) rmSync(file);
}
