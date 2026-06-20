import {
  archiveTask,
  describeNext,
  deriveStatus,
  initialState,
  listTasks,
  readDeveloper,
  readGitStatus,
  listTaskArtifacts,
  readKnowledgeEntry,
  readState,
  readTask,
  readWorkflow,
  skillExists,
  taskExists,
  validateWorkflow,
  writeCurrentTaskPointer,
  writeState,
  writeTask,
  type NextStep,
  type Task,
} from '@withy/core';
import type { Command } from 'commander';
import { emit, makeTaskId, requireProjectScope, resolveTaskId } from '../harness/runtime.js';

export default function registerTaskCommand(program: Command): void {
  const task = program.command('task').description('Start and manage tasks');

  task
    .command('list')
    .description('List tasks')
    .option('--all', 'Show all tasks (not just mine)')
    .option('--mine', 'Show only my tasks')
    .option('--status <status>', 'Filter by status')
    .option('--archived', 'Include archived tasks')
    .action(runList);

  task.command('status [task]').description('Show a task with its current node and phase').action(runStatus);

  task
    .command('start <title-or-id>')
    .description('Focus an existing task id, or create a task from a new title')
    .option('-w, --workflow <id>', 'Workflow id for a new task', 'default')
    .option('-a, --assignee <slug>', 'Assignee slug for a new task (defaults to current developer)')
    .action(runStart);

  task
    .command('archive <task>')
    .description('Archive a task (move into archive/<YYYY-MM>/)')
    .option('--cancelled', 'Mark the task cancelled while archiving')
    .action(runArchive);
}

interface StartOptions {
  workflow: string;
  assignee?: string;
}

function runStart(titleOrId: string, options: StartOptions): void {
  const scope = requireProjectScope();
  if (taskExists(scope, titleOrId)) {
    writeCurrentTaskPointer(scope, titleOrId);
    emit({ ok: true, task: titleOrId, current: true });
  }

  const developer = readDeveloper(scope);
  const assignee = options.assignee ?? developer?.slug;
  if (!assignee) {
    emit({ ok: false, error: 'no developer identity — run `withy init -u <name>` or pass --assignee <slug>' }, 1);
  }
  const creator = developer?.slug ?? assignee;

  let workflow;
  try {
    workflow = readWorkflow(scope, options.workflow);
  } catch (error) {
    emit({ ok: false, error: `workflow "${options.workflow}" not found: ${(error as Error).message}` }, 1);
  }

  // Refuse to start a task on a structurally broken workflow; surface dangling
  // skill/template refs as warnings (they may resolve later). harness §3/H10.
  const issues = validateWorkflow(workflow, {
    skillExists: name => skillExists(scope, name),
    templateExists: templateId => readKnowledgeEntry(scope, templateId) !== null,
  });
  const errors = issues.filter(issue => issue.level === 'error');
  if (errors.length > 0) {
    emit({ ok: false, error: `workflow "${workflow.id}" is invalid`, issues: errors }, 1);
  }
  const warnings = issues.filter(issue => issue.level === 'warning').map(issue => issue.message);

  const id = makeTaskId(titleOrId);
  if (taskExists(scope, id)) {
    emit({ ok: false, error: `task already exists: ${id}` }, 1);
  }

  const now = new Date().toISOString();
  const state = { ...initialState(workflow), taskId: id };
  const task: Task = {
    id,
    title: titleOrId,
    workflow: workflow.id,
    status: deriveStatus(workflow, state.currentNode),
    creator,
    assignee,
    priority: 'normal',
    tags: [],
    createdAt: now,
    completedAt: null,
    archivedAt: null,
  };

  writeTask(scope, task);
  writeState(scope, state);
  writeCurrentTaskPointer(scope, id);

  emit({ ok: true, task: id, created: true, status: task.status, node: state.currentNode, warnings });
}

interface ListOptions {
  all?: boolean;
  mine?: boolean;
  status?: string;
  archived?: boolean;
}

function runList(options: ListOptions): void {
  const scope = requireProjectScope();
  const developer = readDeveloper(scope);
  const mine = options.mine ?? !options.all;

  let tasks = listTasks(scope, { includeArchived: options.archived });
  if (mine && developer) tasks = tasks.filter(t => t.assignee === developer.slug || t.creator === developer.slug);
  if (options.status) tasks = tasks.filter(t => t.status === options.status);

  emit({
    ok: true,
    tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status, assignee: t.assignee, priority: t.priority })),
  });
}

function runStatus(taskArg: string | undefined): void {
  const scope = requireProjectScope();
  const id = resolveTaskId(scope, taskArg);
  const task = readTask(scope, id);
  const state = readState(scope, id);
  const next = describeNext(readWorkflow(scope, task.workflow), state);
  const git = readGitStatus(scope.root);
  emit({
    ok: true,
    task: task.id,
    title: task.title,
    status: task.status,
    node: state.currentNode,
    phase: next.phase ?? null,
    skill: next.skill,
    completed: state.completedNodes,
    decisions: state.decisions,
    artifacts: listTaskArtifacts(scope, id),
    git: git.isRepo ? { dirty: git.dirtyCount > 0, changedFiles: git.changedFiles } : null,
    nextAction: statusGuidance(next),
  });
}

// Soft Next-Action for `task status`: a skill node nudges the agent to reconcile
// the working tree against the plan before advancing (progress lives in the code,
// not in memory); switch/done relay their own move. Advisory only — never a gate.
function statusGuidance(next: NextStep): string {
  if (next.node === null) return next.message ?? 'workflow complete — run `withy task archive <id>`';
  if (next.type === 'switch') return 'decide a branch, then `withy next --branch <label> --reason "..."`';
  return (
    `read the \`${next.skill}\` skill, then reconcile your working-tree changes against the plan to see what is ` +
    'left for this step; run `withy next` only once it is genuinely done'
  );
}

interface ArchiveOptions {
  cancelled?: boolean;
}

function runArchive(taskArg: string, options: ArchiveOptions): void {
  const scope = requireProjectScope();
  if (!taskExists(scope, taskArg)) emit({ ok: false, error: `task not found: ${taskArg}` }, 1);
  try {
    archiveTask(scope, taskArg, { markCancelled: options.cancelled });
  } catch (error) {
    emit({ ok: false, error: (error as Error).message }, 1);
  }
  emit({ ok: true, task: taskArg, archived: true, cancelled: Boolean(options.cancelled) });
}
