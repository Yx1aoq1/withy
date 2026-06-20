import { basename, relative, resolve } from 'node:path';
import { knowledgeWikiPath, knowledgeDir } from './paths.js';
import {
  readKnowledgeSource,
  listKnowledgeFiles,
  writeKnowledgeFile,
  readContextConfig,
  listWikiEntries,
  removeWikiEntry,
  moveWikiEntry,
  wikiEntryType,
  writeWikiFile,
  readWikiFile,
  makeWikiDir,
} from './store.js';
import type { KnowledgeFile } from './store.js';
import { slugify, nowIso } from './utils/index.js';
import type { Scope } from './paths.js';

// 注入形态:full=注正文(短而必读),index=注 title+summary+路径(长文档按需下钻)
export type InjectMode = 'full' | 'index';

// 一条知识条目(knowledge/wiki/<id>.md 解析结果);供注入与 web 知识库管理
export interface KnowledgeEntry {
  // 稳定标识(注入按 id 引用;缺省取文件名)
  id: string;

  // 条目标题(缺省回退为 id)
  title: string;

  // 一句话摘要(index 形态注入时展示)
  summary?: string;

  // 注入形态;缺省 index
  inject: InjectMode;

  // 是否进默认注入集
  injectByDefault: boolean;

  // 正文(frontmatter 之后的内容)
  body: string;

  // 相对 scope 根的路径,供 agent 按需下钻
  path: string;
}

// 维护视图:一页 wiki 的全量解析结果,供 graph/index/lint 三个 bookkeeping 命令共用
export interface KnowledgePage {
  // 稳定标识(frontmatter id 优先,缺省取文件名)
  id: string;

  // 条目标题(缺省回退为 id)
  title: string;

  // 一句话摘要(index 行展示)
  summary?: string;

  // 条目类别(根索引按此分组)
  kind?: string;

  // 标签
  tags: string[];

  // 注入形态;缺省 index
  inject: InjectMode;

  // 是否进默认注入集
  injectByDefault: boolean;

  // frontmatter sources:本页综合自哪些原始源(派生 source 边)
  sources: string[];

  // 正文里的 [[id]] 出链(去重)
  links: string[];

  // 相对 knowledge/wiki/ 的路径(posix),供索引计算目录层级
  wikiRelPath: string;

  // 相对 scope 根的路径
  path: string;

  // 来源层(由所在 scope 决定;合并图里区分跨层边)
  scope: 'global' | 'project';
}

// 关系图节点(一页 wiki 或一个被引用的原始源)
export interface KnowledgeGraphNode {
  id: string;
  title: string;
  kind?: string;
  path: string;
  scope: 'global' | 'project';

  // 入链数(仅统计 [[link]] 边,孤儿判定用)
  inDegree: number;

  // 出边数([[link]] + source)
  outDegree: number;
}

// 关系图边:link=正文 [[id]] 引用;source=frontmatter 源引用
export interface KnowledgeGraphEdge {
  from: string;
  to: string;
  type: 'link' | 'source';

  // 合并图中项目页指向仅存在于全局的 id(跨 scope 边)
  crossScope?: boolean;

  // link 边指向不存在的页(lint 也会单独报)
  broken?: boolean;
}

// 文档关系图(节点/边);供 web 图谱视图 + lint
export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

// 一份重算出的 index.md(路径相对 knowledge/)
export interface KnowledgeIndexFile {
  // 相对 knowledge/ 的路径(如 "index.md"、"wiki/backend/index.md")
  path: string;

  // 渲染后的 markdown 正文
  content: string;
}

// 一条 lint 发现:断链/悬空引用为 error,孤儿页为 warning
export interface KnowledgeIssue {
  level: 'error' | 'warning';
  kind: 'orphan' | 'broken-link' | 'dangling-ref';

  // 涉及的页 id(orphan/broken-link 的源页)
  id?: string;

  // 指向的目标(broken-link 的缺失页 / dangling-ref 的缺失 id)
  target?: string;
  message: string;
}

// 去掉成对的首尾引号(单/双引号)
function stripQuotes(value: string): string {
  if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'")) && value.endsWith(value[0])) {
    return value.slice(1, -1);
  }

  return value;
}

