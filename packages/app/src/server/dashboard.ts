// 服务端读取层:dashboard 的所有 .withy 读取都经此处调用 @withy/core,浏览器不碰 fs。
// 仅在 Server Component / route handler 中导入(模块会拉入 node:fs)。

import {
  DASHBOARD_PROJECT_ROOT_ENV,
  resolveProjectScope,
  resolveGlobalScope,
  discoverSkills,
  readGitStatus,
  readImplementation,
  readDeveloper,
  readWorkflow,
  readProjects,
  readState,
  listTasks,
  nodeById,
  phaseOf,
  isStuck,
} from '@withy/core';
import type { Scope, Task, TaskStatus } from '@withy/core';
import type {
  Phase,
  BoardCard,
  BoardData,
  CanvasData,
  ProjectCard,
  BoardColumn,
  ArchivedCard,
  ArchivedData,
  CanvasWorkflow,
  ArchivedGroup,
  Identity,
} from '@/types/dashboard';

// 画布默认编辑的 workflow id(对齐 init 落地的 default.workflow.json)
const DEFAULT_WORKFLOW_ID = 'default';

// 任务状态 → 看板列;cancelled 属归档,不上板
const COLUMN_BY_STATUS: Record<TaskStatus, BoardColumn | null> = {
  planning: 'todo',
  in_progress: 'doing',
  completed: 'done',
  cancelled: null,
};

/**
 * 按项目名(URL 身份 /<name>)解析 scope:查全局注册表得 path 再解析。
 * 重名取首个;名不存在或路径已失效返回 null。
 * @param name 路由段 params.project(已 URL 解码)
 */
export function resolveScopeByName(name: string): Scope | null {
  const ref = readProjects(resolveGlobalScope()).projects.find(project => project.name === name);
  return ref ? resolveProjectScope(ref.path) : null;
}

// 注册表里第一个可解析项目的名称;供根路由 landing 重定向。
export function getFirstProjectName(): string | null {
  for (const project of readProjects(resolveGlobalScope()).projects) {
    if (resolveProjectScope(project.path)) return project.name;
  }
  return null;
}

// 默认项目:环境变量优先,其次注册表里第一个可解析的项目
export function getDefaultProjectScope(): Scope | null {
  const fromEnv = process.env[DASHBOARD_PROJECT_ROOT_ENV];
  if (fromEnv) {
    const scope = resolveProjectScope(fromEnv);
    if (scope) return scope;
  }
  for (const project of readProjects(resolveGlobalScope()).projects) {
    const scope = resolveProjectScope(project.path);
    if (scope) return scope;
  }
  return null;
}

// 已登记项目列表(含 git 分支与任务计数),供侧栏渲染
export function getProjects(): ProjectCard[] {
  return readProjects(resolveGlobalScope()).projects.map(project => {
    const git = readGitStatus(project.path);
    const scope = resolveProjectScope(project.path);
    let taskCount = 0;
    if (scope) {
      try {
        taskCount = listTasks(scope).filter(task => task.status !== 'cancelled').length;
      } catch {
        taskCount = 0;
      }
    }

    return {
      path: project.path,
      name: project.name,
      branch: git.isRepo ? git.branch : null,
      dirty: git.dirtyCount,
      taskCount,
    };
  });
}

// 本地身份(全局优先,回退默认项目)
export function getIdentity(): Identity | null {
  const global = readDeveloper(resolveGlobalScope());
  if (global) return { name: global.name, slug: global.slug };
  const scope = getDefaultProjectScope();
  const dev = scope ? readDeveloper(scope) : null;
  return dev ? { name: dev.name, slug: dev.slug } : null;
}

// 看板视图模型:按列分组 + 每卡的阶段/节点/卡住/实施进度 + 是否归当前身份(mine 标记供客户端过滤)
export function getBoard(scope: Scope, identity: Identity | null): BoardData {
  const columns: Record<BoardColumn, BoardCard[]> = { todo: [], doing: [], done: [] };

  for (const task of listTasks(scope)) {
    const column = COLUMN_BY_STATUS[task.status];
    if (!column) continue;
    columns[column].push(toCard(scope, task, column, identity));
  }

  const counts: Record<BoardColumn, number> = {
    todo: columns.todo.length,
    doing: columns.doing.length,
    done: columns.done.length,
  };

  return { columns, counts, total: counts.todo + counts.doing + counts.done };
}

/**
 * 归档视图模型:读归档桶里的任务,按 YYYY-MM 月份分组(月份倒序、组内按归档时间倒序)。
 * 归档后任务目录已移入 archive/,进度数据按 id 不可读,故只带冻结的元信息(标题/负责人/归档时间/终态)。
 * @param scope 项目 scope
 * @param identity 本地身份;用于标记 mine 供「我的/全部」过滤
 */
