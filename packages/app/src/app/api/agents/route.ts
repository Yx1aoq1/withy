import { resolveProjectScope } from '@withy/core';
import { listAgents } from '@/server/agents';

export const runtime = 'nodejs';

function projectScope(req: Request) {
  const project = new URL(req.url).searchParams.get('project') ?? undefined;
  return resolveProjectScope(project);
}

// 列出全部子 agent 角色 + 各工具投递态(注入管理页 agents 功能)。
export async function GET(req: Request): Promise<Response> {
  const scope = projectScope(req);
  if (!scope) return Response.json({ ok: false, error: 'project not resolved' }, { status: 400 });
  return Response.json({ ok: true, agents: listAgents(scope) });
}
