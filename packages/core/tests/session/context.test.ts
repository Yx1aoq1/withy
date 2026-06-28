import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePlannedContext } from '../../src/session/context.js';
import { renderSessionStart } from '../../src/session/hook.js';
import type { Scope } from '../../src/paths.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-ctx-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

function writeWiki(scope: Scope, id: string, frontmatter: Record<string, string>, body = 'body'): void {
  const dir = resolve(scope.withyDir, 'knowledge', 'wiki');
  mkdirSync(dir, { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  writeFileSync(resolve(dir, `${id}.md`), `---\n${fm}\n---\n\n${body}\n`);
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('resolvePlannedContext — injectByDefault aggregate', () => {
  it('returns only entries flagged injectByDefault', () => {
    const scope = createScope();
    writeWiki(scope, 'always', { id: 'always', title: 'Always On', inject: 'index', injectByDefault: 'true' });
    writeWiki(scope, 'opt', { id: 'opt', title: 'Opt In', inject: 'index', injectByDefault: 'false' });

    const planned = resolvePlannedContext(scope);
    expect(planned.map(e => e.id)).toEqual(['always']);
  });

  it('is empty when nothing is flagged', () => {
    const scope = createScope();
    writeWiki(scope, 'opt', { id: 'opt', title: 'Opt In', inject: 'index' });
    expect(resolvePlannedContext(scope)).toEqual([]);
  });
});

describe('renderSessionStart — injectByDefault flows into the snapshot', () => {
  it('injects a flagged index entry into the session-start text', () => {
    const scope = createScope();
    writeWiki(scope, 'standards', {
      id: 'standards',
      title: 'Team Standards',
      summary: 'always-on coding rules',
      inject: 'index',
      injectByDefault: 'true',
    });

    const result = renderSessionStart(scope);
    expect(result.injected).toContain('standards');
    expect(result.text).toContain('Team Standards');
  });
});