export function getArchivedBoard(scope: Scope, identity: Identity | null): ArchivedData {
  const byBucket = new Map<string, ArchivedCard[]>();

  for (const task of listTasks(scope, { includeArchived: true })) {
    if (!task.archivedAt) continue;
    const bucket = task.archivedAt.slice(0, 7); // YYYY-MM
    const cards = byBucket.get(bucket) ?? [];
    const { phase, node } = readArchivedPhaseNode(scope, task);
    cards.push({
      id: task.id,
      title: task.title,
      owner: task.assignee || task.creator,
      mine: identity ? isOwnedBy(task, identity) : false,
      archivedAt: task.archivedAt,
      finalStatus: task.status,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      phase,
      node,
      implementation: readImplementationView(scope, task.id),
    });
    byBucket.set(bucket, cards);
  }

  const groups: ArchivedGroup[] = [...byBucket.entries()]
    .map(([bucket, cards]) => ({ bucket, cards: cards.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)) }))
    .sort((a, b) => b.bucket.localeCompare(a.bucket));

  return { groups, total: groups.reduce((sum, group) => sum + group.cards.length, 0) };
}

function isOwnedBy(task: Task, identity: Identity): boolean {
  return (
    task.creator === identity.name ||
    task.creator === identity.slug ||
    task.assignee === identity.name ||
    task.assignee === identity.slug
  );
}

// 单卡视图模型;state/workflow/implement 读取均容错,缺失时降级而非抛出
function toCard(scope: Scope, task: Task, column: BoardColumn, identity: Identity | null): BoardCard {
  const { phase, node } = readPhaseNode(scope, task);

  let stuck = false;
  if (node) {
    try {
      // 仅在节点存在时计算卡住,避免无意义的 git/事件读取
      if (nodeById(readWorkflow(scope, task.workflow), node)) stuck = isStuck(scope, task.id, node);
    } catch {
      stuck = false;
    }
  }

  return {
    id: task.id,
    title: task.title,
    owner: task.assignee || task.creator,
    mine: identity ? isOwnedBy(task, identity) : false,
    column,
    phase,
    node,
    stuck,
    implementation: readImplementationView(scope, task.id),
  };
}

// 读任务当前阶段与节点(state.currentNode → workflow phaseOf);任一缺失则降级,不抛。
// 活跃卡与归档卡共用 —— 归档任务的 state 经 core 的归档回退仍可按 id 读到,workflow 不归档故始终可读。
function readPhaseNode(scope: Scope, task: Task): { phase: Phase | null; node: string | null } {
  try {
    const node = readState(scope, task.id).currentNode;
    if (!node) return { phase: null, node: null };
    try {
      return { phase: phaseOf(readWorkflow(scope, task.workflow), node) as Phase | null, node };
    } catch {
      return { phase: null, node };
    }
  } catch {
    return { phase: null, node: null };
  }
}

// 归档卡专用:已完成任务的游标已跑过终点(currentNode=null),此处回退到最后一个完成节点,
// 使「归档时所在节点」显示它真正收束于哪个节点(如 finish)而非空兜底。
function readArchivedPhaseNode(scope: Scope, task: Task): { phase: Phase | null; node: string | null } {
  try {
    const state = readState(scope, task.id);
    const node = state.currentNode ?? state.completedNodes.at(-1) ?? null;
    if (!node) return { phase: null, node: null };
    try {
      return { phase: phaseOf(readWorkflow(scope, task.workflow), node) as Phase | null, node };
    } catch {
      return { phase: null, node };
    }
  } catch {
    return { phase: null, node: null };
  }
}

// 读实施计划视图模型;缺失或损坏降级为空。活跃卡与归档卡共用
function readImplementationView(scope: Scope, id: string): BoardCard['implementation'] {
  try {
    const implementation = readImplementation(scope, id);
    const items = implementation.items.map(item => ({
      id: item.id,
      text: item.text,
      done: item.done,
    }));
    return {
      done: items.filter(item => item.done).length,
      total: items.length,
      unparsed: implementation.unparsed,
      items,
    };
  } catch {
    return { done: 0, total: 0, unparsed: 0, items: [] };
  }
}

/**
 * 画布视图模型:读项目的 default workflow + 发现可拖入的 skill 列表。
 * workflow 缺失或损坏(项目未含 default.workflow.json)返回 null,页面据此渲染空态。
 * core 的 Workflow 结构与 CanvasWorkflow 一一对应(纯数据),直接作为视图模型回传。
 * @param scope 项目 scope
 */
export function getCanvas(scope: Scope): CanvasData | null {
  let workflow: CanvasWorkflow;
  try {
    workflow = readWorkflow(scope, DEFAULT_WORKFLOW_ID) as CanvasWorkflow;
  } catch {
    return null;
  }

  const skills = discoverSkills(scope).map(skill => ({
    name: skill.name,
    description: skill.description,
    source: skill.source,
  }));

  return { workflow, skills };
}
