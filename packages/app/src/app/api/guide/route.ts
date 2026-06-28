import { resolveProjectScope, writeGuide, readGuide } from '@withy/core';

export const runtime = 'nodejs';

function projectScope(req: Request) {
  const project = new URL(req.url).searchParams.get('project') ?? undefined;
  return resolveProjectScope(project);
}

// 读 .withy/guide.md(session-start 注入的工具引语);缺文件返回空串。
export async function GET(req: Request): Promise<Response> {
  const scope = projectScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });
  return Response.json({ ok: true, body: readGuide(scope) ?? '' });
}

// 写 .withy/guide.md(注入管理页 context 功能);经 core writeGuide 落盘 — design §6.2。
export async function PUT(req: Request): Promise<Response> {
  const scope = projectScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid json body' }, { status: 400 });
  }

  const text = (body as { body?: unknown })?.body;
  if (typeof text !== 'string') {
    return Response.json({ ok: false, error: 'body required' }, { status: 400 });
  }

  try {
    writeGuide(scope, text);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'write failed';
    return Response.json({ ok: false, error: message }, { status: 422 });
  }
}
