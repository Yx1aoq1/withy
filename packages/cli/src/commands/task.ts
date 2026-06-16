import {
  archiveTask,
  deriveStatus,
  initialState,
  listTasks,
  readDeveloper,
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
  type Task,
} from '@tuteur/core';
import type { Command } from 'commander';
import { emit, makeTaskId, requireProjectScope, resolveTaskId } from '../harness/runtime.js';

export default function registerTaskCommand(program: Command): void {
  const task = program.command('task').description('Create and manage tasks');

  task
    .command('create <title>')
    .description('Create a task (agent runs this when you describe a goal)')
    .option('-w, --workflow <id>', 'Workflow id', 'default')
    .option('-a, --assignee <slug>', 'Assignee slug (defaults to current developer)')
    .action(runCreate);

  task
    .command('list')
    .description('List tasks')
    .option('--all', 'Show all tasks (not just mine)')
    .option('--mine', 'Show only my tasks')
    .option('--status <status>', 'Filter by status')
    .option('--archived', 'Include archived tasks')
    .action(runList);

  task.command('status [task]').description('Show a task with its current node and phase').action(runStatus);

  task.command('start <task>').description('Set the current-task pointer').action(runStart);

  task.command('assign <task> <slug>').description('Reassign a task (creator unchanged)').action(runAssign);

  task
    .command('archive <task>')
    .description('Archive a task (move into archive/<YYYY-MM>/)')
    .option('--cancelled', 'Mark the task cancelled while archiving')
    .action(runArchive);
}

interface CreateOptions {
  workflow: string;
  assignee?: string;
}

function runCreate(title: string, options: CreateOptions): void {
  const scope = requireProjectScope();
  const developer = readDeveloper(scope);
  const assignee = options.assignee ?? developer?.slug;
  if (!assignee) {
    emit({ ok: false, error: 'no developer identity — run `ttur init -u <name>` or pass --assignee <slug>' }, 1);
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

  const id = makeTaskId(title);
  if (taskExists(scope, id)) {
    emit({ ok: false, error: `task already exists: ${id}` }, 1);
  }

  const now = new Date().toISOString();
  const state = { ...initialState(workflow), taskId: id };
  const task: Task = {
    id,
    title,
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

  emit({ ok: true, task: id, status: task.status, node: state.currentNode, warnings });
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
  emit({
    ok: true,
    task: task.id,
    title: task.title,
    status: task.status,
    node: state.currentNode,
    completed: state.completedNodes,
    decisions: state.decisions,
  });
}

function runStart(taskArg: string): void {
  const scope = requireProjectScope();
  if (!taskExists(scope, taskArg)) emit({ ok: false, error: `task not found: ${taskArg}` }, 1);
  writeCurrentTaskPointer(scope, taskArg);
  emit({ ok: true, task: taskArg, current: true });
}

function runAssign(taskArg: string, slug: string): void {
  const scope = requireProjectScope();
  if (!taskExists(scope, taskArg)) emit({ ok: false, error: `task not found: ${taskArg}` }, 1);
  const task = readTask(scope, taskArg);
  writeTask(scope, { ...task, assignee: slug });
  emit({ ok: true, task: taskArg, assignee: slug });
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
