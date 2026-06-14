# Web 可视化设计

> 适用范围:`packages/app`(`@tuteur/app`,Next.js 16 App Router + React 19 + Tailwind 4)。
> 定位:实施规格级。dashboard 是**多项目管理器 + 全局配置台**,数据读写全部经 [@tuteur/core](./core.md),浏览器不碰 fs。
> 双层模型(全局/项目)见 [core.md §2](./core.md#2-双层模型全局-vs-项目);数据契约见 [core.md §7](./core.md#7-数据契约ai产出--cli记录--web展示--用户操作)。

---

## 1. 定位与两条铁律

dashboard 第一版追求**清晰与可观察**,不做复杂 workflow 编辑器。两条铁律:

1. **浏览器不直接碰 fs**。所有 `.tuteur/` 读写经 Next route handler(Node runtime)→ `@tuteur/core`。
2. **不重写 core 逻辑**。门禁/读取/状态机调用 core 的同一份实现,与 CLI 行为一致。

```text
Browser ──HTTP──► Next route handler(node runtime)──► @tuteur/core ──► .tuteur/
   ▲                        │
   └──── HTML / JSON ◄───────┘     浏览器永不 import 'node:fs',永不复制门禁逻辑
```

---

## 2. 多项目 + 全局模型(本轮核心变化)

dashboard 不再绑定单一项目。它同时面向**一个全局根**和**多个项目根**。

```text
            ┌──────────────────────────────┐
            │  Dashboard(单实例)           │
            └───────────┬──────────────────┘
        全局视图        │        项目视图(可切换)
   ~/.tuteur/config     │     <repoA>/.tuteur/   <repoB>/.tuteur/
   ~/.tuteur/projects   │     task 看板          task 看板
   ~/.tuteur/knowledge  │     context/knowledge  context/knowledge
   (不过滤用户)         │     (按 .developer 过滤)
```

### 2.1 项目注册与切换

```text
加项目按钮 → 选目录路径 → core.detectTuteur(path)
   ├─ 有 .tuteur/ → upsert 进 ~/.tuteur/projects.json → 出现在项目列表
   └─ 无 .tuteur/ → 提示未初始化,展示「初始化项目」按钮(§2.4)
切换项目 → 后续 API 带 ?project=<path> → core.resolveProjectScope(path)
```

### 2.2 过滤规则(core 决定)

| 视图 | scope | 用户过滤 |
| --- | --- | --- |
| 全局配置 | `~/.tuteur` | 不过滤(`shouldFilterByUser=false`) |
| 项目看板 | `<repo>/.tuteur` | 按 `.developer` 过滤 mine/all |

### 2.3 项目根传递

旧设计靠 `ttur dashboard start` 传单一 `TUTEUR_PROJECT_ROOT`。新设计:dashboard 启动只需能定位 `~/.tuteur`;**具体项目由前端选择,经 API `project` 参数传入**,不再由启动环境固定。`TUTEUR_PROJECT_ROOT` 退化为「无选择时的默认项目」兜底。

### 2.4 web 触发 init(可行,非权限问题)

dashboard 以**启动它的用户身份**运行,route handler `spawn('ttur', ['init', ...])` 对该用户可访问的目录有读写权,**无需提权,不存在权限问题**。会失败的只有「目录只读 / 属他人」这类边角,等同 CLI 手动 init 的报错。真正要解决的是 **init 的交互性**与**路径安全**:

```text
「初始化项目」按钮(无 .tuteur/ 时显示)
  → 表单字段 = INIT_QUESTIONS(core §8):agents 多选 / skills(link|copy) / user
  → POST /api/projects/init,body = `{ path, config: InitConfig }`(path 是 web 场景特有输入,不进 InitConfig 本体)
  → 校验:path 存在 / 是目录 / 无 .tuteur/(已存在则拒)→ 用户确认
  → serializeToCommand(config) → spawn('ttur', ['init','--codex','--claude','-u','yan'], { cwd: path })
  → 回传 exitCode + stdout/stderr 到页面
  → 成功 → upsert projects.json → 项目进入列表
```

web 表单与 CLI 交互**同源**:都读 `INIT_QUESTIONS`、产出同一个 `InitConfig`(core §8),`serializeToCommand` 把选择转成 **per-agent flag** 命令(`--codex --claude`,不用 `--agents`)。表单一次性收集,绝不依赖交互式 prompt。

---

## 3. 页面规划(MVP 范围以你的选择为准)

```text
全局
  /                顶层:项目列表(加项目/切换)+ 全局状态
  /settings        全局配置(~/.tuteur/config.json:默认 agent/workflow/dashboard)

项目(?project=<path>)
  /p/tasks         任务看板(按 status 分组)+ My/All + 卡住告警(重试超阈值标黄)+ 已归档筛选(completed/cancelled)
  /p/tasks/<id>    详情:phase 进度、artifact、归档按钮(未完成任务可标 cancelled)
    ├ 事件时间线(events.jsonl):验收尝试/跳步/跳过 + planned vs injected 注入对比 ← 发现 hook 失效的关键视图
    ├ approval 面板(展示 + 可选补批;CLI/agent 经 `ttur approve` 亦可写,§6)
    └ artifact 查看(md 渲染 / json 表格)
  /p/knowledge     知识库管理(全局+项目两区:条目 CRUD/tag/frontmatter + md 正文渲染 + 图谱视图[全局/项目/合并],knowledge.md §10)
  /p/context       注入编排器:按 default/node 勾选注入哪些知识 id、标必读/可选/禁用、实时预览注入块
  /p/workflow      workflow 画布编辑(skill 节点 + 分支节点,可编辑,§3.3)
  /p/members       成员名册(读 workspace/<slug>/)+ 按人过滤(可选)
```

### 3.1 关键视图:事件时间线与注入对比

详情页时间线读 `events.jsonl`(core §4.4),差异与异常即告警(core.md §7 不变量 3):

```text
09:30  session_start    注入 2/3:✓ api-conventions  ✓ prd.md  ⚠ test-policy 未注入 ← 对比 planned,红色高亮
09:50  complete finish  ✗ 拒绝:当前应完成 check(跳步)
10:02  complete check   ✗ 拒绝:tests failed(第 2 次,阈值 3)
10:15  complete check   ✓ 通过 → 推进至 finish
```

整段会话没有 `session_start` 事件 = hook 根本未触发(Codex 需手动开 feature flag,cli §8.4)。P2:跨任务聚合统计页(节点失败率、平均重试次数、最常缺产物、跳步频率),给用户优化 workflow 的方向。

### 3.2 现状(脚手架)

已实现:`layout.tsx`、`page.tsx`(读 summary 渲染产品卡+任务计数)、`api/health`、`dashboard/summary.ts`(读 `.developer` + 任务计数)、`product.ts`。
**`summary.ts` 自实现了任务读取、`product.ts` 抄了常量 —— 本轮要全部替换为 `@tuteur/core` 调用**(§5)。
未实现:多项目、全局配置、详情/run/context/approval/workflow 画布 所有视图与写 API。

### 3.3 workflow 画布编辑器

画布 = **三个固定阶段容器**(规划 / 执行 / 收尾,不可增删)+ 容器内/容器前的两类节点(core §4.3)。技术选型 **React Flow(`@xyflow/react`)的 Sub Flow**(`parentId` + `extent:'parent'`):三个容器是预置的父节点(不可删/改名),把 skill 拖进框即归属该阶段;连线由 `next`/`branches` 推导,**无需 n8n 那样的自由连线引擎**。

```text
            ┌─ 规划 ───────┐   ┌─ 执行 ──────┐   ┌─ 收尾 ─┐
<triage?>─standard─→│ brainstorm→grill-me │→│ dev → check │→│ wrapup │
        ├─small ───────────────────────────→┘(跳过规划)       │
        └─research ───────────────────────────────────────────→┘
```

- **skill 节点**:选 `skill`(下拉来自 `discoverSkills`,**按逻辑名去重**、按 `agent`/`source` tag 分组,core §5.1)、配可选 `gate`(artifacts/checks/approval)。
- **switch 节点**:配各 `branches`(`label` + `criteria` 判断说明 + `next` 目标节点);必须含一个 `default`。**靠 agent 判断**,无布尔表达式(core §4.3、harness §2.5)。
- 框自带进/出口端点(纯视觉);跨框只 `end→下一框 entry`;每框声明一个 `entry` 入口节点。
- 编辑后 `PUT /api/workflows/:id`,经 core 校验(连通、无环、阶段单调不倒退、switch 含 default、skill 可解析;第三方仅某工具有则警告)。
- 运行态高亮 `currentNode`、已完成节点、switch 实际判定(读 `state.decisions`,展示"判定 small,因为:…")。

MVP(你的选择):可编辑,三个固定容器 + skill/switch 两种节点,逻辑远比 n8n 简单。

---

## 4. API 路由规格(待实现)

只读可由 Server Component 直接调 core;**写操作与客户端交互走 route handler**,`export const runtime='nodejs'`。除 health/全局接口外,项目接口都带 `?project=<path>`。

| 方法 路径 | 作用 | 备注 |
| --- | --- | --- |
| `GET /api/health` | 健康检查 | ✅已实现 |
| `GET /api/projects` | 已知项目列表 | 读 `~/.tuteur/projects.json` |
| `POST /api/projects` | 加项目(校验+注册) | body `{ path }`,detectTuteur |
| `POST /api/projects/init` | 初始化未含 .tuteur 的项目 | body=`InitConfig{path,agents,skills,user}`,spawn ttur init(§2.4) |
| `GET\|PUT /api/global/config` | 全局配置 | `~/.tuteur/config.json` |
| `GET /api/tasks?project&filter` | 任务列表 | 项目级过滤 |
| `GET /api/tasks/:id?project` | 任务详情 | `{ task,state,artifacts,events }` |
| `GET /api/tasks/:id/events?project` | 事件时间线(events.jsonl) | 注入对比/重试/跳步/跳过 |
| `POST /api/tasks/:id/nodes/:node/complete?project` | 触发节点门禁 | 见 §4.1 |
| `POST /api/tasks/:id/archive?project` | 归档任务 | core.archiveTask:移目录(YYYY-MM 分桶)、默认不改状态(可标 cancelled)、不绑产物(core §9) |
| `POST /api/tasks/:id/approvals/:node?project` | 写 approval | §6 |
| `GET\|PUT /api/context?project` | context.json 读写(default/node 两层) | §3 注入编排器;knowledge.md §7 |
| `GET /api/knowledge?scope&project` | 知识库条目列表(scope=global\|project,带 frontmatter 索引) | `/p/knowledge` 两区;读 `knowledge/index.md`+frontmatter |
| `GET\|PUT\|POST\|DELETE /api/knowledge/:id?scope&project` | 知识条目读写/增删;读返回 `{ format, raw, frontmatter }`(`format` 缺省 `md`,前端按 format 选渲染器) | 知识库管理 + md 渲染;agent 也可直接改文件(knowledge.md §9/§10) |
| `GET /api/knowledge/graph?scope&project&merged` | 文档关系图(节点/边),`merged=1` 出全局+项目全景 | `/p/knowledge` 图谱视图;调 `ttur knowledge graph`(knowledge.md §9) |
| `GET /api/context/preview?project&node` | 预览本配置下拼出的注入块(resolvePlannedContext) | 注入编排器实时预览 |
| `GET\|PUT /api/workflows/:id?project` | workflow 节点图读写 | core 校验(连通/无环/阶段单调/switch default/skill 可解析) |
| `GET /api/skills?project` | skill 发现(discoverSkills) | 带 agent/source tag,画布下拉用 |
| `GET /api/events?project` | 实时事件(SSE 长连接) | 推 `task-updated` 等(§4.2) |

### 4.1 complete 端点 = 复用 core

```ts
// app/api/tasks/[id]/nodes/[node]/complete/route.ts
export const runtime = 'nodejs';
export async function POST(req: Request, { params }: Ctx) {
  const { id, node } = await params;
  const project = new URL(req.url).searchParams.get('project') ?? undefined;
  const scope = resolveProjectScope(project);                 // core
  const r = completeNode(scope, id, node);                     // core,与 CLI 同一实现
  return Response.json({ ok: r.ok, message: r.message, state: r.state },
                       { status: r.ok ? 200 : 422 });          // 门禁失败 exitCode 2 → 422
}
```

退出码 2 ↔ HTTP 422,让前端区分「门禁正常拒绝(展示缺失项)」与「服务器错误(5xx)」。

### 4.2 实时更新(文件监听 + SSE)

agent 在 CLI/对话里改 `.tuteur/`(写 artifact、`ttur complete` 改 state)是**另一个进程写盘**,web 不会自动反映。用 chokidar 监听 + SSE 推送实现实时:

```text
dashboard server:chokidar.watch(<当前项目>/.tuteur/{tasks,workflows,context.json})
   文件变化 → debounce(~200ms)→ 识别受影响 taskId
   → SSE 推 { type:'task-updated', taskId } 到 GET /api/events?project=<path>
浏览器:EventSource 收事件 → revalidate 该 task 数据 → 局部刷新
```

- 只 watch **前台打开的项目**;切换项目时切换 watch(不监听全部项目,控开销)。
- SSE 单向(server→浏览器)够用;写操作仍走 POST。chokidar 封装 win32 `fs.watch` 的不稳定。
- 备选轮询(实现最简,有延迟);你已选 watch+SSE。

---

## 5. 与 core 的复用(替换现状重复)

```text
       现状(重复)                       目标
  app/dashboard/summary.ts 自读任务   →  调 core.listTasks/readState
  app/product.ts 抄常量              →  从 core 复导出常量
  (与 CLI 易漂移)                    →  单一事实源,行为一致
```

落地顺序:先让 app 依赖 `@tuteur/core`,把 `summary.ts` 改成薄封装(调 `core.listTasks` + `core.isOwnedBy`),删 `product.ts` 自定义常量(core.md K6 / cli.md C1)。

---

## 6. Approval 机制

approval 写入口有两个**等价**通道:web 点确认、或 `ttur approve <node>`(agent/人均可跑,harness §2.6)。**不再要求必须经 web**——单人交互下 agent 替你跑 `ttur approve` 即可;web 是可选的展示 + 另一写入口。

```text
web 点确认 → POST /api/tasks/:id/approvals/:node?project
ttur approve <node>  ─┐
                      ├→ core.approveNode(scope,id,node,by)  写 state.approvals[node]={approvedAt,by} + approval 事件
ttur complete / complete 端点
                      → core.isApproved() 读 state.approvals → 未确认则门禁失败(exit 2 / 422)
```

要点:approval 并入 `state.json` 的 `approvals` 字段(不单独存 `approvals.json`,core §4.2);`by` 取 `.developer.slug`;rewind 会连带清掉被退回节点的批准;不轮询、不超时、无过期逻辑(批了一直有效,展示批准时间戳供人察觉)。**注意**:允许 agent 写 approval 等于把它降为"停下+留痕的软约定"(harness §2.6),web 面板主要用于事后审计与人工补批。

---

## 7. 进程与部署

| 项 | 现状 | 目标 |
| --- | --- | --- |
| 启动 | `ttur dashboard start` → `next dev` + 单 `TUTEUR_PROJECT_ROOT` | standalone server,不绑单项目;项目由前端选 |
| 监听 | `127.0.0.1:47321` | 不变,不暴露公网 |
| 全局根 | —— | 启动需能定位 `~/.tuteur`(无则首启引导 `ttur init --global`) |

Next 必须带 Node server(要文件访问 + 调 core),不能纯静态导出。生产改 `next build` + standalone。

---

## 8. 样式约定

Tailwind 4,浅色主题(背景 `#f7f7f4`,强调绿 `#27513a`),响应式 `max-[640px]`,主容器 `max-w-[960px]`。状态色固定语义:缺失/门禁未过=红、通过=绿、等待 approval=琥珀,在 run 差异/artifact/step 状态间统一复用。

---

## 9. 代码评价与 TODO

### 评价
- 脚手架的 SSR + 服务端读盘骨架正确,容错稳健。
- 最大风险仍是**逻辑重复**(summary.ts/product.ts),本轮通过依赖 core 根除。
- 多项目 + 全局是新增的真实需求,但要控制复杂度:全局根只放配置+注册表,任务始终属于项目(core.md 待确认)。

### TODO

| # | 项 | 优先级 | 依赖 |
| --- | --- | --- | --- |
| W1 | app 依赖 core,替换 summary.ts/product.ts | P0 | core K6 |
| W2 | 项目列表 + 加项目/切换(`/`、`/api/projects`) | P0 | core §2 |
| W3 | 任务看板 + 详情(`/p/tasks`、`/p/tasks/:id`) | P0 | task/state 落地 |
| W4 | 事件时间线页 + 注入对比(events.jsonl) | P1 | core §4.4(harness H5) |
| W5 | 全局配置页(`/settings`、`/api/global/config`) | P1 | core §2.1 |
| W6 | approval 面板(展示 + 补批;`ttur approve` 等价写入口,读写 `state.approvals`) | P1 | harness §2.6/H11 |
| W7 | 注入编排器页(`/p/context`,default/node 两层 + 实时预览)+ `GET\|PUT /api/context`、`/api/context/preview` | P1 | harness §4、knowledge.md §7 |
| W7b | 知识库管理页(`/p/knowledge`,全局+项目两区 CRUD/tag + md 正文渲染)+ `/api/knowledge`、`/api/knowledge/:id` | P1 | knowledge.md §10 |
| W7c | 知识库图谱视图(全局/项目/合并三档)+ `GET /api/knowledge/graph` + `ttur knowledge graph` | P2 | knowledge.md §9 |
| W8 | complete 按钮 → 复用 core,422 映射 | P1 | harness H3 |
| W9 | standalone server | P1 | §7 |
| W10 | workflow 画布编辑(三固定容器 + skill/switch 节点,React Flow Sub Flow)+ `GET\|PUT /api/workflows` | P1 | core §4.3、§3.3 |
| W11 | skill 选择器 + `GET /api/skills`(discoverSkills,带 tag) | P1 | core §5.1 |
| W12 | 归档筛选/按钮(`POST /api/tasks/:id/archive`) | P1 | core §9 |
| W13 | 实时更新:chokidar watch + SSE(`/api/events`) | P1 | §4.2 |
| W14 | ~~worktree/branch 展示~~ 已后置(core §9.1 方案存档) | P2 | core §9.1 |
| W15 | artifact 查看器 / members 页 | P2 | —— |

### 待确认
- dashboard 只读还是可编辑 artifact?**推荐**:只读 + approval/context 编辑;artifact 直接改文件更自然,后置。
- ~~加项目无 .tuteur 时是否 web 触发 init~~ → **已定:做「初始化项目」按钮**,web 经非交互 init 触发(§2.4;无权限问题,需路径校验+用户确认)。
- ~~run 实时日志~~ → run 模式已移除;事件时间线随 SSE `task-updated` 局部刷新即可,无流式日志需求。
