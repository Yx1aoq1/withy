# Core 设计(@tuteur/core)

> 定位:实施规格级。`@tuteur/core` 是**唯一**的 `.tuteur/` 读写层、领域逻辑层与类型/校验事实源。CLI、app、hook 全经它访问数据。
> 本文是 [cli.md](./cli.md)、[harness.md](./harness.md)、[web.md](./web.md) 的共同底座 —— 双层数据格式、用户模型、InitConfig、归档、数据契约都在此定义。
> 参考实现:Trellis(`mindfold-ai/Trellis`)的注册表+configurator+shared 三层、归档移目录、身份文件 gitignore 等做法。**关键分歧**:Trellis 不做全局且禁止在 home 运行;我们要做全局,故对全局安装设了安全边界(§2.3)。
> 状态:**P0 已落地**(types/paths/store/domain/context/skills/hook/utils/agents 已实现并接入 CLI;全局 scope、InitConfig、discoverSkills 富化、worktree 等仍为推荐设计)。逐项见 [INDEX §3 实现状态矩阵](./INDEX.md#3-实现状态矩阵)。

---

## 1. 为什么要这个包

最初三处各读各的 `.tuteur/`(cli installation、app summary.ts、旧 py hook),且 app 抄常量,必然漂移。`@tuteur/core` 已收口为唯一逻辑层(CLI 已全量接入;app 接入待办,见 INDEX §3):

```
        ┌────────────────────────────┐
        │        @tuteur/core         │  唯一 fs 读写 + 门禁 + 校验 + 类型 + 常量
        └───┬─────────────┬───────────┘
       @tuteur/cli    @tuteur/app
            │
   平台 hook 脚本 → ttur hook → cli → core
```

铁律:**除 `core/store/*` 外,任何地方不准 `import 'node:fs'` 碰 `.tuteur/`。**

---

## 2. 双层数据模型(重新设计,逐文件定义)

存在两个根。**它们不是同构的** —— 全局是「配置 + 项目注册表 + 模板源」,项目才是「任务事实源」。

### 2.1 全局根 `~/.tuteur/`(单人,不过滤用户)

| 路径 | 格式 | git | 内容 | 谁用 |
| --- | --- | --- | --- | --- |
| `config.json` | JSON | —(在 home) | 全局默认:默认 agent/workflow、dashboard 偏好、skills 默认落地方式 | web 全局设置页读写;CLI init 读默认 |
| `projects.json` | JSON | — | 已知项目注册表 `[{path,name,addedAt}]` | web 多项目看板的列表源 |
| `workflows/*.workflow.json` | JSON | — | **可选**:跨项目复用的 workflow 模板 | 新项目 init 时作为模板候选 |
| `knowledge/` | 目录 | — | **可选**:跨项目复用的全局知识库(条目模型见 [knowledge.md](./knowledge.md));新项目 init 时作为模板候选 | 注入候选;web 知识库管理 |
| `workspace/` | 任意 | — | 全局个人草稿 | 本人 |

全局根**没有** tasks(已定,§10)、没有 workspace 名册、没有 `.developer`(全局即本人,无需过滤)。worktree 并行已移出 MVP(§9.1 方案存档)。

```jsonc
// ~/.tuteur/config.json
{
  "version": "0.1.0",
  "defaults": { "agent": "codex", "workflow": "default", "skills": "link" },
  "dashboard": { "host": "127.0.0.1", "port": 47321 }
}
// ~/.tuteur/projects.json
{ "projects": [ { "path": "/Users/yan/work/app-a", "name": "app-a", "addedAt": "2026-06-12T..." } ] }
```

### 2.2 项目根 `<repo>/.tuteur/`(协作,过滤用户)

| 路径 | 格式 | git | 内容 | 谁用 |
| --- | --- | --- | --- | --- |
| `config.json` | JSON | 共享 | 项目配置:默认 workflow/agent、任务过滤、dashboard 端口 | web/CLI 读 |
| `guide.md` | MD | 共享 | **会话开场说明**(项目须知/Tuteur 介绍);session-start 注全文,用户直接编辑(harness §6.4) | hook 注入;web 编辑 |
| `context.json` | JSON | 共享 | 默认注入上下文配置 | harness 注入;web context 页编辑 |
| `workflows/*.workflow.json` | JSON | 共享 | workflow 定义(门禁依据) | harness 门禁;web workflow 页 |
| `knowledge/` | 目录 | 共享 | 项目知识库(`sources/`+`wiki/`(可分子目录)+ 每级 `index.md`+`log.md`,karpathy 模式;条目 schema 见 [knowledge.md](./knowledge.md)) | hook 注入(注索引);web 知识库管理 |
| `tasks/<id>/task.json` | JSON | 共享 | 任务元数据 | web 看板/详情;CLI/门禁 |
| `tasks/<id>/state.json` | JSON | 共享 | workflow 进度游标(currentNode/completedNodes/decisions/**approvals**) | web 进度;门禁推进 |
| `tasks/<id>/<artifact>` | MD/JSON | 共享 | agent 产物(design.md 等,**按需**) | web artifact 查看;门禁 `gate.artifacts` |
| `tasks/<id>/events.jsonl` | JSONL | 共享 | 事件流水:验收尝试/会话注入/跳过(§4.4) | web 事件时间线与统计;CLI/hook 追加 |
| `tasks/archive/<YYYY-MM>/<id>/` | 目录 | 共享 | 归档任务(整目录迁入,按归档月分桶,§9) | web 归档视图 |
| `template-hashes.json` | JSON | 共享 | skill 模板哈希(update 用) | CLI update |
| `workspace/<slug>/` | 任意 | **共享(提交)** | 用户级内容(草稿/笔记);**子目录名即项目成员名册**(§3) | 本人写;web/CLI 读名册 |
| `.developer` | JSON | **本地(gitignore)** | 当前开发者身份(对齐 Trellis `.developer`) | web 默认过滤;CLI mine |
| `runtime/` | JSON | **本地(gitignore)** | dashboard pid/port、当前任务指针 `current-task.json`(harness §7.1) | CLI dashboard/hook |

`.tuteur/.gitignore` 固定忽略:`.developer`、`runtime/`、`*.tmp`、`*.new`。**`workspace/` 提交进仓库**(对齐 Trellis)——其子目录 `workspace/<slug>/` 的集合就是项目成员名册,无需单独 `members.json`(§3)。

### 2.3 全局安全边界(Trellis 教训)

Trellis 禁止在 home 运行,因为它会在项目根建 `.claude`/`.codex`,而 home 下这些目录是 agent 自己的全局运行时,uninstall 会误删。我们的对策:

- 全局根用**自有命名空间 `~/.tuteur/`**,绝不在 home 直接建 `.claude`/`.codex`/`.agent`。
- **`ttur init --global` 只装 workflow 模板 + 全局 config + projects 注册表,不做任何 agent 平台适配**(不在 home 建 skill 目录)。agent 适配只在项目级发生。
- 因此 §2.1 全局根没有 `.agent/skill`、没有平台目录。skill 适配是项目级概念。

### 2.4 路径解析 API

```ts
// core/paths.ts
export interface Scope { kind: 'global' | 'project'; root: string; tuteurDir: string; }
export function resolveGlobalScope(): Scope;                    // ~/.tuteur
export function resolveProjectScope(from?: string): Scope | null; // 向上找含 .tuteur 的目录
export function detectTuteur(path: string): boolean;           // 加项目时校验
export function taskDir(scope: Scope, id: string): string;
```

`resolveProjectScope` 优先级:显式 `from` > `TUTEUR_PROJECT_ROOT` > `INIT_CWD` > `cwd`,逐级向上找(吸收已删 `context.ts` 职责)。仓库根探测同 Trellis 的「向上找 `.tuteur/`」,支持嵌套仓库。

---

## 3. 用户模型

按你的决策:**对齐 Trellis —— `.developer` 存本地身份(gitignore),`workspace/` 提交进仓库、其子目录即成员名册,不单独维护 `members.json`。** 项目级过滤、全局级不过滤。

```text
身份(我是谁)   .tuteur/.developer        本地(gitignore)  { "name":"Yan","slug":"yan","initializedAt":"..." }
名册(有谁)     .tuteur/workspace/<slug>/ 共享(提交)      子目录集合 = 项目成员;友好名读 <slug>/index.md 的 H1
个人内容(我的) .tuteur/workspace/<slug>/ 共享(提交)      草稿/笔记/私有上下文(随仓库走,换机不丢)
```

- `ttur init -u <name>`:用户名来源 `--user` > `git config user.name` > 交互(同 Trellis)。写 `.developer` + 建 `workspace/<slug>/index.md`(`# <name>`),后者一提交就把「我」登记进名册。
- **名册从 `workspace/` 派生,不再有 `members.json`**:`workspace/<slug>/` 子目录名的集合就是「这个项目有谁」(都是提交内容);友好名取 `workspace/<slug>/index.md` 的 H1,缺省用 slug。这与 Trellis 一致(Trellis 也无名册文件,workspace 子目录即开发者列表)。
- 过滤口径 = **assignee**(对齐 Trellis 的 `--mine`),core 提供:

```ts
export function shouldFilterByUser(scope: Scope): boolean { return scope.kind === 'project'; }
export function isOwnedBy(task: Task, user: LocalUser): boolean {
  return task.assignee === user.slug || task.assignee === user.name;
}
export function listDevelopers(scope: Scope): { slug: string; name: string }[];  // 读 workspace/*/ 目录名 + index.md H1
```

不引入用户级 context 覆盖层(个性化靠全局/项目知识库,knowledge.md §7),也不引入名册文件,保持简单。

### 3.1 user ↔ task 关联(参考 Trellis)

Trellis 用 task.json 的 `assignee`(developer 名)关联人与任务,`--mine` 按 assignee 过滤,create 时 assignee 默认当前 developer、缺身份则报错。Tuteur 同构,但用 `.developer.slug` 作 key、`creator`+`assignee` 双字段:

| 字段 | 含义 | 写入时机 |
| --- | --- | --- |
| `creator` | 谁建的(留痕,不改) | create 时 = 当前 `.developer.slug` |
| `assignee` | 谁负责(过滤口径,可改派) | create 时默认 = 当前 `.developer.slug`;`--assignee <slug>` 改派他人 |

- **create 关联规则**:`creator = 当前 .developer.slug`;`assignee = --assignee ?? 当前 .developer.slug`。**既无 `.developer` 又无 `--assignee` → 快速失败**(对齐 Trellis「No developer set」),提示先 `ttur init -u` 或显式 `--assignee`,不静默建无主任务。
- **`--mine` = assignee 过滤**(`isOwnedBy`,上方);全局根不过滤(`shouldFilterByUser`)。
- **名册校验靠 `workspace/`**:改派/`--assignee` 的 slug 是否「在册」= `workspace/<slug>/` 是否存在(`listDevelopers`,§3);不在册可警告,不阻断——Tuteur 只做本地协作过滤,不做访问控制(PRD §7.10)。
- 改派:`ttur task assign <task> <slug>`(或 `task create --assignee`)只改 `assignee`,`creator` 不变。

---

## 4. 核心数据结构(重新设计)

全部用 zod 定义(TS 类型 + 运行时校验)。损坏文件**快速失败**并指明路径,不静默兜底。

### 4.1 task.json

把「状态」与「归档」「完成时间」分清:归档是动作不是状态,完成有独立时间戳。

```jsonc
{
  "id": "06-12-add-auth",          // <MM-DD>-<slug>,参考 Trellis 命名,人读友好且有序
  "title": "Add authentication",
  "workflow": "default",           // 引用 workflows/<id>.workflow.json
  "status": "planning",            // planning | in_progress | completed | cancelled(cancelled 仅归档动作可写入)
  "creator": "yan",                // workspace slug;create 时 = 当前 .developer.slug(§3.1)
  "assignee": "yan",               // 过滤口径(--mine);默认 = 当前 .developer.slug,可 --assignee/task assign 改派(§3.1)
  "priority": "normal",            // low | normal | high(可选)
  "tags": [],                      // 可选
  "createdAt": "2026-06-12T10:00:00.000Z",
  "completedAt": null,             // workflow 全完成时写
  "archivedAt": null               // 归档动作时写(目录已迁入 archive/<YYYY-MM>/)
}
```

web 看板只需 `id/title/status/assignee/priority`;详情页加 `createdAt/completedAt/archivedAt`。

### 4.2 state.json(workflow 进度游标)

workflow 定义是静态的,state 是动态游标,由门禁维护:

```jsonc
{
  "taskId": "06-12-add-auth",
  "currentNode": "grill-me",          // 当前待完成的节点(skill 或 switch);null=workflow 完成
  "completedNodes": ["triage", "brainstorm"],   // 已完成的节点(switch 也由 agent 完成,计入)
  "decisions": {                              // 每个 switch 的判定结果(可审计/web 展示)
    "triage": { "branch": "small", "reason": "只加一个按钮", "by": "yan", "at": "2026-06-12T10:20:00.000Z" }
  },
  "approvals": {                              // 人工确认记录(gate.approval 的门禁输入),按节点 id
    "grill-me": { "approvedAt": "2026-06-12T10:25:00.000Z", "by": "yan" }
  },
  "updatedAt": "2026-06-12T10:30:00.000Z"
}
```

phase 不进 state,**纯派生**:节点的阶段归属是它在 workflow 里的容器(planning/execute/finish 三个固定框,§4.3),core 导出 `phaseOf(wf, nodeId)` 查容器成员;hook/complete/task 三处共用此函数,不各算各的。`task.status` 由 `phaseOf(currentNode)` 驱动(planning 框→planning;execute/finish 框→in_progress;`currentNode==null`→completed;阶段框之前的分诊节点不改 status,保持初始 planning)。门禁失败不改变 state——停留原节点修复后再次 complete 即返工(harness §2.4);switch 判错用 `ttur rewind` 退回(harness §3.1),并连带清掉被退回节点及其下游的 `approvals`。**approval 并入 state(不单独存 `approvals.json`)**:它是门禁输入,和 `decisions` 一样属当前权威态;`ttur approve` 写 `state.approvals` 并追加一条 `approval` 审计事件(§4.4)。workflow 校验拒绝带环图,state 无迭代轮次概念。

### 4.3 workflow.json(节点图:固定阶段容器 + 两类节点)

workflow 由**三个固定的阶段容器**(planning / 执行 / 收尾,不可增删,§7.3)+ 容器内/容器前的**两类节点**组成。两类节点:

- **skill 节点**:引用一个 skill(指路牌)。语义=agent 走到这儿先读 `skill` 指向的 skill、按它做完,再 `ttur complete <node>` 推进。**单出**(`next`),入度不限。可选挂门禁 `gate`。
- **switch 节点**:岔路口。**靠 agent 判断**走哪条(语义判断,表达不成布尔式),每条分支自带 `criteria` 判断说明。agent 走到 switch **停下**,判定后 `ttur complete <node> --branch <label> --reason "..."`;系统记 `state.decisions` 并路由(harness §2.5/§3)。必须有且仅有一个 `default` 兜底分支。

图必须**无环**(返工=停留原节点重试,harness §2.4;switch 判错用 `ttur rewind` 退回,harness §3.1;validate 拒绝回边)。出边内嵌为 `next`/`branches`,省去独立 `edges[]`。`entry` 是全局入口(可以是阶段框之前的分诊节点);`next:null` 是终点。每个节点的阶段归属由它所在容器决定(画布上拖进哪个框);`phase:null` = 阶段框之前的分诊区。

```jsonc
{
  "id": "default", "name": "Default Coding Workflow", "version": "0.3.0",
  "entry": "triage",
  "phases": [                                  // 固定有序骨架:驱动 task.status + web 进度条/画布三框
    { "id": "planning", "label": "规划", "entry": "brainstorm" },   // entry=从框外进入该阶段的唯一落点(单入校验)
    { "id": "execute",  "label": "执行", "entry": "dev" },
    { "id": "finish",   "label": "收尾", "entry": "wrapup" }
  ],
  "nodes": [
    // 分诊区(phase:null,画在三框左侧)
    { "id":"triage", "type":"switch",
      "branches":[
        { "label":"standard", "criteria":"常规需求,需要完整规划再开发", "default":true, "next":"brainstorm" },
        { "label":"small",    "criteria":"改动小、风险低,可跳过规划直接开发", "next":"dev" },
        { "label":"research", "criteria":"只需调研、产出结论,不写生产代码", "next":"wrapup" }
      ] },
    // planning 框
    { "id":"brainstorm", "type":"skill", "skill":"brainstorm", "phase":"planning", "next":"grill-me" },
    { "id":"grill-me",   "type":"skill", "skill":"grill-me",   "phase":"planning", "next":"dev",
      "gate": { "artifacts":["design.md"], "approval":true } },
    // execute 框
    { "id":"dev",   "type":"skill", "skill":"dev",   "phase":"execute", "next":"check" },
    { "id":"check", "type":"skill", "skill":"check", "phase":"execute", "next":"wrapup",
      "gate": { "checks":["npm test"] } },
    // finish 框
    { "id":"wrapup", "type":"skill", "skill":"finish", "phase":"finish", "next":null }
  ]
}
```

| 节点字段 | 适用 | 语义 |
| --- | --- | --- |
| `type` | 全部 | `skill` \| `switch` |
| `skill` | skill | 引用的 skill 名(§5 发现/解析;只存名,不存路径/来源) |
| `next` | skill | 唯一后继 id;`null`=终点 |
| `branches` | switch | `[{label, criteria, next} \| {label, criteria, default:true, next}]`;**必须有且仅有一个 default**(validate 强制) |
| `criteria` | switch 分支 | 该分支的判断说明(给 agent 看,据此选路) |
| `gate` | skill | **可选**门禁:`{ artifacts?: ArtifactSpec[], checks?: string[], approval?: boolean }`(§4.3.1;`ArtifactSpec`=`string \| {path,title?,template?}`);大多数节点不写 |
| `phase` | 全部 | 阶段归属(=画布上所在容器);`null`=分诊区,不改 task.status |

**switch 不再自动求值、不再读 signal**:harness 走到 switch **停下**,把各分支 `criteria` 输出给 agent,agent 判定后用 `ttur complete <node> --branch <label> --reason` 报出;非法分支/缺 `--branch` → 门禁失败(exit 2)停下重判;判定记 `state.decisions[node]={branch,reason,by,at}` + 一条事件(§4.4)。一个 workflow 含多个 switch 互不影响(各记各的 nodeId)。原 `decision`/`signal`/`decision.json#/...`(JSON Pointer)/"三类信号源"模型**已废弃**(harness §2.5)。

#### 4.3.1 门禁 `gate`(可选,确定性核对)

```jsonc
"gate": {
  "artifacts": [                // 这些文件要在、且非空(只核存在性,不校内容)
    "design.md",                //   简写:仅路径(向后兼容)
    { "path":"design.md", "title":"设计文档", "template":"design-template" }  // 对象:带展示名 + 模板引用
  ],
  "checks":    ["npm test"],    // 这些命令要退出 0(直接写命令字符串)
  "approval":  true             // 需 ttur approve <node>(记入 state.approvals)
}
```

三项全可选,没 `gate` 的节点做完直接 complete。**产物只核"存在 + 非空"(L1)**——挡住忘产出/空文件,确定性、便宜、不误判;**内容对不对不由门禁判**(避免引入模型不确定性/schema 引擎),交给 `approval`(人看)或 `checks`(校验命令)。

**artifact 项的两种写法(`ArtifactSpec`)**:可为纯路径字符串(向后兼容),或对象 `{ path, title?, template? }`。`title` 是 web 展示名(画布节点列「本步产出:设计文档」);`template` 引用一条 `kind:template` 的知识 id(knowledge.md §4.1),供 session-start 把模板正文注给 agent、web 预览/编辑模板。**门禁只看 `path`(存在+非空)**——`title`/`template` 纯展示与注入用,不参与放行,红线不动。产物「长什么样」归模板(knowledge),「怎么做出来」归 skill,workflow 只声明「要哪些产物 + 引哪个模板」,不内联 prompt 正文(职责分离,harness §5)。

#### 4.3.2 节点类型内置描述(core 常量,不写进 workflow.json)

每种 `type` 对应一份固定 `desc`,渲染 workflow 给 agent 读时附上,告诉它"这类节点数据干嘛用":

```ts
const NODE_TYPE_DESC = {
  skill:  "技能节点 —— 进入后先读 skill 指向的指引,按它完成本步,门禁齐全后 `ttur complete <node>` 推进。",
  switch: "判断节点 —— 对照各分支 criteria 判断当前任务命中哪条,执行 `ttur complete <node> --branch <label> --reason \"...\"`;default 兜底。",
};
```

### 4.4 events.jsonl(事件流水,审计与统计数据源)

run 模式已移除(交互模式唯一,Tuteur 不启动/托管 agent 进程),`events.jsonl` 是执行过程的唯一记录:按时间追加(单进程顺序写,普通 `appendFile`,不上锁——不考虑同任务多窗口并发推进)、一行一条紧凑 JSON(reason 截断 ~200 字、不存大块内容/产物正文),**随任务目录提交进 git**(换环境不丢任务可视内容)。CLI(complete/decide/rewind/skip)与 hook(session-start)写入,web 事件时间线与统计页读取。

```jsonc
{"ts":"...","type":"complete_attempt","node":"check","ok":false,"reason":"check tests failed (exit 1)"}
{"ts":"...","type":"complete_attempt","node":"check","ok":true}                                      // 成功无需 reason
{"ts":"...","type":"complete_attempt","node":"finish","ok":false,"reason":"当前应完成 check"}        // 喊错节点 = 跳步证据
{"ts":"...","type":"decision","node":"triage","branch":"small","reason":"只加一个按钮","by":"yan"}    // switch 判定
{"ts":"...","type":"rewind","node":"triage","by":"yan","reason":"判错了"}                             // switch 回退(harness §3.1)
{"ts":"...","type":"approval","node":"grill-me","by":"yan"}                                           // 人工确认(同时写 state.approvals)
{"ts":"...","type":"session_start","injected":["api-conventions","tasks/06-12-add-auth/design.md"]}
{"ts":"...","type":"skip","node":"check","by":"yan","reason":"flaky check,人工放行"}
```

字段约定:`by` 只在人工动作/判定上记(取 `.developer.slug`);成功 complete 不记 reason(state 已有结果);命令输出只在失败 `reason` 里截尾,不存全量。

**state vs events(不是重复,形态/职责不同)**:`state.json` 是**当前快照**(覆盖式,只留最新游标,门禁/推进读它);`events.jsonl` 是**全程流水**(追加式,记下所有 state 里没有的东西——失败尝试、注入清单、跳过/回退的原因与时间)。仅"成功完成的节点 / switch 判定"在两者间轻微重叠(events 多带时间戳),换来完整有序时间线。两个都留:删 events 丢审计/告警/hook 生效性,删 state 则每次定位要重放日志(慢且脆)。

用途:重试告警线(**从 events 派生、不进 state**:对当前节点数"自上次 ok:true 或进入该节点以来连续的 `ok:false` 次数",超过 `config.json` 阈值 → 看板标黄;一次成功 complete 或一次 rewind 清零;**门禁本身永不自动放行**,harness §2.4)、跳步/遵从率统计(P2 统计页:节点失败率、平均重试、最常缺产物)、hook 生效性判断(有 `session_start` 即 hook 已触发,`injected` 与计划注入对比;整段会话事件缺失 = hook 根本未触发)。

### 4.5 context.json

```jsonc
// context.json —— 默认注入上下文(harness §4、knowledge.md §7);按知识 id 引用,分两层(项目共享,不分用户)
{ "default": { "required":["api-conventions"], "optional":["db-schema"], "disabled":[] },
  "nodes": { "dev": { "required":["api-conventions","test-policy"] } } }      // 按节点 id 差异化
```

> 人工确认记录(approvals)已并入 `state.json` 的 `approvals` 字段(§4.2),不再有独立 `approvals.json`。
> 无 `members.json`:成员名册由提交的 `workspace/<slug>/` 子目录派生(`listDevelopers`,§3),对齐 Trellis。
> **注全文 vs 注索引**:`context.json` 只说「注哪些知识 id、按哪步」,**注入形态(全文/索引)由各知识条目的 `inject: full | index` 字段决定**(knowledge.md §4/§7)——产物模板、必读短规范等注全文,规范库等长文档注索引(`title+summary+路径`),`resolvePlannedContext` 据此返回带形态的清单(harness §4/§6.4)。**会话须知(guide.md)不在此列**——它是工具文件 `.tuteur/guide.md`,session-start 直接读取注全文,不走 context.json/知识库(§2.2、harness §6.4)。

### 4.6 分支判定记录(已并入 state.decisions,不再有 decision.json 产物)

switch 的判定**不产出独立 artifact**,直接由 agent 经 `ttur complete <node> --branch <label> --reason` 报出,记入 `state.decisions[node] = { branch, reason, by, at }`(§4.2)+ 一条 `decision` 事件(§4.4)。它是**可见、可审计**的——web 在节点上展示「判定为 small → 走 dev,因为:只加一个按钮」,用户能看到为什么走这条。原 `decision.json` 产物 + `signal` JSON Pointer 取值模型**已废弃**(harness §2.5)。

### 4.7 checklist.json(验收清单:结构化、可视化、不进硬门禁)

任务的「什么完成了、什么没完成」需要在 web 上清晰可见。Trellis 把验收项写成 prd.md 里的 `- [ ]` markdown checkbox——但它**没有 web**,checkbox 只给 agent/人看,解析丢项无所谓。Tuteur 有 web 要可视化进度,**靠 agent 输出正确 markdown 语法**既不可靠(写成普通 list 就抓空)、又与 Tuteur「不靠模型自觉、用代码兜底」的立身之本相悖。因此验收清单用**结构化 + zod 校验**的产物,而非 markdown 解析:

```jsonc
// tasks/<id>/checklist.json —— task 级产物,提交进 git;agent 维护、web 渲染+可勾选
{ "items": [
    { "id":"ac-1", "text":"登录失败显示明确错误提示", "done":false, "node":"dev" },
    { "id":"ac-2", "text":"连续错误 5 次锁定 5 分钟",   "done":true,  "node":"dev" } ] }
```

```ts
export const ChecklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean().default(false),
  node: z.string().optional(),   // 关联到哪个节点的验收(web 按节点分组,可选)
});
export const ChecklistSchema = z.object({ items: z.array(ChecklistItemSchema).default([]) });
export type Checklist = z.infer<typeof ChecklistSchema>;
```

设计要点:

- **可靠**:走 zod(同 task.json/state.json),格式损坏 → 快速失败报错 → agent 修正,**不静默丢项**。「依赖模型输出」json 一样有,但 json 有校验关、md 没有——这是关键差别。
- **不笨重**:勾选不靠 agent 重写整个文件,提供确定性命令 `ttur check add/done/undo/list`(确定性优先);agent 只在 planning(grill-me)阶段把验收点写进去一次。
- **不与 design.md 重复**:design.md 是方案叙述(给人读),checklist.json 是可测验收项(给 web/统计用),职责不同;grill-me skill 负责从 design 提炼验收项进 checklist。
- **守红线(默认不进硬门禁)**:gate 至多核 `checklist.json` 存在+非空(L1,把它当普通 artifact 声明即可);**勾没勾不参与放行,纯 web 展示与跨任务统计数据源**。「收尾前要求全勾」作为可选 gate(`gate.checklistDone:true`)留待确认、默认关——它是确定性布尔核对(不引入模型不确定性,同 `checks` 退出码性质),但 agent 能自己勾(同 approval 的软约定),价值有限。
- **进度派生**:`done / total` 由 core 派生(`checklistProgress`),web 任务详情第三层渲染可勾选清单 + `3/5`;task.json 不存 checklist(对齐 Trellis,元数据保持干净)。

---

## 5. Store API(唯一碰盘层)

repository 风格,全部接 `Scope`。这是 §1 铁律的落点,CLI/app 共用,无第二套读盘实现。

```ts
// 读
listTasks(scope, { includeArchived? }): Task[];
readTask(scope, id): Task;   readState(scope, id): State;
readWorkflow(scope, id): Workflow;   readContextConfig(scope): ContextConfig;
readEvents(scope, taskId): TaskEvent[];   readArtifact(scope, taskId, rel): string;
readChecklist(scope, taskId): Checklist;   // tasks/<id>/checklist.json(缺省空,§4.7)
listDevelopers(scope): Developer[];   listProjects(): ProjectRef[];   // 名册读 workspace/*/(§3);projects 全局
readCurrentTask(scope): string | null;   // runtime/current-task.json 指针(harness §7.1)
discoverSkills(scope): DiscoveredSkill[];   // 在 skills.ts;扫项目目录 + 各 agent home 目录(§5.1)
// 写
writeTask(scope, task);   writeState(scope, state);   appendEvent(scope, taskId, event);
writeChecklist(scope, taskId, checklist);   setChecklistItem(scope, taskId, itemId, done);   // §4.7;ttur check 写入
approveNode(scope, taskId, node, by);   archiveTask(scope, id, { markCancelled? });   // §9;approval 写 state.approvals + 事件,见 harness §2.6
writeCurrentTask(scope, taskId);   clearCurrentTask(scope);   assignTask(scope, taskId, slug);   // §3.1 改派
upsertProject(path);   // 名册无写 API:`workspace/<slug>/` 由 init 建、随仓库提交即登记(§3)
```

### 5.1 Skill 发现(跨 agent + 项目/全局,带 tag)

workflow 编排 skill,需要列出本地都有哪些 skill。注意:**全局 skill 不在 `~/.tuteur/`**(§2.3 安全边界:全局根永远不放 agent 目录),而在各 agent 自己的 home 目录(`~/.claude/skills/` 等)。这是 **core 的读能力**(消费方是 web 画布的 skill 下拉,不暴露成 `ttur` 命令),按注册表 `skillDirs` 静态目录扫描,每条带来源 tag:

```ts
// 已实现(基础版):按逻辑名去重,合并多处安装位置到 paths[]
export interface DiscoveredSkill {
  name: string; // 逻辑名(剥 tuteur- 前缀)
  description?: string; // 解析 SKILL.md frontmatter 的 description
  source: 'project' | 'global'; // 项目目录 vs agent 的 home 目录
  paths: string[]; // 该逻辑 skill 被发现的所有目录(同一 skill 可装在多个工具)
}
export function discoverSkills(scope: Scope): DiscoveredSkill[]; // 项目 scope;扫 project 组 + home 组
export function resolveSkillRef(scope: Scope, skill: string): { name: string; path: string }; // 解析不到则抛错
```

> 富化项(待补,P1):每条按 `agent`(canonical/codex/claude/gemini)再细分 tag,供 web 画布按工具分组——当前基础版只给 `source` + 合并的 `paths`。

机制:目录来源由 `agents/registry.ts` 的 `getProjectSkillDirs()`/`getGlobalSkillDirs()` 从 `AGENT_PLATFORMS.skillDirs` 派生(**单一数据源**,不在 skills.ts 再抄一份);project 组相对项目根解析,global 组相对用户 home 解析。扫描 + 解析 frontmatter 的逻辑落在 **core(`skills.ts`)**,不在 configurator(cli.md §8.6)。

**按逻辑名去重展示**:同一逻辑 skill 会在多处被发现(尤其 Tuteur 自带的——init 往各工具目录都铺一份),`discoverSkills` 按**规范化名称**(剥 `tuteur-` 前缀等)折叠成一条、保留多来源 tag(画布下拉显示"grill-me · 已装于 codex/claude");仅当**同名但内容不同**才视为真冲突、拆开展示让作者选。节点只存逻辑名(`skill` 字段,不存路径/来源)。

**运行时各工具用自己那份**:`resolveSkillRef(scope, skill)` 按当前平台的 skill 目录解析到具体一份(各工具用同名的自己那份,不跨读别的工具目录);**解析不到则报错**(validate 期对所选工具校验、运行时对当前平台校验,harness §5)。web 经 `GET /api/skills` 取去重后的名称列表、用 `agent`/`source` tag 分组(web §3.3)。

---

## 6. Domain:门禁与状态机

确定性核心,纯函数 + 单测。流程见 harness.md §2/§3。

```ts
completeNode(scope, taskId, nodeId, opts?): CompleteResult;   // 与 web 端点共用;skill 走门禁,switch 需 opts.branch
advanceWorkflow(state, wf): State;            // 纯函数:沿 next 推进;遇 switch 停下(不自动求值,等 agent 判定)
rewindTo(scope, taskId, nodeId): State;       // switch 判错恢复:退游标回该节点、清下游 completed+approvals、记 rewind 事件(harness §3.1)
approveNode(scope, taskId, nodeId, by): State; // 写 state.approvals[node] + 追加 approval 事件(harness §2.6)
resolvePlannedContext(scope, taskId, nodeId): PlannedEntry[];  // 合并 global injectByDefault→项目 default→node(knowledge.md §7);每项带 {id, mode:'full'|'index', ...}(§4.5)
resolveSkillRef(scope, skill): { path: string };        // 名→具体 skill;解析不到则抛错(harness §5,缺则报错)
resolveCurrentTask(scope, explicit?): string | null;    // --task > 指针 > 唯一未完成兜底;多个未完成→AMBIGUOUS(harness §7.1)
phaseOf(wf, nodeId): string | null;           // 节点的阶段归属(容器成员);驱动 task.status(hook/complete/task 共用)
checklistProgress(scope, taskId): { done: number; total: number };   // 派生进度;web 第三层 + 跨任务统计(§4.7)
archiveTask(scope, taskId, { markCancelled? }): void;   // §9
export interface CompleteResult { ok: boolean; exitCode: 0 | 2; message?: string; state?: State; }
```

`completeNode`:
- **skill 节点**:核对 `gate`(artifacts 存在+非空 / checks 退出 0 / approval 已写),全过则 `advanceWorkflow` 沿 `next` 推进。
- **switch 节点**:要求 `opts.branch` 是合法分支(否则 exit 2),记 `state.decisions[node]={branch,reason,by,at}` + `decision` 事件,沿该分支 `next` 推进。

`advanceWorkflow` 沿 `next` 走,**遇 switch 节点停下**(把游标停在 switch,由 agent 判定后再次 complete 推进),遇终点(`next:null`)置 `currentNode=null`——**switch 不再由 harness 自动求值**(原 `evaluateDecision`/`readSignal`/signal 三源已废弃,harness §2.5/§3)。**门禁失败不改变 state**;每次 complete 尝试(成败)都 `appendEvent`(§4.4)。成功时返回的 state 用于拼装「下一节点接力 JSON」(harness §2.3)。`phaseOf` 在游标落入新阶段容器时驱动 `task.status` 翻转。纯函数 + 单测,确定性核心(K4)。

---

## 7. 数据契约(机制,不绑每步产物)

契约描述四方之间的**数据通道**,**与具体 step 无关**。它不规定「每步必产什么」—— 那是各 workflow 的自由,由节点的 `gate.artifacts` 声明(**可为空**)。

| 角色 | 职责 | 数据通道 |
| --- | --- | --- |
| AI(agent) | 干活;**若**该节点声明了 `gate.artifacts` 则产出 | task 目录文件 |
| CLI/core | complete 推进 state;CLI/hook 记事件 | state.json / events.jsonl |
| Web | 读并展示 state/event/artifact;提供操作入口 | 只读 + 操作按钮 |
| 用户 | approve / 跳过 / 归档;回写影响下次门禁 | state.approvals / events.jsonl / archiveTask |

**产物按需**:节点没声明 `gate.artifacts` → 门禁不查(纯执行/review 可零产物);声明了 → 缺(或空)则失败。默认 workflow 给 planning 配 `design.md` 等只是默认 workflow 的选择,非契约强制。

契约不变量(始终成立):1) **agent 自称完成 ≠ 节点完成**,完成只由 completeNode 判定;2) 门禁永不自动放行,人工跳过必须显式(`--skip`)且留痕;3) 计划注入与实际注入(`session_start` 事件的 `injected` 清单)的差异、以及事件缺失,是发现 hook 失效的信号,事件必须记录。

**「web 操作如何对应 harness 流转」**:web 的 approve/归档回写 `.tuteur/`,被下一次 `completeNode` 读到从而影响门禁 —— 这是 web 与状态机唯一耦合点。

---

## 8. InitConfig:CLI 与 Web 共用的初始化模型

把「初始化的选择」抽成一个结构化对象,**三种输入产出同一个 `InitConfig`,再统一执行**,从根上统一 CLI 与 web 的初始化逻辑(你的诉求 1)。

```ts
// core/init-config.ts
export interface InitConfig {
  scope: 'project' | 'global';
  agents: AgentId[];          // 选中的 agent(全局模式恒为 [],不配 agent)
  skills: 'link' | 'copy';    // skill 落地方式(原 skill-mode,改短)
  user?: string;              // 本地身份名(全局模式忽略)
}
```

```text
        三种输入                          统一出口
  CLI flag(--codex --claude --copy -u) ┐
  CLI 交互(inquirer/readline)          ├─► InitConfig ─► initProject(config)
  Web 表单(POST body)                  ┘         │
                                                 └─► serializeToCommand(config)
                                                     → "ttur init --codex --claude -u yan"
