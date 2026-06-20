import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { knowledgeDir, type Scope } from './paths.js';
import { listWikiEntries, readWikiFile, writeWikiFile } from './store.js';
import {
  readKnowledgePageContent,
  createKnowledgeFolder,
  saveKnowledgePageBody,
  deleteKnowledgeEntry,
  renameKnowledgeEntry,
  createKnowledgePage,
  listKnowledgePages,
  assertInsideWiki,
  KnowledgeError,
} from './knowledge.js';
import { nowIso } from './utils/index.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-kn-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const today = nowIso().slice(0, 10);

// 在 wiki/ 下写一页(relPath 相对 wiki/),供后续读写测试取用。
function seedPage(scope: Scope, relPath: string, raw: string): void {
  writeWikiFile(scope, relPath, raw);
}

function pageRaw(id: string, title: string, body: string, extra: string[] = []): string {
  return ['---', `id: ${id}`, `title: ${title}`, ...extra, '---', '', body, ''].join('\n');
}

describe('assertInsideWiki', () => {
  it('normalizes a posix relPath and strips redundant segments', () => {
    expect(assertInsideWiki('a//b/./c.md')).toBe('a/b/c.md');
    expect(assertInsideWiki('a\\b.md')).toBe('a/b.md');
  });

  it('rejects traversal, absolute and drive-letter paths', () => {
    expect(() => assertInsideWiki('../x.md')).toThrow(KnowledgeError);
    expect(() => assertInsideWiki('a/../../x.md')).toThrow(KnowledgeError);
    expect(() => assertInsideWiki('/etc/passwd')).toThrow(KnowledgeError);
    expect(() => assertInsideWiki('C:/x.md')).toThrow(KnowledgeError);
    expect(() => assertInsideWiki('  ')).toThrow(KnowledgeError);
  });
});

describe('saveKnowledgePageBody', () => {
  it('preserves the frontmatter block verbatim (incl unknown fields) and sets updated to today', () => {
    const scope = createScope();
    const raw = pageRaw('api', 'API', 'old body', ['kind: spec', 'mystery: keep-me', 'updated: 2000-01-01']);
    seedPage(scope, 'api.md', raw);

    saveKnowledgePageBody(scope, 'api.md', '# New\n\nsee [[other]] and [[other|别名]]');

    const out = readWikiFile(scope, 'api.md') ?? '';
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
    seedPage(scope, 'p.md', pageRaw('p', 'P', 'body'));

    saveKnowledgePageBody(scope, 'p.md', 'new');

    expect(readWikiFile(scope, 'p.md')).toContain(`updated: ${today}`);
  });

  it('does not rebuild index.md on a body save', () => {
    const scope = createScope();
    seedPage(scope, 'p.md', pageRaw('p', 'P', 'body'));

    saveKnowledgePageBody(scope, 'p.md', 'changed');

    expect(existsSync(resolve(knowledgeDir(scope), 'index.md'))).toBe(false);
    expect(existsSync(resolve(knowledgeDir(scope), 'wiki', 'index.md'))).toBe(false);
  });

  it('rejects saving index.md and missing pages', () => {
    const scope = createScope();
    seedPage(scope, 'sub/a.md', pageRaw('a', 'A', 'x'));
    expect(() => saveKnowledgePageBody(scope, 'sub/index.md', 'x')).toThrow(KnowledgeError);
    expect(() => saveKnowledgePageBody(scope, 'nope.md', 'x')).toThrow(KnowledgeError);
  });
});

describe('readKnowledgePageContent', () => {
  it('returns body without frontmatter and marks index.md readonly', () => {
    const scope = createScope();
    seedPage(scope, 'p.md', pageRaw('p', 'P', '# Title\n\ntext'));
    seedPage(scope, 'sub/index.md', '<!-- gen -->\n\n# sub/');

    expect(readKnowledgePageContent(scope, 'p.md')).toEqual({
      relPath: 'p.md',
      readonly: false,
      body: '# Title\n\ntext',
    });
    expect(readKnowledgePageContent(scope, 'sub/index.md')?.readonly).toBe(true);
    expect(readKnowledgePageContent(scope, 'gone.md')).toBeNull();
  });
});

