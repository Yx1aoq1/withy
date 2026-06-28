// 子 agent 管理页的服务端读取层:把 core 的发现/投递态适配成视图模型。
// 仅 server component / route handler(node runtime)使用;客户端组件不可 import @withy/core。

import { getAgentDeliveryStatus, readAgentDefinition, discoverAgents } from '@withy/core';
import type { AgentDeliveryView, AgentSummaryView, AgentDetailView } from '@/types/agents';
import type { Scope } from '@withy/core';

function deliveryOf(scope: Scope, role: string): AgentDeliveryView[] {
  return getAgentDeliveryStatus(scope, role).map(status => ({
    platform: String(status.platform),
    format: status.format,
    state: status.state,
    target: status.target,
  }));
}

/** 列出全部角色 + 各工具投递态(注入管理页 agents 功能)。 */
export function listAgents(scope: Scope): AgentSummaryView[] {
  return discoverAgents(scope).map(agent => ({
    name: agent.name,
    description: agent.description,
    source: agent.source,
    delivery: deliveryOf(scope, agent.name),
  }));
}

/** 读单角色 canonical 正文 + 投递态;角色不存在返回 null。 */
export function getAgentDetail(scope: Scope, role: string): AgentDetailView | null {
  const body = readAgentDefinition(scope, role);
  if (body === null) return null;
  return { name: role, body, delivery: deliveryOf(scope, role) };
}