```

- **统一问题定义**(供 CLI 交互与 web 表单同源渲染),数据从 agent 注册表派生(cli.md §8):

```ts
export const INIT_QUESTIONS = [
  { key:'agents', type:'multiselect', message:'Select AI tools',
    choices: () => agentChoices(), default: () => defaultCheckedAgents() },
  { key:'skills', type:'select', message:'Skill install', choices:['link','copy'], default:'link' },
  { key:'user',   type:'text',   message:'Your name',     default: () => gitUserName() },
];
```

- `serializeToCommand(config)`:web 选完后展示等价命令 `ttur init --codex --claude -u yan`,也用于「web 触发 init」时 spawn 的参数(web.md §2.4)。
- web 触发 init 的请求体为 `{ path, config: InitConfig }`——目标路径是 web 场景特有输入,**不进入 InitConfig 本体**(web.md §2.4)。
- flag 形态参考 Trellis:**每个 agent 一个布尔 flag**(`--codex`/`--claude`),不用 `--agents codex,claude`(你的诉求 2)。
- `skills` 取代冗长的 `skill-mode`;CLI 侧默认 `link`,`--copy` 切到独立副本。

---

## 9. 任务工作树与归档

### 9.1 worktree 多任务并行(已移出 MVP,方案存档)

worktree 并行已推迟(2026-06-13 评审决定),`task.json` 不含相关字段、store 不含 worktree API。回归时按以下**已确认方案**实施,不再重新设计:

- **`.tuteur/` 的事实源永远是主仓库工作树**:`resolveProjectScope` 识别 git worktree(`.git` 为文件而非目录)并经 commondir 重定向到主仓库根;cwd 只决定代码在哪改。否则 worktree 内的 `.tuteur/` 副本会接收状态写入,导致僵尸看板、合并冲突、approval 读不到。
- **创建 worktree 时 `git sparse-checkout` 排除 `.tuteur/`**:分支提交永不触碰任务数据,合并回 baseBranch 时 `.tuteur/` 零冲突。
- **cwd ≠ scope.root 时 hook/CLI 输出绝对路径**:注入上下文与产物写入都指向主仓库。
- 生命周期:**Tuteur 不做合并**;归档仅校验分支已合入(`git merge-base --is-ancestor`),未合入则拒绝或 `--force` 放弃;合并本身留给用户/finish 节点(PR 或本地 merge 是用户偏好)。
- 位置是实现细节(倾向 `~/.tuteur/worktrees/`,不污染仓库);事实源规则不依赖位置。

### 9.2 归档(移动目录,默认不改状态,不绑产物)

**归档 = 写 archivedAt + 移动整个任务目录**,与产物无关、与完成状态正交(PRD:归档不是一种任务状态)。

```text
ttur task archive <id> [--cancelled]  /  web 归档按钮
  → core.archiveTask(scope, id, { markCancelled? }):
      1. 读 task.json;若已 archived → 报错(幂等保护)
      2. status 默认不变;任务未完成时询问(或 --cancelled 直接指定):
         按当前状态归档,或标记 status='cancelled'(cancelled 仅能由归档动作写入,不参与状态机流转)
      3. 写 archivedAt=now
      4. 移动目录:tasks/<id>/ → tasks/archive/<YYYY-MM>/<id>/(按归档月分桶,对齐 Trellis)
  → create 的同名检测只查活跃任务目录;归档区跨年同 id 靠分桶路径天然共存
