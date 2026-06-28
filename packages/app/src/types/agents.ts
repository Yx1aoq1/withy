// 子 agent 管理页视图模型。纯类型、无 @withy/core 依赖,供服务端读取层与客户端组件共享
// (客户端组件不可 import @withy/core —— 会把 node:fs 带进浏览器包)。

// 一个角色在某工具的投递态(已链 / 已生成 / 过期 / 缺失)。
export interface AgentDeliveryView {
  platform: string;
  format: string;
  state: 'linked' | 'generated' | 'stale' | 'missing';

  // 投递目标文件,相对项目根(如 .claude/agents/review.md)
  target: string;
}

// 列表项:角色名 + 描述 + 各工具投递态。
export interface AgentSummaryView {
  name: string;
  description?: string;
  source: 'project' | 'global';
  delivery: AgentDeliveryView[];
}

// 详情:角色 canonical 正文(frontmatter + body)+ 投递态,供编辑器加载。
export interface AgentDetailView {
  name: string;
  body: string;
  delivery: AgentDeliveryView[];
}
