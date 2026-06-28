import fg from 'fast-glob';
import { type Scope } from '../paths.js';
import { listKnowledgePages } from './pages.js';

// 一条 lint 发现:断链/悬空 covers 为 error,孤儿页为 warning
export interface KnowledgeIssue {
  level: 'error' | 'warning';
  kind: 'orphan' | 'broken-link' | 'dangling-cover';

  // 涉及的页 id(orphan/broken-link/dangling-cover 的源页)
  id?: string;

  // 指向的目标(broken-link 的缺失页 / dangling-cover 的零命中 glob)
  target?: string;
  message: string;
}

/**
 * 机械体检某 scope 知识库:孤儿页(入链 0)、断链(指向不存在的页)、
 * 悬空 covers(glob 在仓库零命中)。
 *
 * @param scope 目标 scope
 * @return 全部发现(空 = 健康);断链/悬空为 error,孤儿为 warning
 */
export function lintKnowledge(scope: Scope): KnowledgeIssue[] {
  const pages = listKnowledgePages(scope);
  const ids = new Set(pages.map(page => page.id));
  const inDegree = new Map<string, number>(pages.map(page => [page.id, 0]));

  const issues: KnowledgeIssue[] = [];

  for (const page of pages) {
    for (const target of page.links) {
      if (ids.has(target)) {
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
      } else {
        issues.push({
          level: 'error',
          kind: 'broken-link',
          id: page.id,
          target,
          message: `page "${page.id}" links to missing page "${target}"`,
        });
      }
    }
  }

  for (const page of pages) {
    if ((inDegree.get(page.id) ?? 0) === 0) {
      issues.push({
        level: 'warning',
        kind: 'orphan',
        id: page.id,
        message: `orphan page "${page.id}" (no incoming links)`,
      });
    }
  }

  // covers 是仓库相对代码 glob,只在项目 scope 有意义;用 fast-glob 测「是否命中仓库文件」
  // (design.md §6:fast-glob 仅供 lint 做存在性展开;零命中归 lint,查询侧不报)。
  if (scope.kind === 'project') {
    for (const page of pages) {
      for (const glob of page.covers) {
        const matched = fg.sync(glob, { cwd: scope.root, dot: true, onlyFiles: false, suppressErrors: true });
        if (matched.length === 0) {
          issues.push({
            level: 'error',
            kind: 'dangling-cover',
            id: page.id,
            target: glob,
            message: `page "${page.id}" covers glob "${glob}" matches no files in the repo`,
          });
        }
      }
    }
  }

  return issues;
}
