import { resolvePlannedContext } from './context.js';
import { resolveCurrentTask } from './task.js';
import { nodeById } from './workflow/index.js';
import { readGuide, readDeveloper, readState, readTask, readWorkflow } from './store.js';
import { readGitStatus } from './utils/index.js';
import type { PlannedEntry } from './context.js';
import type { Scope } from './paths.js';

export interface SessionStartResult {
  text: string;
  injected: string[];
  /** Non-null only when a concrete active task was resolved (caller writes the session_start event). */
  taskId: string | null;
}

/**
 * Build the SessionStart injection (harness §6.4). Multi-state Next-Action machine.
 * The caller (cli hook command) prints `text`, then appends a session_start event
 * when `taskId` is non-null.
 */
export function renderSessionStart(scope: Scope): SessionStartResult {
  const out: string[] = ['# Tuteur workflow context', ''];
  const guide = readGuide(scope);
  if (guide?.trim()) out.push(guide.trim(), '');

  const developer = readDeveloper(scope);
  if (developer) out.push(`- Developer: ${developer.name} (${developer.slug})`);
  out.push(...gitStateLines(scope.root));

  const current = resolveCurrentTask(scope);
  let taskId: string | null = null;
  let currentNode = '';

  if (current === null) {
    out.push('- NO ACTIVE TASK · Next-Action: describe your goal and I will run `ttur task start "<title>" --json`');
  } else if ('ambiguous' in current) {
    out.push(`- AMBIGUOUS: multiple open tasks (${current.ambiguous.join(', ')})`);
    out.push('- Next-Action: `ttur task start <id> --json` to pick one, or start a new task');
  } else if ('stale' in current) {
    out.push(`- STALE POINTER: current-task points at "${current.stale}" which no longer exists`);
    out.push('- Next-Action: `ttur task start <id> --json` to reset');
  } else {
    taskId = current.taskId;
    const task = readTask(scope, taskId);
    const wf = readWorkflow(scope, task.workflow);
    const state = readState(scope, taskId);
    const node = state.currentNode ? nodeById(wf, state.currentNode) : null;
    currentNode = state.currentNode ?? '';

    out.push(`- Task ${taskId}: ${task.title}`);
    out.push(`- Status ${task.status} · Node ${state.currentNode ?? '(done)'} · Phase ${node?.phase ?? '-'}`);
    out.push(`- Completed: ${state.completedNodes.join(', ') || '(none)'}`);

    if (state.currentNode === null) {
      out.push('- COMPLETED · Next-Action: `ttur task archive ' + taskId + '`');
    } else if (node?.type === 'switch') {
      out.push('- DECISION POINT — choose one:');
      for (const b of node.branches) {
        out.push(`    · ${b.label}${b.default ? ' (default)' : ''}${b.criteria ? ` — ${b.criteria}` : ''}`);
      }
      out.push(`- Next-Action: \`ttur next --branch <label> --reason "..." --json\``);
    } else {
      out.push(`- Next-Action: \`ttur next --json\``);
    }
  }

  const planned = resolvePlannedContext(scope, taskId ?? '', currentNode);
  out.push(...contextLines(planned));

  return { text: out.join('\n') + '\n', injected: planned.map(entry => entry.id), taskId };
}

// 计划注入项渲染:full 注正文为独立小节,index 汇成「按需阅读」清单
function contextLines(entries: PlannedEntry[]): string[] {
  if (!entries.length) {
    return [];
  }

  const lines: string[] = [];

  for (const entry of entries.filter(e => e.mode === 'full')) {
    lines.push('', `## ${entry.title}`, entry.body?.trim() || '(empty)');
  }

  const index = entries.filter(e => e.mode === 'index');
  if (index.length) {
    lines.push('', '## Required context (read on demand)');
    for (const entry of index) {
      const summary = entry.summary ? ` — ${entry.summary}` : '';
      const path = entry.path ? ` (${entry.path})` : '';
      lines.push(`- ${entry.title}${summary}${path}`);
    }
  }

  return lines;
}

// git 快照渲染成 current-state 行(软失败:非仓库只给一行说明,不影响其余注入)
function gitStateLines(root: string): string[] {
  const git = readGitStatus(root);
  if (!git.isRepo) {
    return ['- Git: not a git repository'];
  }

  const lines = [
    `- Git branch: ${git.branch}`,
    `- Working tree: ${git.dirtyCount === 0 ? 'clean' : `${git.dirtyCount} uncommitted change(s)`}`,
  ];

  for (const file of git.changedFiles) {
    lines.push(`    · ${file}`);
  }
  if (git.dirtyCount > git.changedFiles.length) {
    lines.push(`    · …(+${git.dirtyCount - git.changedFiles.length} more)`);
  }

  if (git.recentCommits.length) {
    lines.push('- Recent commits:');
    for (const commit of git.recentCommits) {
      lines.push(`    · ${commit}`);
    }
  }

  return lines;
}
