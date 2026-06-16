import {
  rebuildKnowledgeIndexes,
  deriveKnowledgeGraph,
  resolveGlobalScope,
  deriveMergedGraph,
  lintKnowledge,
} from '@tuteur/core';
import type { Command } from 'commander';
import type { Scope } from '@tuteur/core';
import { emit, requireProjectScope } from '../harness/runtime.js';

export default function registerKnowledgeCommand(program: Command): void {
  const knowledge = program
    .command('knowledge')
    .description('Maintain the knowledge base (deterministic bookkeeping; retrieval stays in agent file tools)');

  knowledge
    .command('graph')
    .description('Derive the document relation graph from [[links]] and frontmatter sources')
    .option('--global', 'Operate on the global knowledge base (~/.tuteur)')
    .option('--merged', 'Render global + project together (cross-scope view for web)')
    .action(runGraph);

  knowledge
    .command('index')
    .description('Recompute every level index.md from page frontmatter (root catalog + wiki subdirs)')
    .option('--global', 'Operate on the global knowledge base (~/.tuteur)')
    .action(runIndex);

  knowledge
    .command('lint')
    .description('Mechanical health check: orphan pages, broken links, dangling injection refs')
    .option('--global', 'Operate on the global knowledge base (~/.tuteur)')
    .action(runLint);
}

interface ScopeOption {
  global?: boolean;
}

interface GraphOption extends ScopeOption {
  merged?: boolean;
}

// Default scope is the current project; `--global` switches to ~/.tuteur (same as `init --global`).
function resolveScope(global?: boolean): Scope {
  return global ? resolveGlobalScope() : requireProjectScope();
}

function runGraph(options: GraphOption): void {
  if (options.merged) {
    const graph = deriveMergedGraph(requireProjectScope(), resolveGlobalScope());
    emit({ ok: true, scope: 'merged', nodes: graph.nodes.length, edges: graph.edges.length, graph });
  }

  const scope = resolveScope(options.global);
  const graph = deriveKnowledgeGraph(scope);
  emit({ ok: true, scope: scope.kind, nodes: graph.nodes.length, edges: graph.edges.length, graph });
}

function runIndex(options: ScopeOption): void {
  const scope = resolveScope(options.global);
  const written = rebuildKnowledgeIndexes(scope);
  emit({ ok: true, scope: scope.kind, written: written.length, paths: written.map(file => file.path) });
}

function runLint(options: ScopeOption): void {
  const scope = resolveScope(options.global);
  const issues = lintKnowledge(scope);
  const errors = issues.filter(issue => issue.level === 'error').length;

  emit({ ok: errors === 0, scope: scope.kind, errors, warnings: issues.length - errors, issues }, errors ? 1 : 0);
}