describe('createKnowledgePage', () => {
  it('slugifies the name, writes minimal frontmatter and rebuilds the index', () => {
    const scope = createScope();
    seedPage(scope, 'sub/seed.md', pageRaw('seed', 'Seed', 'x'));

    const rel = createKnowledgePage(scope, 'sub', 'My New Page');
    expect(rel).toBe('sub/my-new-page.md');

    const raw = readWikiFile(scope, rel) ?? '';
    expect(raw).toContain('id: my-new-page');
    expect(raw).toContain('title: My New Page');
    expect(raw).toContain(`updated: ${today}`);

    // sub/index.md rebuilt to include the new page
    const subIndex = readWikiFile(scope, 'sub/index.md') ?? '';
    expect(subIndex).toContain('my-new-page.md');
  });

  it('rejects a slug that collides with any existing page id across the whole wiki', () => {
    const scope = createScope();
    seedPage(scope, 'a/dup.md', pageRaw('dup', 'Dup', 'x'));

    expect(() => createKnowledgePage(scope, 'b', 'Dup')).toThrow(KnowledgeError);
    expect(readWikiFile(scope, 'b/dup.md')).toBeNull(); // 冲突不写盘
  });
});

describe('createKnowledgeFolder', () => {
  it('creates an empty dir visible to the tree walk and produces no index', () => {
    const scope = createScope();

    const rel = createKnowledgeFolder(scope, '', 'New Topic');
    expect(rel).toBe('new-topic');
    expect(listWikiEntries(scope)).toContainEqual({ relPath: 'new-topic', type: 'dir' });
    expect(readWikiFile(scope, 'new-topic/index.md')).toBeNull();
  });

  it('rejects an already-existing path', () => {
    const scope = createScope();
    createKnowledgeFolder(scope, '', 'dup');
    expect(() => createKnowledgeFolder(scope, '', 'dup')).toThrow(KnowledgeError);
  });
});

describe('renameKnowledgeEntry', () => {
  it('moves a file and rebuilds indexes', () => {
    const scope = createScope();
    seedPage(scope, 'sub/a.md', pageRaw('a', 'A', 'x'));

    renameKnowledgeEntry(scope, 'sub/a.md', 'sub/b.md');

    expect(readWikiFile(scope, 'sub/a.md')).toBeNull();
    expect(readWikiFile(scope, 'sub/b.md')).not.toBeNull();
  });

  it('moves a directory', () => {
    const scope = createScope();
    seedPage(scope, 'old/a.md', pageRaw('a', 'A', 'x'));

    renameKnowledgeEntry(scope, 'old', 'new');

    expect(readWikiFile(scope, 'new/a.md')).not.toBeNull();
    expect(listWikiEntries(scope).some(e => e.relPath === 'old')).toBe(false);
  });

  it('rejects a target that already exists and index.md renames', () => {
    const scope = createScope();
    seedPage(scope, 'a.md', pageRaw('a', 'A', 'x'));
    seedPage(scope, 'b.md', pageRaw('b', 'B', 'y'));

    expect(() => renameKnowledgeEntry(scope, 'a.md', 'b.md')).toThrow(KnowledgeError);
    expect(() => renameKnowledgeEntry(scope, 'sub/index.md', 'sub/x.md')).toThrow(KnowledgeError);
  });
});

describe('deleteKnowledgeEntry', () => {
  it('deletes a file and cleans the orphaned generated index of an emptied dir', () => {
    const scope = createScope();
    // 先经领域函数建页,产出 sub/index.md(带 GENERATED_MARKER)
    createKnowledgePage(scope, createKnowledgeFolder(scope, '', 'sub'), 'only');
    expect(readWikiFile(scope, 'sub/index.md')).not.toBeNull();

    deleteKnowledgeEntry(scope, 'sub/only.md');

    // 该目录已无页 → 孤儿生成 index.md 被清理
    expect(readWikiFile(scope, 'sub/only.md')).toBeNull();
    expect(readWikiFile(scope, 'sub/index.md')).toBeNull();
  });

  it('deletes a directory recursively', () => {
    const scope = createScope();
    seedPage(scope, 'd/a.md', pageRaw('a', 'A', 'x'));
    seedPage(scope, 'd/b.md', pageRaw('b', 'B', 'y'));

    deleteKnowledgeEntry(scope, 'd');

    expect(listWikiEntries(scope).some(e => e.relPath.startsWith('d'))).toBe(false);
  });

  it('rejects deleting index.md', () => {
    const scope = createScope();
    seedPage(scope, 'sub/index.md', '<!-- gen -->\n');
    expect(() => deleteKnowledgeEntry(scope, 'sub/index.md')).toThrow(KnowledgeError);
  });
});

describe('listKnowledgePages after CRUD', () => {
  it('reflects a freshly created page', () => {
    const scope = createScope();
    createKnowledgePage(scope, '', 'Fresh');
    expect(listKnowledgePages(scope).map(p => p.id)).toContain('fresh');
  });
});
