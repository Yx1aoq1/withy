import { checklistProgress, addChecklistItem, setChecklistItem, readChecklist } from '@tuteur/core';
import type { Command } from 'commander';
import { emit, requireProjectScope, resolveTaskId } from '../harness/runtime.js';

export default function registerCheckCommand(program: Command): void {
  const check = program.command('check').description('Manage the task acceptance checklist (checklist.json)');

  check.command('list').description('List acceptance items').option('--task <id>', 'Target task').action(runList);

  check
    .command('add <text>')
    .description('Add an acceptance item (agent writes these during planning)')
    .option('--node <id>', 'Node this item accepts')
    .option('--task <id>', 'Target task')
    .action(runAdd);

  check
    .command('done <item>')
    .description('Mark an item done')
    .option('--task <id>', 'Target task')
    .action((item: string, options: TaskOption) => runSet(item, options, true));

  check
    .command('undo <item>')
    .description('Mark an item not done')
    .option('--task <id>', 'Target task')
    .action((item: string, options: TaskOption) => runSet(item, options, false));
}

interface TaskOption {
  task?: string;
}

interface AddOptions extends TaskOption {
  node?: string;
}

function runList(options: TaskOption): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  emit({
    ok: true,
    task: taskId,
    progress: checklistProgress(scope, taskId),
    items: readChecklist(scope, taskId).items,
  });
}

function runAdd(text: string, options: AddOptions): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  const { id } = addChecklistItem(scope, taskId, text, options.node);
  emit({ ok: true, task: taskId, added: id, progress: checklistProgress(scope, taskId) });
}

function runSet(item: string, options: TaskOption, done: boolean): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  try {
    setChecklistItem(scope, taskId, item, done);
  } catch (error) {
    emit({ ok: false, error: (error as Error).message }, 1);
  }
  emit({ ok: true, task: taskId, item, done, progress: checklistProgress(scope, taskId) });
}