```

要点:
- 归档**不要求任何产物**、**默认不改写状态**;未完成任务可诚实地以 cancelled 或原状态入档。
- **Tuteur 永不执行 `git add`/`git commit`**;`.tuteur/` 变更跟随用户的正常代码提交(finish skill 仅提醒,动手的是用户或 agent)。
- `listTasks` 默认不含归档;`includeArchived` 时合并 `tasks/archive/*/*`。
- web 看板默认不显示归档,归档视图区分 completed/cancelled。

---

## 10. 代码评价与 TODO

### 评价
- core 是本轮地基,**先于一切落地**。数据结构按全局/项目分层、按 web 用途标注后,「谁存什么、web 读什么」不再含糊。
- 双层不对称(全局=配置+注册表+模板,项目=任务事实源)避免了双根都成完整事实源的复杂度。
- 全局安全边界(不在 home 配 agent)吸收了 Trellis 的真实教训,是必须守的红线。

### TODO

| # | 项 | 优先级 |
| --- | --- | --- |
| K1 | `@tuteur/core` 包骨架 + zod 类型(§4) | P0 |
| K2 | `paths`:双层 Scope + detectTuteur + 全局安全边界 | P0 |
| K3 | `store`:全部读写 + 损坏文件快速失败 | P0 |
| K4 | `domain`:completeNode(skill 门禁 / switch 带 --branch)/advanceWorkflow(沿 next、遇 switch 停、无环校验)/rewindTo/phaseOf/archiveTask + 单测 | P0 |
| K5 | `context`:resolvePlannedContext | P0 |
| K6 | `init-config`:InitConfig + INIT_QUESTIONS + serializeToCommand | P0 |
| K7 | cli/app 改依赖 core,删重复读盘与常量 | P0 |
| K8 | listDevelopers(读 workspace/)/ approval / projects 读写 | P1 |
| K9 | `discoverSkills`:项目目录 + 各 agent home 目录,带 tag(§5.1) | P1 |
| K10 | `events`:appendEvent/readEvents + 阈值告警计算(§4.4) | P0 |
| K11 | 当前任务指针:read/write/clearCurrentTask + resolveCurrentTask(harness §7.1) | P0 |
| K12 | worktree 并行(已后置,方案存档 §9.1) | P2 |
| K13 | `gate.artifacts` 升级为 `ArtifactSpec`(`string \| {path,title?,template?}`)+ validate template 可解析(§4.3.1) | P0 |
| K14 | `checklist.json`:ChecklistSchema + read/write/setItem + `checklistProgress` + `ttur check add/done/undo/list`(§4.7) | P1 |
| K15 | 注入形态:知识条目 `inject:full\|index` + `resolvePlannedContext` 返回带形态/正文(§4.5、knowledge §7) | P0 |

### 待确认
- ~~全局放 tasks~~ → **已定:否**。
- ~~归档分桶~~ → **已定:按 `archive/<YYYY-MM>/` 分桶**,MVP 直接做,不走平铺过渡。
- 身份/配置用 JSON 还是 Trellis 式 key=value/YAML?**推荐**:统一 JSON(web 读写一致),不引入 YAML 解析。
- core 是否独立发包?**推荐**:内部私有包,随 cli/app 构建。