// 解析一个 frontmatter 标量或内联数组(`[a, b]`);非数组按 true/false/字符串处理
function parseValue(value: string): string | boolean | string[] {
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    return inner
      ? inner
          .split(',')
          .map(item => stripQuotes(item.trim()))
          .filter(Boolean)
      : [];
  }

  const scalar = stripQuotes(value);
  if (scalar === 'true') return true;
  if (scalar === 'false') return false;
  return scalar;
}

// 最小 frontmatter 解析:认 `key: scalar` 与 `key: [a, b]`(无 YAML 依赖);非 frontmatter 文件全当正文
function parseFrontmatter(raw: string): { data: Record<string, string | boolean | string[]>; body: string } {
  const data: Record<string, string | boolean | string[]> = {};
  if (!raw.startsWith('---')) {
    return { data, body: raw };
  }

  const lines = raw.split('\n');
  let cursor = 1;

  for (; cursor < lines.length; cursor++) {
    if (lines[cursor].trim() === '---') {
      cursor++;
      break;
    }

    const line = lines[cursor];
    const sep = line.indexOf(':');
    if (sep === -1) continue;

    const key = line.slice(0, sep).trim();
    if (!key) continue;

    data[key] = parseValue(line.slice(sep + 1).trim());
  }

  return { data, body: lines.slice(cursor).join('\n') };
}

