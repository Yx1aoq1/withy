import { readKnowledgeEntry, listKnowledgePages } from '../knowledge/index.js';
import type { InjectMode } from '../knowledge/index.js';
import type { Scope } from '../paths.js';

// 一条已解析的计划注入项(resolvePlannedContext 输出);形态决定 session-start 注正文还是注索引
export interface PlannedEntry {
  // 知识条目 id(injectByDefault 聚合按此引用)
  id: string;

  // 注入形态:full=注正文,index=注 title+summary+路径
  mode: InjectMode;

  // 标题(读不到知识条目时回退为 id)
  title: string;

  // 一句话摘要(index 形态展示;可空)
  summary?: string;

  // 正文(仅 full 形态带)
  body?: string;

  // 知识页相对路径(供 agent 按需下钻;读不到为空)
  path?: string;
}

// 把一个知识 id 解析成计划注入项;条目缺失时降级为 index 占位(不静默丢,让悬空显形)
function toPlannedEntry(scope: Scope, id: string): PlannedEntry {
  const entry = readKnowledgeEntry(scope, id);
  if (!entry) {
    return { id, mode: 'index', title: id };
  }

  return {
    id: entry.id,
    mode: entry.inject,
    title: entry.title,
    summary: entry.summary,
    body: entry.inject === 'full' ? entry.body : undefined,
    path: entry.path,
  };
}

/**
 * 计算 session-start 的全局常驻注入清单(harness §4 / knowledge.md §7)。
 * 扫该 scope 全部知识页,取 `injectByDefault: true` 的,按 id 去重后逐条解析成带注入形态的条目。
 * 取代原 context.json 的 default/node 注入:节点级「必读」改由派遣场景的 dispatch.json 承担(design §1.3)。
 *
 * @param scope 目标 scope
 * @return 去重后的计划注入项(按知识页扫描顺序)
 *
 * @example
 * resolvePlannedContext(scope);
 */
export function resolvePlannedContext(scope: Scope): PlannedEntry[] {
  const seen = new Set<string>();
  const entries: PlannedEntry[] = [];

  for (const page of listKnowledgePages(scope)) {
    if (!page.injectByDefault || seen.has(page.id)) continue;
    seen.add(page.id);
    entries.push(toPlannedEntry(scope, page.id));
  }

  return entries;
}
