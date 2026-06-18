import { resolveCurrentTask, resolveProjectScope, taskExists, readDeveloper, type Scope } from '@tuteur/core';
import type { Command } from 'commander';

let jsonOutput = false;

export function configureOutput(program: Command): void {
  program.hook('preAction', (_command, actionCommand) => {
    jsonOutput = Boolean(actionCommand.optsWithGlobals().json);
    if (!jsonOutput || actionCommand.name() === 'hook') return;

    const lines: string[] = [];
    const log = console.log;
    console.log = (...values: unknown[]) => {
      lines.push(values.map(String).join(' '));
    };
    actionCommand.setOptionValue('__tuteurOutputLines', lines);
    actionCommand.setOptionValue('__tuteurOriginalLog', log);
  });

  program.hook('postAction', (_command, actionCommand) => {
    const log = actionCommand.getOptionValue('__tuteurOriginalLog') as typeof console.log | undefined;
    if (!log) return;

    console.log = log;
    const output = actionCommand.getOptionValue('__tuteurOutputLines') as string[];
    process.stdout.write(`${JSON.stringify({ ok: process.exitCode !== 1, output })}\n`);
  });
}

/** Print structured JSON for agents or readable text for humans, then exit. */
export function emit(result: unknown, exitCode = 0): never {
  process.stdout.write(`${jsonOutput ? JSON.stringify(result) : formatHumanResult(result)}\n`);
  process.exit(exitCode);
}

function formatHumanResult(result: unknown): string {
  if (!isRecord(result)) return String(result);

  if (typeof result.error === 'string') {
    const details = formatEntries(result, new Set(['ok', 'error']));
    return [`Error: ${result.error}`, ...details].join('\n');
  }

  if (Array.isArray(result.tasks)) {
    if (result.tasks.length === 0) return 'No tasks.';
    return result.tasks.map(formatTask).join('\n');
  }

  const lines = formatEntries(result, new Set(['ok']));
  return lines.length > 0 ? lines.join('\n') : 'OK';
}

function formatEntries(value: Record<string, unknown>, excluded: Set<string>): string[] {
  return Object.entries(value)
    .filter(([key, entry]) => !excluded.has(key) && entry !== undefined)
    .flatMap(([key, entry]) => formatEntry(key, entry));
}

function formatEntry(key: string, value: unknown): string[] {
  const label = humanize(key);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${label}: none`];
    return [`${label}:`, ...value.map(entry => `- ${formatValue(entry)}`)];
  }
  if (isRecord(value)) {
    return [`${label}:`, ...formatEntries(value, new Set()).map(line => `  ${line}`)];
  }
  return [`${label}: ${formatValue(value)}`];
}

function formatTask(value: unknown): string {
  if (!isRecord(value)) return `- ${formatValue(value)}`;
  const id = String(value.id ?? 'unknown');
  const title = String(value.title ?? 'untitled');
  const status = value.status ? ` [${String(value.status)}]` : '';
  const assignee = value.assignee ? ` @${String(value.assignee)}` : '';
  return `${id}${status} ${title}${assignee}`;
}

function formatValue(value: unknown): string {
  if (value === null) return 'none';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, entry]) => `${humanize(key)}=${formatValue(entry)}`)
      .join(', ');
  }
  return String(value);
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resolve the project scope or emit an error and exit. */
export function requireProjectScope(): Scope {
  const scope = resolveProjectScope();
  if (!scope) {
    emit({ ok: false, error: 'not a Tuteur project — run `ttur init` first' }, 1);
  }
  return scope;
}

/** Resolve the active task id (--task > pointer > unique open), or emit a typed error. */
export function resolveTaskId(scope: Scope, explicit?: string): string {
  const current = resolveCurrentTask(scope, explicit);
  if (current === null) {
    emit({ ok: false, error: 'no active task — start one or pass --task <id>' }, 1);
  }
  if ('ambiguous' in current) {
    emit(
      {
        ok: false,
        error: 'multiple open tasks — pass --task <id> or run `ttur task start <id>`',
        tasks: current.ambiguous,
      },
      1,
    );
  }
  if ('stale' in current) {
    emit({ ok: false, error: `current-task pointer is stale (${current.stale}) — run \`ttur task start <id>\`` }, 1);
  }
  if (!taskExists(scope, current.taskId)) {
    emit({ ok: false, error: `task not found: ${current.taskId}` }, 1);
  }
  return current.taskId;
}

/** Current developer slug, used as the `by` actor for decisions/approvals/skips. */
export function actorSlug(scope: Scope): string | undefined {
  return readDeveloper(scope)?.slug;
}

/** `<MM-DD>-<slug>` task id (core §4.1). */
export function makeTaskId(title: string, date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}-${dd}-${slugify(title)}`;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'task';
}
