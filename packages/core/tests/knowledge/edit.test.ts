import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { knowledgeDir, type Scope } from '../../src/paths.js';
import {
  listKnowledgeEntries,
  readKnowledgeEntryFile,
  writeKnowledgeFile,
  makeKnowledgeDir,
} from '../../src/store/index.js';
import {
  readKnowledgePageContent,
  createKnowledgeFolder,
  saveKnowledgePageBody,
  deleteKnowledgeEntry,
  renameKnowledgeEntry,
  createKnowledgePage,
  listKnowledgePages,
  assertInsideKnowledge,
  KnowledgeError,
} from '../../src/knowledge/index.js';
import { nowIso } from '../../src/utils/index.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-kn-'));
  dirs.push(root);
  const scope: Scope = { kind: 'project', root, withyDir: resolve(root, '.withy') };
  makeKnowledgeDir(scope, 'wiki'); // init 总会预建 knowledge/wiki;测试镜像之
  return scope;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const today = nowIso().slice(0, 10);

// 在 knowledge/ 下写一页(relPath 相对 knowledge/,如 'wiki/api.md'),供后续读写测试取用。
function seedPage(scope: Scope, relPath: string, raw: string): void {
  writeKnowledgeFile(scope, relPath, raw);
}

function pageRaw(id: string, title: string, body: string, extra: string[] = []): string {
  return ['---', `id: ${id}`, `title: ${title}`, ...extra, '---', '', body, ''].join('\n');
}

describe('assertInsideKnowledge', () => {
  it('normalizes a posix relPath and strips redundant segments', () => {
    expect(assertInsideKnowledge('a//b/./c.md')).toBe('a/b/c.md');
    expect(assertInsideKnowledge('a\\b.md')).toBe('a/b.md');
  });

  it('rejects traversal, absolute and drive-letter paths', () => {
    expect(() => assertInsideKnowledge('../x.md')).toThrow(KnowledgeError);
    expect(() => assertInsideKnowledge('wiki/../../x.md')).toThrow(KnowledgeError);
    expect(() => assertInsideKnowledge('/etc/passwd')).toThrow(KnowledgeError);
    expect(() => assertInsideKnowledge('C:/x.md')).toThrow(KnowledgeError);
    expect(() => assertInsideKnowledge('  ')).toThrow(KnowledgeError);
  });
});

describe('saveKnowledgePageBody', () => {
  it('preserves the frontmatter block verbatim (incl unknown fields) and sets updated to today', () => {
    const scope = createScope();
    const raw = pageRaw('api', 'API', 'old body', ['kind: spec', 'mystery: keep-me', 'updated: 2000-01-01']);
    seedPage(scope, 'wiki/api.md', raw);

    saveKnowledgePageBody(scope, 'wiki/api.md', '# New\n\nsee [[other]] and [[other|别名]]');

    const out = readKnowledgeEntryFile(scope, 'wiki/api.md') ?? '';
    expect(out).toContain('mystery: keep-me'); // 未知字段逐字保留
    expect(out).toContain('kind: spec');
    expect(out).toContain(`updated: ${today}`); // 就地置当天
    expect(out).not.toContain('updated: 2000-01-01');
    expect(out).toContain('[[other]] and [[other|别名]]'); // [[link]] 逐字保留(未被转义)
    expect(out).toContain('# New');
    expect(out).not.toContain('old body');
  });

  it('inserts an updated line when frontmatter lacks one', () => {
    const scope = createScope();
    seedPage(scope, 'wiki/p.md', pageRaw('p', 'P', 'body'));

    saveKnowledgePageBody(scope, 'wiki/p.md', 'new');

    expect(readKnowledgeEntryFile(scope, 'wiki/p.md')).toContain(`updated: ${today}`);
  });

  it('does not rebuild index.md on a body save', () => {
    const scope = createScope();
    seedPage(scope, 'wiki/p.md', pageRaw('p', 'P', 'body'));

    saveKnowledgePageBody(scope, 'wiki/p.md', 'changed');

    expect(existsSync(resolve(knowledgeDir(scope), 'index.md'))).toBe(false);
    expect(existsSync(resolve(knowledgeDir(scope), 'wiki', 'index.md'))).toBe(false);
  });

  it('rejects saving generated files (index.md / root log.md) and missing pages', () => {
    const scope = createScope();
    seedPage(scope, 'wiki/sub/a.md', pageRaw('a', 'A', 'x'));
    expect(() => saveKnowledgePageBody(scope, 'wiki/sub/index.md', 'x')).toThrow(KnowledgeError);
    expect(() => saveKnowledgePageBody(scope, 'log.md', 'x')).toThrow(KnowledgeError);
    expect(() => saveKnowledgePageBody(scope, 'wiki/nope.md', 'x')).toThrow(KnowledgeError);
  });
});

