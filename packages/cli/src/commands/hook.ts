import { appendEvent, renderSessionStart, renderUserPromptSubmit, resolveProjectScope } from '@withy/core';
import type { Command } from 'commander';

export default function registerHookCommand(program: Command): void {
  program
    .command('hook <event>')
    .description('Platform hook entry (session-start | user-prompt-submit). Outputs injection text for the agent.')
    .action(runHook);
}

function runHook(event: string): void {
  try {
    // kill-switch / non-interactive guard — never pollute scripted sessions.
    if (process.env.WITHY_HOOKS === '0') process.exit(0);

    const scope = resolveProjectScope();
    if (!scope) process.exit(0); // not a Withy project — silent no-op

    if (event === 'session-start') {
      const result = renderSessionStart(scope);
      process.stdout.write(result.text);
      if (result.taskId) {
        appendEvent(scope, result.taskId, {
          ts: new Date().toISOString(),
          type: 'session_start',
          injected: result.injected,
        });
      }
      process.exit(0);
    }

    if (event === 'user-prompt-submit') {
      const text = renderUserPromptSubmit(scope);
      if (text) process.stdout.write(text);
      process.exit(0);
    }

    // Future events (inject-workflow-state / inject-subagent-context) are no-ops for now.
    process.exit(0);
  } catch (error) {
    // Soft-fail: hooks must never block the session (Withy's hard gate is `withy next`).
    process.stderr.write(`withy hook error: ${(error as Error).message}\n`);
    process.exit(0);
  }
}