function asString(value: string | boolean | string[] | undefined): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function asArray(value: string | boolean | string[] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

// 抽取正文里的 [[id]] / [[id|alias]] 出链(取 id 段、去重)
function extractLinks(body: string): string[] {
  const links = new Set<string>();
  for (const match of body.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const id = match[1].split('|')[0].trim();
    if (id) links.add(id);
  }

  return [...links];
}

// 把一段 wiki 原文解析成注入条目;fallbackId 用于 frontmatter 缺 id 时兜底
function entryFromRaw(raw: string, fallbackId: string, path: string): KnowledgeEntry {
  const { data, body } = parseFrontmatter(raw);
  const id = asString(data.id) ?? fallbackId;

  return {
    id,
    title: asString(data.title) ?? id,
    summary: asString(data.summary),
    inject: data.inject === 'full' ? 'full' : 'index',
    injectByDefault: data.injectByDefault === true,
    body: body.trim(),
    path,
  };
}

/**
 * 按 id 读取并解析一条知识条目。先走扁平 `wiki/<id>.md` 快路径(默认平铺布局),
 * 命中且 id 一致即返回;否则递归扫 wiki 树按 frontmatter id(缺则文件名)匹配,
 * 让移进子目录的页仍能按 id 注入(knowledge.md §4/§6.1:id 与路径解耦)。
 *
 * @param scope 目标 scope(项目或全局)
 * @param id 知识条目 id
 * @return 条目不存在时返回 null
 *
 * @example
 * readKnowledgeEntry(scope, 'api-conventions');
 */
export function readKnowledgeEntry(scope: Scope, id: string): KnowledgeEntry | null {
  const flat = readKnowledgeSource(scope, id);
  if (flat !== null) {
    const entry = entryFromRaw(flat, id, relative(scope.root, knowledgeWikiPath(scope, id)));
    if (entry.id === id) return entry; // 文件名即 id 的常见情形,免去全树扫描
  }

  for (const file of listKnowledgeFiles(scope)) {
    const declared = asString(parseFrontmatter(file.raw).data.id) ?? file.id;
    if (declared === id) {
      return entryFromRaw(
        file.raw,
        file.id,
        relative(scope.root, resolve(knowledgeDir(scope), 'wiki', file.wikiRelPath)),
      );
    }
  }

  return null;
}

// 把一个 wiki 文件解析成维护视图页
function parsePage(file: KnowledgeFile, scope: Scope): KnowledgePage {
  const { data, body } = parseFrontmatter(file.raw);
  const id = asString(data.id) ?? file.id;

  return {
    id,
    title: asString(data.title) ?? id,
    summary: asString(data.summary),
    kind: asString(data.kind),
    tags: asArray(data.tags),
    inject: data.inject === 'full' ? 'full' : 'index',
    injectByDefault: data.injectByDefault === true,
    sources: asArray(data.sources),
    links: extractLinks(body),
    wikiRelPath: file.wikiRelPath,
    path: relative(scope.root, resolve(knowledgeDir(scope), 'wiki', file.wikiRelPath)),
    scope: scope.kind,
  };
}

/**
 * 列出某 scope 下全部 wiki 页(递归,跳过生成的 index.md)。
 *
 * @param scope 目标 scope
 * @return 解析后的维护视图页;无 wiki 目录时为空
 */
export function listKnowledgePages(scope: Scope): KnowledgePage[] {
  return listKnowledgeFiles(scope).map(file => parsePage(file, scope));
}

// ── Graph ────────────────────────────────────────────────────────────────────

// 由一组页派生关系图;source 引用补成 kind:source 的节点
function buildGraph(pages: KnowledgePage[]): KnowledgeGraph {
  const nodes = new Map<string, KnowledgeGraphNode>();
  for (const page of pages) {
    nodes.set(page.id, {
      id: page.id,
      title: page.title,
      kind: page.kind,
      path: page.path,
      scope: page.scope,
      inDegree: 0,
      outDegree: 0,
    });
  }

  const edges: KnowledgeGraphEdge[] = [];
  for (const page of pages) {
    const from = nodes.get(page.id);

    for (const target of page.links) {
      const to = nodes.get(target);
      const edge: KnowledgeGraphEdge = { from: page.id, to: target, type: 'link' };
      if (!to) {
        edge.broken = true;
      } else {
        to.inDegree++;
        if (page.scope === 'project' && to.scope === 'global') edge.crossScope = true;
      }
      if (from) from.outDegree++;
      edges.push(edge);
    }

    for (const source of page.sources) {
      let to = nodes.get(source);
      if (!to) {
        to = {
          id: source,
          title: basename(source),
          kind: 'source',
          path: source,
          scope: page.scope,
          inDegree: 0,
          outDegree: 0,
        };
        nodes.set(source, to);
      }
      to.inDegree++;
      if (from) from.outDegree++;
      edges.push({ from: page.id, to: source, type: 'source' });
    }
  }

  return { nodes: [...nodes.values()], edges };
}

/**
 * 从 `[[链接]]` 与 frontmatter `sources` 派生单 scope 的文档关系图(knowledge.md §9)。
 *
 * @param scope 目标 scope
 */
export function deriveKnowledgeGraph(scope: Scope): KnowledgeGraph {
  return buildGraph(listKnowledgePages(scope));
}

/**
 * 派生全局+项目合并的全景图(web「合并」视图)。id 撞车项目覆盖全局,
 * 跨 scope 边(项目页引用仅存在于全局的 id)标 `crossScope`。
 *
 * @param project 项目 scope
 * @param global 全局 scope
 */
export function deriveMergedGraph(project: Scope, global: Scope): KnowledgeGraph {
  const projectPages = listKnowledgePages(project);
  const overridden = new Set(projectPages.map(page => page.id));
  const globalPages = listKnowledgePages(global).filter(page => !overridden.has(page.id));

  return buildGraph([...globalPages, ...projectPages]);
}

// ── Index ──────────────────────────────────────────────────────────────────

const GENERATED_MARKER = '<!-- Generated by `withy knowledge index`. Do not edit by hand. -->';

// 根 catalog 的分组表头(按显示顺序);未知 kind 退化为原名,无 kind 归入 Other
const KIND_GROUPS: ReadonlyArray<readonly [string, string]> = [
  ['spec', 'Specs'],
  ['overview', 'Overviews'],
  ['concept', 'Concepts'],
  ['entity', 'Entities'],
  ['comparison', 'Comparisons'],
  ['summary', 'Summaries'],
  ['template', 'Templates'],
  ['log', 'Logs'],
];

function posixDir(rel: string): string {
  const slash = rel.lastIndexOf('/');
  return slash === -1 ? '' : rel.slice(0, slash);
}

function posixBase(rel: string): string {
  const slash = rel.lastIndexOf('/');
  return slash === -1 ? rel : rel.slice(slash + 1);
}

function byTitle(a: KnowledgePage, b: KnowledgePage): number {
  return a.title.localeCompare(b.title);
}

function pageRow(page: KnowledgePage, href: string): string {
  return page.summary ? `- [${page.title}](${href}) — ${page.summary}` : `- [${page.title}](${href})`;
}

// 每个非根目录路径 → 其子树下页数(子目录链接的一行描述)
function subtreeCounts(pages: KnowledgePage[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const dir = posixDir(page.wikiRelPath);
    if (!dir) continue;

    let prefix = '';
    for (const segment of dir.split('/')) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
  }

  return counts;
}

function renderGroupedSections(lines: string[], pages: KnowledgePage[], href: (page: KnowledgePage) => string): void {
  if (!pages.length) return;

  const byKind = new Map<string, KnowledgePage[]>();
  for (const page of pages) {
    const key = page.kind ?? '';
    const list = byKind.get(key);
    if (list) list.push(page);
    else byKind.set(key, [page]);
  }

  const known = new Set(KIND_GROUPS.map(([kind]) => kind));
  const order: Array<readonly [string, string]> = [...KIND_GROUPS];
  for (const kind of [...byKind.keys()].filter(key => key && !known.has(key)).sort()) {
    order.push([kind, `${kind[0].toUpperCase()}${kind.slice(1)}`]);
  }
  if (byKind.has('')) order.push(['', 'Other']);

  for (const [kind, label] of order) {
    const group = byKind.get(kind);
    if (!group?.length) continue;
    lines.push(`## ${label}`, '');
    for (const page of [...group].sort(byTitle)) lines.push(pageRow(page, href(page)));
    lines.push('');
  }
}

function renderFlatPages(lines: string[], pages: KnowledgePage[], href: (page: KnowledgePage) => string): void {
  if (!pages.length) return;
  for (const page of [...pages].sort(byTitle)) lines.push(pageRow(page, href(page)));
  lines.push('');
}

function renderSubdirs(lines: string[], subdirs: Set<string>, link: (name: string) => [string, number]): void {
  if (!subdirs.size) return;

  lines.push('## Subdirectories', '');
  for (const name of [...subdirs].sort()) {
    const [href, count] = link(name);
    lines.push(`- [${name}/](${href}) — ${count} ${count === 1 ? 'entry' : 'entries'}`);
  }
  lines.push('');
}

/**
 * 据各页 frontmatter 确定性重算各级 index.md 内容(纯函数,不碰盘)。
 * 根索引(knowledge/index.md)按 kind 分组列 wiki/ 顶层页 + 链向各子目录;
 * 子目录索引(wiki/<topic>/index.md)平铺列直接子项。
 *
 * @param pages 维护视图页清单
 * @return 每级一份 index.md(路径相对 knowledge/);wiki 为空也产一份根目录索引
 */
export function buildKnowledgeIndexes(pages: KnowledgePage[]): KnowledgeIndexFile[] {
  interface DirNode {
    pages: KnowledgePage[];
    subdirs: Set<string>;
  }
  const dirs = new Map<string, DirNode>();
  const ensure = (key: string): DirNode => {
    let node = dirs.get(key);
    if (!node) {
      node = { pages: [], subdirs: new Set() };
      dirs.set(key, node);
    }
    return node;
  };

  ensure(''); // always emit a root catalog, even for an empty wiki

  for (const page of pages) {
    const dir = posixDir(page.wikiRelPath);
    ensure(dir).pages.push(page);

    let prefix = '';
    for (const segment of dir ? dir.split('/') : []) {
      ensure(prefix).subdirs.add(segment);
      prefix = prefix ? `${prefix}/${segment}` : segment;
      ensure(prefix);
    }
  }

  const counts = subtreeCounts(pages);
  const files: KnowledgeIndexFile[] = [];
  for (const [dir, node] of dirs) {
    files.push({
      path: dir ? `wiki/${dir}/index.md` : 'index.md',
      content: dir
        ? renderSubdirIndex(dir, node.pages, node.subdirs, counts)
        : renderRootIndex(node.pages, node.subdirs, counts),
    });
  }

  return files;
}

function renderRootIndex(pages: KnowledgePage[], subdirs: Set<string>, counts: Map<string, number>): string {
  const lines = [GENERATED_MARKER, '', '# Knowledge', ''];
  renderGroupedSections(lines, pages, page => `wiki/${page.wikiRelPath}`);
  renderSubdirs(lines, subdirs, name => [`wiki/${name}/`, counts.get(name) ?? 0]);

  return `${lines.join('\n').trimEnd()}\n`;
}

function renderSubdirIndex(
  dir: string,
  pages: KnowledgePage[],
  subdirs: Set<string>,
  counts: Map<string, number>,
): string {
  const lines = [GENERATED_MARKER, '', `# ${posixBase(dir)}/`, ''];
  renderFlatPages(lines, pages, page => posixBase(page.wikiRelPath));
  renderSubdirs(lines, subdirs, name => [`${name}/`, counts.get(`${dir}/${name}`) ?? 0]);

  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * 重算并写回某 scope 各级 index.md(确定性 bookkeeping)。
 *
 * @param scope 目标 scope
 * @return 写出的索引文件清单(含正文)
 */
export function rebuildKnowledgeIndexes(scope: Scope): KnowledgeIndexFile[] {
  const indexes = buildKnowledgeIndexes(listKnowledgePages(scope));
  for (const file of indexes) writeKnowledgeFile(scope, file.path, file.content);

  return indexes;
}

// ── Lint ───────────────────────────────────────────────────────────────────

/**
 * 机械体检某 scope 知识库:孤儿页(入链 0)、断链(指向不存在的页)、
 * context.json 注入引用悬空(指向不存在的 id)。
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

  const config = readContextConfig(scope);
  const refs = new Set<string>();
  for (const set of [config.default, ...Object.values(config.nodes)]) {
    for (const id of [...set.required, ...set.optional]) refs.add(id);
  }
  for (const id of refs) {
    if (!ids.has(id)) {
      issues.push({
        level: 'error',
        kind: 'dangling-ref',
        target: id,
        message: `context.json injects unknown knowledge id "${id}"`,
      });
    }
  }

  return issues;
}

// ── Write face (CRUD; core 独占 .withy 写入,web 经此维护知识库) ───────────────

/** Raised by the knowledge write face on guard violations (traversal, conflicts, index.md edits). */
export class KnowledgeError extends Error {}

// 今天的人类日期(YYYY-MM-DD);装饰性 updated 用,core 不消费。
function today(): string {
  return nowIso().slice(0, 10);
}

// index.md 是生成物,永不接受单独 save/rename/delete。
function isIndexFile(relPath: string): boolean {
  return posixBase(relPath) === 'index.md';
}

/**
 * 规范化并校验一个 wiki 相对路径:拒绝空串、绝对路径、Windows 盘符、以及任意 `..` 段,
 * 防目录穿越。所有按 relPath 的读写入口先过此关(读写共用单点收口)。
 *
 * @param relPath 客户端传入的 wiki 相对路径(可能含 `\`、`.`、越界段)
 * @return 规范化后的 posix relPath(去空段/`.` 段、collapse 斜杠)
 */
export function assertInsideWiki(relPath: string): string {
  if (typeof relPath !== 'string' || relPath.trim() === '') {
    throw new KnowledgeError('empty knowledge path');
  }

  const posix = relPath.replace(/\\/g, '/');
  if (posix.startsWith('/') || /^[a-zA-Z]:/.test(posix)) {
    throw new KnowledgeError(`absolute knowledge path rejected: ${relPath}`);
  }

  const segments: string[] = [];
  for (const segment of posix.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') throw new KnowledgeError(`path escapes wiki/: ${relPath}`);
    segments.push(segment);
  }
  if (segments.length === 0) throw new KnowledgeError('empty knowledge path');

  return segments.join('/');
}

// 以第二个 `---` 为界拆出 frontmatter 整块(逐字)与正文;无/未闭合 frontmatter 时 frontmatter=null。
function splitFrontmatter(raw: string): { frontmatter: string | null; body: string } {
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') return { frontmatter: null, body: raw };

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return { frontmatter: lines.slice(0, i + 1).join('\n'), body: lines.slice(i + 1).join('\n') };
    }
  }

  return { frontmatter: null, body: raw }; // 未闭合:整块当正文,不擅自改写
}