describe('readKnowledgePageContent', () => {
  it('returns body without frontmatter and marks generated files readonly', () => {
    const scope = createScope();
    seedPage(scope, 'wiki/p.md', pageRaw('p', 'P', '# Title\n\ntext'));
    seedPage(scope, 'wiki/sub/index.md', '<!-- gen -->\n\n# sub/');
    seedPage(scope, 'log.md', '# Knowledge log\n');

    expect(readKnowledgePageContent(scope, 'wiki/p.md')).toEqual({
      relPath: 'wiki/p.md',
      readonly: false,
      body: '# Title\n\ntext',
    });
    expect(readKnowledgePageContent(scope, 'wiki/sub/index.md')?.readonly).toBe(true);
    expect(readKnowledgePageContent(scope, 'log.md')?.readonly).toBe(true);
    expect(readKnowledgePageContent(scope, 'wiki/gone.md')).toBeNull();
  });
});

describe('createKnowledgePage', () => {
  it('slugifies the name, writes minimal frontmatter and rebuilds the index in wiki/', () => {
    const scope = createScope();
    seedPage(scope, 'wiki/sub/seed.md', pageRaw('seed', 'Seed', 'x'));

    const rel = createKnowledgePage(scope, 'wiki/sub', 'My New Page');
    expect(rel).toBe('wiki/sub/my-new-page.md');

    const raw = readKnowledgeEntryFile(scope, rel) ?? '';
    expect(raw).toContain('id: my-new-page');
    expect(raw).toContain('title: My New Page');
    expect(raw).toContain(`updated: ${today}`);

    // wiki/sub/index.md rebuilt to include the new page
    const subIndex = readKnowledgeEntryFile(scope, 'wiki/sub/index.md') ?? '';
    expect(subIndex).toContain('my-new-page.md');
  });

  it('rejects a slug that collides with any existing page id across the whole wiki', () => {
    const scope = createScope();
    seedPage(scope, 'wiki/a/dup.md', pageRaw('dup', 'Dup', 'x'));

    expect(() => createKnowledgePage(scope, 'wiki/b', 'Dup')).toThrow(KnowledgeError);
    expect(readKnowledgeEntryFile(scope, 'wiki/b/dup.md')).toBeNull(); // 冲突不写盘
  });

  it('creates a page in a non-wiki dir with frontmatter but no index rebuild and no id-collision check', () => {
    const scope = createScope();
    createKnowledgeFolder(scope, '', 'sources');
    // 与 wiki 页同名 slug 在非 wiki 目录不应被拦(命名空间独立)
    seedPage(scope, 'wiki/dup.md', pageRaw('dup', 'Dup', 'x'));

    const rel = createKnowledgePage(scope, 'sources', 'Dup');
    expect(rel).toBe('sources/dup.md');
    expect(readKnowledgeEntryFile(scope, 'sources/dup.md')).toContain('id: dup'); // 仍写最小 frontmatter
    // 非 wiki 不触发 index 重算
    expect(existsSync(resolve(knowledgeDir(scope), 'index.md'))).toBe(false);
    expect(existsSync(resolve(knowledgeDir(scope), 'sources', 'index.md'))).toBe(false);
  });
});

describe('createKnowledgeFolder', () => {
  it('creates an empty dir visible to the tree walk and produces no index', () => {
    const scope = createScope();

    const rel = createKnowledgeFolder(scope, 'wiki', 'New Topic');
    expect(rel).toBe('wiki/new-topic');
    expect(listKnowledgeEntries(scope)).toContainEqual({ relPath: 'wiki/new-topic', type: 'dir' });
    expect(readKnowledgeEntryFile(scope, 'wiki/new-topic/index.md')).toBeNull();
  });

  it('rejects an already-existing path', () => {
    const scope = createScope();
    createKnowledgeFolder(scope, 'wiki', 'dup');
    expect(() => createKnowledgeFolder(scope, 'wiki', 'dup')).toThrow(KnowledgeError);
  });
});

