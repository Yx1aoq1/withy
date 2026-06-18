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

| 视图     | scope            | 用户过滤                           |
| -------- | ---------------- | ---------------------------------- |
| 全局配置 | `~/.tuteur`      | 不过滤(`shouldFilterByUser=false`) |
| 项目看板 | `<repo>/.tuteur` | 按 `.developer` 过滤 mine/all      |

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
  /p/tasks         任务看板(按 status 分组)+ 用户过滤(全部/各负责人,默认当前用户)+ 卡住告警(重试超阈值标黄)+ 活跃/已归档顶部切换(归档列表按 YYYY-MM 月份分组、只读详情)
  /p/tasks/<id>    详情:三层进度(§3.4)、artifact、归档按钮(仅「已完成」任务;未完成任务标 cancelled 经 CLI `ttur archive --cancelled`)
    ├ 事件时间线(events.jsonl):验收尝试/跳步/跳过 + planned vs injected 注入对比 ← 发现 hook 失效的关键视图
    ├ approval 面板(展示 + 可选补批;CLI/agent 经 `ttur approve` 亦可写,§6)
    ├ 验收清单(checklist.json):可勾选,done/total 进度;勾选写回 = `ttur check done`(§3.4、core §4.7)
    └ artifact 查看(md 渲染 / json 表格)
  /p/knowledge     知识库管理(全局+项目两区:条目 CRUD/tag/frontmatter + md 正文渲染 + 图谱视图[全局/项目/合并],knowledge.md §10;含**产物模板** `kind:template` 的编辑)
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

### 3.3 workflow 画布编辑器(自由画布 + 软泳道)

> **设计调整(2026-06-17 画布编排轮)**:画布从「固定容器 Sub Flow」改为**自由画布 + 软泳道**,已落地。节点新增 `pos`(core §4.3),拖动落盘、拖停按所在横带写回 `phase`、贝塞尔自由连线;前一版的三容器 Sub-Flow 布局已被替换。

画布 = **n8n 式自由画布**(节点任意摆位、拖端口连线)+ **三条软泳道背景**(规划 / 执行 / 收尾,从 `workflow.phases` 顺序渲染)。核心原则:**「摆在哪(位置)」与「属于哪个阶段(phase)」解耦** —— 位置是自由坐标,阶段是节点上的字段 `phase`(驱动 task.status,core §4.3)。**泳道不进数据**,只做两件事:把节点拖进某条带 = 帮你写 `phase`、把 `phase` 画成看得见的背景区;**绝不用坐标反推 phase**。**不为 placement 加任何校验** —— 用户怎么摆就怎么存(入口落在哪阶段、某阶段空着、跳过整段,都按用户摆放接受)。本轮仍只编辑项目的 `default` workflow。

```text
┌┄ 规划 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
┆ ◇ triage[入口] → brainstorm → grill-me   ┆   暖金底(虚线包围)
└┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
            ↓  带间留间隔
┌┄ 执行 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
┆ dev → check → ◇ review                   ┆   暖陶土底
└┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
┌┄ 收尾 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
┆ wrapup[终点]  ← 节点带 pos、端口贝塞尔连线  ┆   暖橄榄底
└┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
```

布局与数据:

- **自由坐标 + 泳道容器**:节点新增 `pos:{x,y}`(core §4.3),纯展示、不参与校验;**`pos.x` 自由,`pos.y` 是「所在泳道内相对带顶的偏移」**(全局 y=带顶+max(HEADER,pos.y)),故节点恒在带内、不出带也不夹缝。泳道**横带、上→下 = 规划→执行→收尾**(flow 左→右),**按内容自动长高**、**带间留间隔**、**虚线包围 + 半透明暖色底**(规划金 mustard / 执行陶土 terracotta / 收尾橄榄 sage;底色半透明故不遮连线);泳道几何从 `phases` + 节点内容算出,不落盘。**无独立分诊列** —— `phase` 缺省 / `null` 的节点归入第一条泳道(规划)显示。
- **拖放即定阶段(怎么判断)**:拖动/拖入时取节点中心 y,命中所在泳道(命中带否则取最近带,带间间隔/上下溢出都归最近)→ 写回 `node.phase`,并把落点换算成带内相对 `pos`(`y` 钳到带顶之下),**松手即吸附进该带**(不出带、不夹缝)。带内 x/y 自由,**只有跨带才改阶段**;每次 drop 强制改写 `phase`,位置与 phase 由构造一致。
- **连线 = 端口拖拽**:skill 一个出口、switch 每分支一个出口;从出口拖到目标入口即写回 `next` / `branch.next`,改连 / 删连同步更新,**不用下拉选 next**;渲染**贝塞尔自由走线**(取代正交 smoothstep)、**统一同一种实线**(墨灰,分支靠 `label` 区分、不用虚线),`zIndex` 高于泳道背景故不被遮挡。
- **入口 / 终点标识**:入口节点(`entry`)标「入口」徽标、终点节点(skill `next:null`)标「终点」徽标(纯文字、纯展示;支持多终点)。
- **连线约束(保存时校验)**:连线/拖动当下**不拦、不实时标红**;保存时经 core 校验阶段单调 + 无环 + switch default,非法 → 422 + 顶部 issues 面板提示(本轮无画布内联红线,后置)。
- **节点来源(右栏列表,可拖入)**:特殊「分支(switch)」节点 + `discoverSkills` 发现的 skill(按逻辑名去重、带 `source` tag,core §5.1)。拖一项到画布即新建节点,落点泳道决定其初始 `phase`。
- **skill 节点**:`skill` 在建节点时即固定、**只读不可改**;配可选 `gate`(artifacts/checks/approval)。产物/检查为可增删的行编辑(编辑期允许空行即时可输入,保存前 `sanitizeWorkflow` 清理空行 / 空 gate)。`gate.artifacts` 仍支持 `{path,title?,template?}` 对象(编辑只改 path,保留 title/template)。
- **switch 节点**:编辑各 `branches`(`label` + `criteria` 判断说明 + `default` 单选,恰好一个);**靠 agent 判断**,无布尔表达式(core §4.3、harness §2.5)。
- **右侧面板(docked,宽度对齐看板详情 336px)**:未选中=可拖入的节点列表;选中=该节点配置表单,顶部「返回」回列表(非悬浮)。
- 保存 `PUT /api/workflows/:id`(URL 的 id 为写文件名的权威来源),经 core 校验(zod schema → 连通 / 无环 / 阶段单调 / switch default / skill 可解析;`pos` 入 schema 但不参与校验);结构 error 拒绝落盘(422 带 issues),skill / 模板悬空为 warning(允许保存、随响应回传提示)。core 侧 `writeWorkflow`(schema 校验后落盘,store.ts)。
- 后置(本轮未做):运行态高亮(`currentNode` / 已完成 / `state.decisions`)、多 workflow 切换选择器、artifact 模板下拉。

### 3.4 任务详情:三层进度(「什么完成了、什么没完成」)

任务详情用**三层叠起来**回答 PRD §10「随时知道所处阶段、缺什么」,三层都有现成数据源、互不重复:

```text
① 主体阶段(粗)  规划 ●━━ 执行 ○── 收尾 ○          ← phaseOf(currentNode),三框进度条
② 节点门禁(中)  grill-me:产物 design.md ✓ · approval ⚠待批
                 check:   npm test ✗(第 2 次,阈值 3)  ← gate 现算 + events 重试计数
③ 验收清单(细)  [x] 错误提示  [ ] 锁定 5 分钟  (1/2)   ← checklist.json,可勾选
```

| 层       | 数据源                                         | core                                             | 语义                                |
| -------- | ---------------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| 主体阶段 | `state.currentNode` → `phaseOf`                | 已实现                                           | 在哪个大阶段,驱动 task.status       |
| 节点门禁 | 当前节点 `gate` 现算 + `events.jsonl` 重试计数 | `completeNode` 预判 / `countConsecutiveFailures` | 这一步缺产物/检查没过/等批,卡住标黄 |
| 验收清单 | `checklist.json`(core §4.7)                    | `checklistProgress`                              | 逐条验收项的 done/未done,可勾选     |

- 验收清单**结构化(zod 校验)**而非解析 markdown checkbox——后者靠 agent 输出正确语法、解析丢项即静默失守,与 Tuteur「代码兜底」相悖(core §4.7)。勾选框 `onChange` → `PUT /api/tasks/:id/checklist`(等价 `ttur check done`),经 SSE 局部刷新(§4.2)。
- 状态色复用语义 token(design.md §3):缺失/未过=`terracotta`、通过=`teal`、待批=`mustard`(配 ✓/✗/⚠ 图标,不靠颜色单独表意)。

### 3.5 归档列表(活跃/已归档切换)

