import {
  resolveProjectScope,
  removeAgentDefinition,
  writeAgentDefinition,
  removeAgentDelivery,
  canonicalAgentPath,
  deployAgents,
} from '@withy/core';
import { getAgentDetail } from '@/server/agents';

export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ role: string }>;
}

function projectScope(req: Request) {
  const project = new URL(req.url).searchParams.get('project') ?? undefined;
  return resolveProjectScope(project);
}

// 读单角色 canonical 正文 + 投递态。
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { role } = await params;
  const scope = projectScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  const detail = getAgentDetail(scope, role);
  if (!detail) return Response.json({ ok: false, error: `agent "${role}" not found` }, { status: 404 });
  return Response.json({ ok: true, agent: detail });
}

// 新建/编辑角色:写 canonical .agents/agents/<role>.md,再经 core 投递到各工具 — design §6.3。
export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  const { role } = await params;
  const scope = projectScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid json body' }, { status: 400 });
  }

  const content = (body as { body?: unknown })?.body;
  if (typeof content !== 'string') {
    return Response.json({ ok: false, error: 'body required' }, { status: 400 });
  }

  try {
    canonicalAgentPath(scope, role); // 角色名安全校验(越界即抛)
    writeAgentDefinition(scope, role, content);
    const delivered = deployAgents(scope, role);
    return Response.json({ ok: true, delivered });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'write failed';
    return Response.json({ ok: false, error: message }, { status: 422 });
  }
}

// 删除角色:删 canonical + 解除各工具投递(软链/生成的 toml)。
export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  const { role } = await params;
  const scope = projectScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });

  try {
    canonicalAgentPath(scope, role); // 角色名安全校验
    const removed = removeAgentDelivery(scope, role);
    removeAgentDefinition(scope, role);
    return Response.json({ ok: true, removed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'delete failed';
    return Response.json({ ok: false, error: message }, { status: 422 });
  }
}