describe('renameKnowledgeEntry', () => {
  it('moves a file and rebuilds indexes', () => {
    const scope = createScope();
    seedPage(scope, 'wiki/sub/a.md', pageRaw('a', 'A', 'x'));

    renameKnowledgeEntry(scope, 'wiki/sub/a.md', 'wiki/sub/b.md');

    expect(readKnowledgeEntryFile(scope, 'wiki/sub/a.md')).toBeNull();
    expect(readKnowledgeEntryFile(scope, 'wiki/sub/b.md')).not.toBeNull();
  });

  it('moves a directory', () => {
    const scope = createScope();
    seedPage(scope, 'wiki/old/a.md', pageRaw('a', 'A', 'x'));

    renameKnowledgeEntry(scope, 'wiki/old', 'wiki/new');

    expect(readKnowledgeEntryFile(scope, 'wiki/new/a.md')).not.toBeNull();
    expect(listKnowledgeEntries(scope).some(e => e.relPath === 'wiki/old')).toBe(false);
  });

  it('rejects a target that already exists and generated-file renames', () => {
    const scope = createScope();
    seedPage(scope, 'wiki/a.md', pageRaw('a', 'A', 'x'));
    seedPage(scope, 'wiki/b.md', pageRaw('b', 'B', 'y'));

    expect(() => renameKnowledgeEntry(scope, 'wiki/a.md', 'wiki/b.md')).toThrow(KnowledgeError);
    expect(() => renameKnowledgeEntry(scope, 'wiki/sub/index.md', 'wiki/sub/x.md')).toThrow(KnowledgeError);
    expect(() => renameKnowledgeEntry(scope, 'log.md', 'notes.md')).toThrow(KnowledgeError);
  });
});

describe('deleteKnowledgeEntry', () => {
  it('deletes a file and cleans the orphaned generated index of an emptied dir', () => {
    const scope = createScope();
    // 先经领域函数建页,产出 wiki/sub/index.md(带 GENERATED_MARKER)
    createKnowledgePage(scope, createKnowledgeFolder(scope, 'wiki', 'sub'), 'only');
    expect(readKnowledgeEntryFile(scope, 'wiki/sub/index.md')).not.toBeNull();

    deleteKnowledgeEntry(scope, 'wiki/sub/only.md');

    // 该目录已无页 → 孤儿生成 index.md 被清理
    expect(readKnowledgeEntryFile(scope, 'wiki/sub/only.md')).toBeNull();
    expect(readKnowledgeEntryFile(scope, 'wiki/sub/index.md')).toBeNull();
  });

  it('deletes a directory recursively', () => {
    const scope = createScope();
    seedPage(scope, 'wiki/d/a.md', pageRaw('a', 'A', 'x'));
    seedPage(scope, 'wiki/d/b.md', pageRaw('b', 'B', 'y'));

    deleteKnowledgeEntry(scope, 'wiki/d');

    expect(listKnowledgeEntries(scope).some(e => e.relPath.startsWith('wiki/d'))).toBe(false);
  });

  it('rejects deleting generated files (index.md / root log.md)', () => {
    const scope = createScope();
    seedPage(scope, 'wiki/sub/index.md', '<!-- gen -->\n');
    seedPage(scope, 'log.md', '# Knowledge log\n');
    expect(() => deleteKnowledgeEntry(scope, 'wiki/sub/index.md')).toThrow(KnowledgeError);
    expect(() => deleteKnowledgeEntry(scope, 'log.md')).toThrow(KnowledgeError);
  });
});

describe('listKnowledgePages after CRUD', () => {
  it('reflects a freshly created wiki page', () => {
    const scope = createScope();
    createKnowledgePage(scope, 'wiki', 'Fresh');
    expect(listKnowledgePages(scope).map(p => p.id)).toContain('fresh');
  });
});

describe('listKnowledgeEntries', () => {
  it('spans all top-level folders and files but skips graph.json', () => {
    const scope = createScope();
    seedPage(scope, 'wiki/a.md', pageRaw('a', 'A', 'x'));
    seedPage(scope, 'sources/rfc.md', '# rfc');
    seedPage(scope, 'index.md', '# Knowledge');
    seedPage(scope, 'log.md', '# Knowledge log');
    writeKnowledgeFile(scope, 'graph.json', '{}');

    const rels = listKnowledgeEntries(scope).map(e => e.relPath);
    expect(rels).toEqual(
      expect.arrayContaining(['wiki', 'wiki/a.md', 'sources', 'sources/rfc.md', 'index.md', 'log.md']),
    );
    expect(rels).not.toContain('graph.json');
  });
});