看板头部左上并排放「活跃 / 已归档」分段切换 + **用户过滤下拉**(无边框:全部 / 各负责人,默认选中当前用户名);选「已归档」把三列主区整体换成归档列表,用户过滤两视图共用。下拉选项由看板与归档里出现的 owner 去重而来,默认值取当前身份对应的 owner(任一 `mine` 卡片的 owner,兼容任务里存 name 或 slug)。归档数据走 core 现成的 `listTasks(scope, { includeArchived: true })`(按 `task.archivedAt` 非空筛出),**无需新 API**:归档/勾选写操作后 `router.refresh` 重算页面即同步,SSE `task-updated` 局部刷新亦覆盖。

```text
[活跃 ▸ 已归档(12)]  yan ▾            ← 左上:视图切换 + 用户过滤下拉(默认当前用户)
─────────────────────────────────────────────────────
 2026-06                                    ← YYYY-MM 月份桶(倒序)
   ✓ 登录重构        yan   06-12   已完成
   ✗ 旧版导出        lin   06-09   已取消
 2026-05
   ✓ 埋点接入        yan   05-28   已完成    点行 → 右侧只读详情
```

- 展示设计:按 `archivedAt.slice(0,7)` 的 **YYYY-MM 月份桶**分组(月份倒序、组内按归档时间倒序),每行=终态图标 + 标题 + 负责人 + 归档日(MM-DD)+ 终态文案,远比活跃卡片紧凑——行只给索引,细节进右侧详情。
- **只读详情(回看执行历史)**:复用活跃详情的三层展示但只读——主体阶段步进器、归档时所在节点、验收清单(只读)+ 完成度,再加生命周期(创建/完成/归档时间)与负责人;无勾选、无归档按钮。这要求按 id 能读到归档任务的 state/checklist:**core 的 `readTask/readState/readChecklist/readEvents` 在 live 路径缺失时回退遍历 `archive/YYYY-MM/` 桶(写入不回退,杜绝写归档),workflow 不归档故 `phaseOf` 始终可读**。完整事件时间线(events.jsonl)仍属任务详情页 W4 范畴,不塞进 336px 侧栏。
- 终态色复用语义 token:`completed`=✓ `teal`、`cancelled`=✗ `terracotta`、`planning/in_progress`(CLI 不标 cancelled 直接归档的边角态)=○ 中性。

---

## 4. API 路由规格(待实现)

只读可由 Server Component 直接调 core;**写操作与客户端交互走 route handler**,`export const runtime='nodejs'`。除 health/全局接口外,项目接口都带 `?project=<path>`。