// 就地更新/插入 frontmatter 内的 `updated:` 行为当天(只动这一行,其余逐字保留)。
function withUpdated(frontmatter: string, date: string): string {
  const lines = frontmatter.split('\n');
  const close = lines.length - 1; // 收尾 `---` 行下标

  for (let i = 1; i < close; i++) {
    if (/^updated\s*:/.test(lines[i])) {
      lines[i] = `updated: ${date}`;
      return lines.join('\n');
    }
  }

  lines.splice(close, 0, `updated: ${date}`); // 插在收尾 `---` 之前
  return lines.join('\n');
}

// 拼回「frontmatter + 空行 + 正文 + 尾换行」;去正文前导空行、规范尾部为单 `\n`。
function assemble(frontmatter: string | null, body: string): string {
  const trimmed = body.replace(/^\n+/, '').replace(/[ \t\r\n]+$/, '');
  if (frontmatter === null) return trimmed ? `${trimmed}\n` : '';
  return trimmed ? `${frontmatter}\n\n${trimmed}\n` : `${frontmatter}\n`;
}

/**
 * 保存一页正文:逐字保留 frontmatter 整块(含未知字段)、仅就地把 `updated:` 置当天、换正文段。
 * 正文中的 `[[link]]` 不经解析器往返,逐字保留。**不重建 index**(正文不影响索引)。
 * 对 index.md 或不存在的页报错。
 *
 * @param scope 项目 scope
 * @param relPath wiki 相对路径
 * @param body 新正文(frontmatter 之后的内容)
 */
