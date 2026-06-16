import { validateWorkflow, readKnowledgeEntry, readWorkflow, skillExists } from '@tuteur/core';
import type { Command } from 'commander';
import { emit, requireProjectScope } from '../harness/runtime.js';

export default function registerWorkflowCommand(program: Command): void {
  const workflow = program.command('workflow').description('Inspect and validate workflows');

  workflow
    .command('validate [id]')
    .description('Validate a workflow graph (structure + skill/template refs; defaults to "default")')
    .action(runValidate);
}

function runValidate(idArg: string | undefined): void {
  const scope = requireProjectScope();
  const id = idArg ?? 'default';

  let workflow;
  try {
    workflow = readWorkflow(scope, id);
  } catch (error) {
    emit({ ok: false, error: `workflow "${id}" not found: ${(error as Error).message}` }, 1);
  }

  const issues = validateWorkflow(workflow, {
    skillExists: name => skillExists(scope, name),
    templateExists: templateId => readKnowledgeEntry(scope, templateId) !== null,
  });
  const errors = issues.filter(issue => issue.level === 'error');

  emit({ ok: errors.length === 0, workflow: id, errors: errors.length, issues }, errors.length ? 1 : 0);
}