| 方法 路径                                                 | 作用                                                                                               | 备注                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /api/health`                                         | 健康检查                                                                                           | ✅已实现                                                                               |
| `GET /api/projects`                                       | 已知项目列表                                                                                       | 读 `~/.tuteur/projects.json`                                                           |
| `POST /api/projects`                                      | 加项目(校验+注册)                                                                                  | body `{ path }`,detectTuteur                                                           |
| `POST /api/projects/init`                                 | 初始化未含 .tuteur 的项目                                                                          | body=`InitConfig{path,agents,skills,user}`,spawn ttur init(§2.4)                       |
| `GET\|PUT /api/global/config`                             | 全局配置                                                                                           | `~/.tuteur/config.json`                                                                |
| `GET /api/tasks?project&filter`                           | 任务列表                                                                                           | 项目级过滤                                                                             |
| `GET /api/tasks/:id?project`                              | 任务详情                                                                                           | `{ task,state,artifacts,events }`                                                      |
| `GET /api/tasks/:id/events?project`                       | 事件时间线(events.jsonl)                                                                           | 注入对比/重试/跳步/跳过                                                                |
| `POST /api/tasks/:id/nodes/:node/complete?project`        | 触发节点门禁                                                                                       | 见 §4.1                                                                                |
| `POST /api/tasks/:id/archive?project`                     | 归档任务                                                                                           | core.archiveTask:移目录(YYYY-MM 分桶)、默认不改状态(可标 cancelled)、不绑产物(core §9) |
| `POST /api/tasks/:id/approvals/:node?project`             | 写 approval                                                                                        | §6                                                                                     |
| `GET\|PUT /api/tasks/:id/checklist?project`               | 验收清单读写(勾选写回)                                                                             | core §4.7;`ttur check` 等价写入口;§3.4                                                 |
| `GET /api/tasks/:id/session-preview?project`              | 预览该任务当前会注入的 session-start 内容(段落 + planned 形态)                                     | 调 `renderSessionStart`;让用户在 web 看到「下次注入长这样」                            |
| `GET\|PUT /api/context?project`                           | context.json 读写(default/node 两层)                                                               | §3 注入编排器;knowledge.md §7                                                          |
| `GET /api/knowledge?scope&project`                        | 知识库条目列表(scope=global\|project,带 frontmatter 索引)                                          | `/p/knowledge` 两区;递归 `wiki/` 读各级 `index.md`+页 frontmatter                      |
| `GET\|PUT\|POST\|DELETE /api/knowledge/:id?scope&project` | 知识条目读写/增删;读返回 `{ format, raw, frontmatter }`(`format` 缺省 `md`,前端按 format 选渲染器) | 知识库管理 + md 渲染;agent 也可直接改文件(knowledge.md §9/§10)                         |
| `GET /api/knowledge/graph?scope&project&merged`           | 文档关系图(节点/边),`merged=1` 出全局+项目全景                                                     | `/p/knowledge` 图谱视图;调 `ttur knowledge graph`(knowledge.md §9)                     |
| `GET /api/context/preview?project&node`                   | 预览本配置下拼出的注入块(resolvePlannedContext)                                                    | 注入编排器实时预览                                                                     |
| `GET\|PUT /api/workflows/:id?project`                     | workflow 节点图读写 ✅已实现                                                                       | core 校验(连通/无环/阶段单调/switch default/skill 可解析);PUT 结构 error→422、warning 回传 |
| `GET /api/skills?project`                                 | skill 发现(discoverSkills)                                                                         | 带 source tag,画布右栏用;**已实现但无独立路由** —— 由 `getCanvas` 在 Server Component 内随 workflow 一并返回 |
| `GET /api/events?project`                                 | 实时事件(SSE 长连接)                                                                               | 推 `task-updated` 等(§4.2)                                                             |

### 4.1 complete 端点 = 复用 core

```ts
// app/api/tasks/[id]/nodes/[node]/complete/route.ts
export const runtime = 'nodejs';
export async function POST(req: Request, { params }: Ctx) {
  const { id, node } = await params;
  const project = new URL(req.url).searchParams.get('project') ?? undefined;
  const scope = resolveProjectScope(project); // core
  const r = completeNode(scope, id, node); // core,与 CLI 同一实现
  return Response.json({ ok: r.ok, message: r.message, state: r.state }, { status: r.ok ? 200 : 422 }); // 门禁失败 exitCode 2 → 422
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

| 项     | 现状                                                                                          | 目标                                |
| ------ | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| 启动   | `ttur dashboard start` 门禁=全局根存在;不绑单项目,cwd 是项目时仅作默认兜底                    | standalone server(脱离 monorepo,W9) |
| 监听   | `127.0.0.1:47321`                                                                             | 不变,不暴露公网                     |
| 全局根 | 启动须能定位 `~/.tuteur`(`runtime/dashboard.json` 也写此处);缺失报错引导 `ttur init --global` | 不变                                |

> 启动不再要求 cwd 是已初始化项目(旧行为会因当前目录无 `.tuteur/` 报 "not initialized")。门禁改为**全局根**:dashboard 读全局 `projects.json` 注册表渲染项目列表,具体项目是否初始化由 web 端按 §2.1/§2.4 检测与引导 init。`TUTEUR_PROJECT_ROOT` 仅在 cwd 本身是项目时注入作默认兜底(§2.3)。

Next 必须带 Node server(要文件访问 + 调 core),不能纯静态导出。生产改 `next build` + standalone。

---

## 8. 样式约定

> **视觉规范已独立到 [design.md](./design.md)**:视觉主题、配色 token、字号、间距、组件样式、排版规则全部在那里定义并维护。本节只保留 web 需要知道的接口契约,不再复制色值——避免双份漂移。

- **统一主题**:砚墨 Ink-stone(中性燕麦纸 + 暖炭墨底),亮暗双主题;详见 design.md §2/§3。
- **token 单一来源**:`packages/app/src/app/globals.css`(`@theme` 静态 token + `@theme inline` 语义色映射)。页面**只用工具类**(`bg-paper`/`text-ink`/`border-line`/`text-teal`/`rounded-card`/`shadow-card`/`font-serif`…),**不硬编码 hex**。
- **主题切换**:`<html data-theme="light|dark">`,默认 light;切属性即整体跟随。
- **语义色(固定语义,配 ✓/✗/⚠ 图标)**:通过=`teal` · 失败/缺失/卡住=`terracotta` · 待批=`mustard` · 信息=`blue` · 品牌=墨(`brand`);状态色在 artifact / 事件 / 节点 step / 注入对比间统一复用。完整色值与亮暗两列见 design.md §3。
- **组件视觉契约**(任务卡、phase-pill、badge、三层进度、事件时间线、面板/表格/表单/空态、浮动导航)见 design.md §6;字号阶梯 §4、间距/圆角/容器/响应式 §5、排版规则 §7。
- 视觉参考小样:`.temp/web-style-demo.html`(单主题看板)、`.temp/theme-proposals.html`(四主题对比)。现有 `app/page.tsx` 等若含旧脚手架硬编码 hex,重建时按 design.md 迁到工具类。

---

## 9. 代码评价与 TODO

### 评价

- 脚手架的 SSR + 服务端读盘骨架正确,容错稳健。
- 最大风险仍是**逻辑重复**(summary.ts/product.ts),本轮通过依赖 core 根除。
- 多项目 + 全局是新增的真实需求,但要控制复杂度:全局根只放配置+注册表,任务始终属于项目(core.md 待确认)。

### TODO

| #   | 项                                                                                                        | 优先级 | 依赖                        |
| --- | --------------------------------------------------------------------------------------------------------- | ------ | --------------------------- |
| W1  | app 依赖 core,替换 summary.ts/product.ts                                                                  | P0     | core K6                     |
| W2  | 项目列表 + 加项目/切换(`/`、`/api/projects`)                                                              | P0     | core §2                     |
| W3  | 任务看板 + 详情(`/p/tasks`、`/p/tasks/:id`)                                                               | P0     | task/state 落地             |
| W4  | 事件时间线页 + 注入对比(events.jsonl)                                                                     | P1     | core §4.4(harness H5)       |
| W5  | 全局配置页(`/settings`、`/api/global/config`)                                                             | P1     | core §2.1                   |
| W6  | approval 面板(展示 + 补批;`ttur approve` 等价写入口,读写 `state.approvals`)                               | P1     | harness §2.6/H11            |
| W7  | 注入编排器页(`/p/context`,default/node 两层 + 实时预览)+ `GET\|PUT /api/context`、`/api/context/preview`  | P1     | harness §4、knowledge.md §7 |
| W7b | 知识库管理页(`/p/knowledge`,全局+项目两区 CRUD/tag + md 正文渲染)+ `/api/knowledge`、`/api/knowledge/:id` | P1     | knowledge.md §10            |
| W7c | 知识库图谱视图(全局/项目/合并三档)+ `GET /api/knowledge/graph` + `ttur knowledge graph`                   | P2     | knowledge.md §9             |
| W8  | complete 按钮 → 复用 core,422 映射                                                                        | P1     | harness H3                  |
| W9  | standalone server                                                                                         | P1     | §7                          |
| W10 | workflow 画布编辑(自由画布 + 软泳道,skill/switch 节点,React Flow)+ `GET\|PUT /api/workflows` ✅已实现 | P1     | core §4.3、§3.3             |
| W11 | skill 选择器 + skill 发现(discoverSkills,带 tag)✅已实现(随 `getCanvas` 返回,无独立路由)                | P1     | core §5.1                   |
| W12 | 归档按钮 + 活跃/已归档切换列表(`POST /api/tasks/:id/archive`、`listTasks includeArchived`)✅已实现(展示侧,§3.5) | P1     | core §9                     |
| W13 | 实时更新:chokidar watch + SSE(`/api/events`)                                                              | P1     | §4.2                        |
| W14 | ~~worktree/branch 展示~~ 已后置(core §9.1 方案存档)                                                       | P2     | core §9.1                   |
| W15 | artifact 查看器 / members 页                                                                              | P2     | ——                          |
| W16 | 任务详情三层进度(phase/gate/checklist)+ 验收清单可勾选 + `GET\|PUT /api/tasks/:id/checklist`              | P1     | core §4.7、§3.4             |
| W17 | session-start 预览(`GET /api/tasks/:id/session-preview`)+ 画布节点产物清单/模板引用                       | P2     | core §4.3.1、harness §6.4   |

### 待确认

- dashboard 只读还是可编辑 artifact?**推荐**:只读 + approval/context 编辑;artifact 直接改文件更自然,后置。
- ~~加项目无 .tuteur 时是否 web 触发 init~~ → **已定:做「初始化项目」按钮**,web 经非交互 init 触发(§2.4;无权限问题,需路径校验+用户确认)。
- ~~run 实时日志~~ → run 模式已移除;事件时间线随 SSE `task-updated` 局部刷新即可,无流式日志需求。