export function saveKnowledgePageBody(scope: Scope, relPath: string, body: string): void {
  const rel = assertInsideWiki(relPath);
  if (isIndexFile(rel)) throw new KnowledgeError('index.md is generated and read-only');

  const raw = readWikiFile(scope, rel);
  if (raw === null) throw new KnowledgeError(`page not found: ${rel}`);

  const { frontmatter } = splitFrontmatter(raw);
  writeWikiFile(scope, rel, assemble(frontmatter ? withUpdated(frontmatter, today()) : null, body));
}

// 一页用于编辑的内容:正文 + 只读标记(index.md 为只读)。
export interface KnowledgePageContent {
  // 规范化后的 wiki 相对路径
  relPath: string;

  // index.md 为生成物 → 只读
  readonly: boolean;

  // frontmatter 之后的正文(去前导空行)
  body: string;
}

/**
 * 读取一页用于编辑的内容(拆出正文 + 只读标记);frontmatter 不下发(仅 core 持有)。
 *
 * @param scope 项目 scope
 * @param relPath wiki 相对路径
 * @return 页不存在时返回 null
 */
export function readKnowledgePageContent(scope: Scope, relPath: string): KnowledgePageContent | null {
  const rel = assertInsideWiki(relPath);
  const raw = readWikiFile(scope, rel);
  if (raw === null) return null;

  return { relPath: rel, readonly: isIndexFile(rel), body: splitFrontmatter(raw).body.replace(/^\n+/, '').trimEnd() };
}

// 生成最小 frontmatter + 空正文的新页;scope/updated 为装饰性(core 不消费)。
function minimalPage(scope: Scope, slug: string, title: string): string {
  return ['---', `id: ${slug}`, `title: ${title}`, `scope: ${scope.kind}`, `updated: ${today()}`, '---', '', ''].join(
    '\n',
  );
}

// 把可选的目录入参规范成 wiki 相对目录('' = wiki 根)。
function normalizeDir(dirRelPath: string | undefined): string {
  return dirRelPath && dirRelPath.trim() ? assertInsideWiki(dirRelPath) : '';
}

/**
 * 新建一页:name → slug 作文件名;slug 与全库任一页 id 冲突则报错(不静默加序号)。
 * 写入最小 frontmatter 空页 → 重建并清理 index;返回新页 wiki 相对路径。
 *
 * @param scope 项目 scope
 * @param dirRelPath 目标目录(空/省略 = wiki 根)
 * @param name 页名(同时作 slug 与初始 title)
 * @return 新页的 wiki 相对路径
 */
export function createKnowledgePage(scope: Scope, dirRelPath: string | undefined, name: string): string {
  const dir = normalizeDir(dirRelPath);
  if (dir && wikiEntryType(scope, dir) !== 'dir') throw new KnowledgeError(`target dir not found: ${dir}`);

  const slug = slugify(name);
  if (listKnowledgePages(scope).some(page => page.id === slug)) {
    throw new KnowledgeError(`knowledge id already exists: ${slug}`);
  }

  const relPath = dir ? `${dir}/${slug}.md` : `${slug}.md`;
  if (wikiEntryType(scope, relPath) !== null) throw new KnowledgeError(`file already exists: ${relPath}`);

  writeWikiFile(scope, relPath, minimalPage(scope, slug, name));
  rebuildAndCleanIndexes(scope);

  return relPath;
}

/**
 * 新建文件夹:在目标目录下创建子目录(允许空目录,树中可见;空目录不产生 index)。
 *
 * @param scope 项目 scope
 * @param dirRelPath 目标目录(空/省略 = wiki 根)
 * @param name 文件夹名(slugify 后作目录名)
 * @return 新目录的 wiki 相对路径
 */
export function createKnowledgeFolder(scope: Scope, dirRelPath: string | undefined, name: string): string {
  const dir = normalizeDir(dirRelPath);
  if (dir && wikiEntryType(scope, dir) !== 'dir') throw new KnowledgeError(`target dir not found: ${dir}`);

  const relPath = dir ? `${dir}/${slugify(name)}` : slugify(name);
  if (wikiEntryType(scope, relPath) !== null) throw new KnowledgeError(`already exists: ${relPath}`);

  makeWikiDir(scope, relPath);
  return relPath;
}

/**
 * 重命名/移动一个文件或文件夹(简单移动,不改 frontmatter、不改写别处链接)。
 * 目标已存在则报错(不覆盖);index.md 不可单独改名。完成后重建并清理 index。
 *
 * @param scope 项目 scope
 * @param fromRelPath 源 wiki 相对路径
 * @param toRelPath 目标 wiki 相对路径
 */
export function renameKnowledgeEntry(scope: Scope, fromRelPath: string, toRelPath: string): void {
  const from = assertInsideWiki(fromRelPath);
  const to = assertInsideWiki(toRelPath);
  if (isIndexFile(from) || isIndexFile(to)) throw new KnowledgeError('index.md is generated and cannot be renamed');

  if (wikiEntryType(scope, from) === null) throw new KnowledgeError(`not found: ${from}`);
  if (wikiEntryType(scope, to) !== null) throw new KnowledgeError(`target already exists: ${to}`);

  moveWikiEntry(scope, from, to);
  rebuildAndCleanIndexes(scope);
}

/**
 * 删除一个文件或文件夹(目录递归);index.md 不可单独删除。完成后重建并清理 index
 * (删某目录最后一页后,其孤儿生成 index.md 被清理)。
 *
 * @param scope 项目 scope
 * @param relPath wiki 相对路径
 */
export function deleteKnowledgeEntry(scope: Scope, relPath: string): void {
  const rel = assertInsideWiki(relPath);
  if (isIndexFile(rel)) throw new KnowledgeError('index.md is generated and cannot be deleted');
  if (wikiEntryType(scope, rel) === null) throw new KnowledgeError(`not found: ${rel}`);

  removeWikiEntry(scope, rel);
  rebuildAndCleanIndexes(scope);
}

/**
 * 结构性写后统一调用:先 `rebuildKnowledgeIndexes` 写出当前应有的各级 index.md,
 * 再扫 wiki/ 下首行带 `GENERATED_MARKER` 但不在应有集合中的 `index.md` 删除
 * (只删自己生成的,不误伤手写)。封装在写函数内,不改 `rebuildKnowledgeIndexes` 对外契约。
 */
function rebuildAndCleanIndexes(scope: Scope): void {
  const expected = new Set(rebuildKnowledgeIndexes(scope).map(file => file.path));

  for (const entry of listWikiEntries(scope)) {
    if (entry.type !== 'file' || !isIndexFile(entry.relPath)) continue;
    if (expected.has(`wiki/${entry.relPath}`)) continue;

    const raw = readWikiFile(scope, entry.relPath);
    if (raw && raw.startsWith(GENERATED_MARKER)) removeWikiEntry(scope, entry.relPath);
  }
}
