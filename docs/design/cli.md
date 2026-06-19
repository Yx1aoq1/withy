# CLI 设计

> 适用范围:`packages/cli`(`@withy/cli`,可执行名 `withy`)。
> 定位:实施规格级。CLI 是用户与 agent 的稳定入口、确定性逻辑的调用方。**所有 `.withy/` 读写与门禁都委托 [@withy/core](./core.md),CLI 不自己碰盘。**
> 数据 schema 见 [core.md §4](./core.md);双层模型见 [core.md §2](./core.md);端到端串联见 [harness-flow.md](./harness-flow.md)。

---

## 1. 职责边界

| CLI 负责                                | 委托给谁                                 |
| --------------------------------------- | ---------------------------------------- |
| 命令解析、交互、参数校验、退出码映射    | ——                                       |
| 初始化项目/全局结构、装 skill、配 agent | configurator 引擎(§6)                    |
| 读写数据、计算 phase、门禁判定、推进    | **@withy/core**(store + workflow + task) |
| 平台事件入口(`withy hook <event>`)      | core(renderSessionStart/context)         |
| 模板更新冲突检测                        | installation/managed-templates(§5)       |

核心不变量:**agent 自称完成 ≠ 节点完成**,流程推进只由 core 门禁判定。agent 面向的推进入口只有 `withy next`(读取 `state.currentNode`,调用者不传节点);无 `complete` 命令。

---

## 2. 命令总览

约定式加载:`commands/` 下每个文件默认导出一个注册函数,按字母序自动挂载。**加命令 = 放一个文件**,不改 `program.ts`。

| 命令                | 一句话                                     | 落地状态             |
| ------------------- | ------------------------------------------ | -------------------- |
| `withy init`        | 初始化项目 / 全局根                        | ✅                   |
| `withy task …`      | 任务族:start(建或聚焦)/list/status/archive | ✅                   |
| `withy next`        | 唯一推进入口(门禁)                         | ✅                   |
| `withy approve`     | 批准当前节点(approval 门禁)                | ✅                   |
| `withy rewind`      | switch 判错回退                            | ✅                   |
| `withy hook …`      | 平台事件入口(session-start)                | ✅(仅 session-start) |
| `withy knowledge …` | 知识库 bookkeeping(分 scope)               | ✅                   |
| `withy dashboard …` | 控制台后台进程管理                         | ✅                   |
| `withy update`      | 升级 Withy 托管的 skill 模板               | ✅                   |
| `withy uninstall`   | 卸载项目 / 全局根                          | ✅                   |

**输出约定**:每个命令都支持两种输出。**缺省人读文本**(给人看);加全局 `--json` 输出单行结构化 JSON `{ ok, … }`(成败都结构化,供 agent/hook/skill 解析)。`--json` 注册在 program 上、所有子命令继承,由 skill 提示词与 hook 在 agent 侧固定带上。`hook` 例外——它输出的是注入正文(给 agent 读的上下文),不套 `{ok}` 信封、不受 `--json` 影响。

**退出码**:`0` 成功 / `1` 通用错误(参数错、找不到任务、无身份等)/ `2` **门禁失败**(`withy next` 专用:缺产物、检查未过、缺 approval、switch 缺/非法 branch)。`hook` 恒返回 `0`(软失败,绝不阻断会话)。

---

## 3. 命令详表

> 所有命令缺省输出人读文本,加 `--json` 转结构化。下表「执行后返回」列示 `--json` 下的对象(面向 agent 的命令)或文本要点(面向人的命令)。

### 3.1 运行时命令(主要由 agent 调用)

| 命令                           | 说明                                                                                                                                                                                                                                                                              | 可选参数                                                                                                                                    | 执行后返回                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task start "<title>" \| <id>` | 聚焦或新建当前任务(合并了旧 create/start):**实参命中已存在任务 id** → 只写当前任务指针,不碰目录/task.json;**不存在** → 把实参当 title 派生 `id=<MM-DD>-<slug>`、校验 workflow、写 task.json/state.json(游标=entry)后设指针。workflow 结构非法则拒绝,skill/template 悬空降级为告警 | `-w, --workflow <id>`(默认 `default`,仅新建路径)<br>`-a, --assignee <slug>`(默认当前开发者,仅新建路径)                                      | 聚焦:`{ ok, task, current:true }`;新建:`{ ok, task, created:true, status, node, warnings[] }`;新建且无身份又无 `--assignee` → `{ ok:false, error }` exit 1  |
| `task list`                    | 列任务,默认只看自己、不含归档                                                                                                                                                                                                                                                     | `--mine` / `--all`<br>`--status <status>`<br>`--archived`                                                                                   | `{ ok, tasks:[{ id, title, status, assignee, priority }] }`                                                                                                 |
| `task status [task]`           | 看单任务的当前节点 / 已完成节点 / 判定记录(task 缺省走当前任务)                                                                                                                                                                                                                   | ——                                                                                                                                          | `{ ok, task, title, status, node, completed[], decisions }`                                                                                                 |
| `task archive <task>`          | 写 archivedAt + 移目录到 `tasks/archive/<YYYY-MM>/`;默认不改状态,不绑产物、不动 git                                                                                                                                                                                               | `--cancelled`(归档同时标记取消)                                                                                                             | `{ ok, task, archived:true, cancelled }`                                                                                                                    |
| `next`                         | **唯一推进门禁**:读 `state.currentNode`。skill 节点核对 gate(产物存在非空 / 检查退 0 / 已 approve);switch 节点需 `--branch`,无则列分支等判定。每次调用(成败)追加一条 `events.jsonl`                                                                                               | `--task <id>`<br>`--branch <label>`(switch 选路)<br>`--reason <text>`(`--skip` 必填、`--branch` 建议填)<br>`--skip`(人工显式跳过门禁、留痕) | 过门禁 `{ ok:true, exitCode:0, node, done?, next? }` exit 0;<br>挡住 `{ ok:false, exitCode:2, blocked? / needsBranch? / branches[]? / nextAction? }` exit 2 |
| `approve`                      | 写 `state.approvals[currentNode]` + 一条 `approval` 事件(web 点确认是等价入口)                                                                                                                                                                                                    | `--task <id>`                                                                                                                               | `{ ok, task, node, approved:true }`;无身份 exit 1                                                                                                           |
| `rewind --to <node>`           | switch 判错恢复:游标退回目标节点、清下游 completed/approvals、记 `rewind` 事件                                                                                                                                                                                                    | `--to <node>`(必填)<br>`--task <id>`<br>`--reason <text>`                                                                                   | `{ ok, task, node, completed[] }`                                                                                                                           |
| `hook <event>`                 | 平台事件入口。`session-start`:经 `renderSessionStart` 输出注入正文 + 追加 `session_start` 事件;其余事件暂为 no-op                                                                                                                                                                 | (event 为位置参数;`WITHY_HOOKS=0` 或非 Withy 项目 → 静默 exit 0)                                                                            | stdout 注入纯文本;恒 exit 0(不受 `--json` 影响)                                                                                                             |

> 任务定位口径统一为 `resolveTaskId`:`--task` > 当前任务指针 > 唯一未完成任务兜底;多个未完成 → AMBIGUOUS、指针失效 → STALE,均报错让用户 `task start <id>` 选定(harness §7.1)。实施计划不设 CLI 子命令——agent 用自己的文件工具直接维护 `tasks/<id>/implement.md`(§3.3)。

### 3.2 安装与运维命令

| 命令              | 说明                                                                                                                                                                                                                                                                              | 可选参数                                                                                                                                                                                                  | 执行后返回                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `init`            | 项目模式:建 `.withy/` 结构 + 写 config/context/默认 workflow + 装 canonical skill + 配选中 agent + 写本地身份;存在全局根则登记进 `projects.json`。全局模式(`--global`):只在 `~/.withy/` 落 config + projects 注册表 + workflow/knowledge 模板,**不配 agent、不建身份**(core §2.3) | `-y, --yes`(用默认勾选)<br>`-u, --user <name>`(缺省取 `git config user.name`)<br>`--global`<br>`--copy`(skill 独立副本,缺省软链)<br>`--codex` / `--claude` / `--gemini`…(每 agent 一个 flag,由注册表派生) | 文本:安装路径、选中 agent、skill 模式、当前用户、等价命令;取消 exitCode 1                 |
| `dashboard start` | 后台拉起控制台(多项目管理器);门禁为全局根存在,与 cwd 解绑,状态写 `~/.withy/runtime/dashboard.json`。cwd 若是已初始化项目则作默认项目兜底                                                                                                                                          | ——                                                                                                                                                                                                        | 文本:启动 URL,或"已在运行"                                                                |
| `dashboard stop`  | 据全局 runtime 状态结束进程,任意目录可执行                                                                                                                                                                                                                                        | ——                                                                                                                                                                                                        | 文本:已停止 / 未运行                                                                      |
| `knowledge graph` | 从 `[[链接]]` + frontmatter 派生文档关系图                                                                                                                                                                                                                                        | `--global`<br>`--merged`(全局+项目全景)                                                                                                                                                                   | `{ ok, scope, nodes, edges, graph }`                                                      |
| `knowledge index` | 据 frontmatter 重算各级 `index.md`                                                                                                                                                                                                                                                | `--global`                                                                                                                                                                                                | `{ ok, scope, written, paths[] }`                                                         |
| `knowledge lint`  | 机械体检:孤儿页 / 断链 / 悬空注入引用                                                                                                                                                                                                                                             | `--global`                                                                                                                                                                                                | `{ ok, scope, errors, warnings, issues[] }`;有 error exit 1                               |
| `update`          | 按模板哈希升级 Withy 托管的 skill:不存在→建、内容同→跳过、用户没改→自动更新、改过→冲突(交互或 flag 决策)                                                                                                                                                                          | `--dry-run`<br>`-f, --force`(备份后覆盖)<br>`-s, --skip-all`<br>`-n, --create-new`(写 `.new` 副本)                                                                                                        | 文本:变更计划 + 汇总(created/auto-updated/overwritten/copied/skipped/unchanged)+ 备份目录 |
| `uninstall`       | 删除项目内 Withy 托管 skill 与 `.withy/`;`--global` 删除全局根 `~/.withy/`                                                                                                                                                                                                        | `-y, --yes`<br>`--dry-run`<br>`--global`                                                                                                                                                                  | 文本:删除计划 + 汇总;非交互且无 `--yes` 时拒绝执行                                        |

> workflow 图校验不开放 CLI 命令:`validateWorkflow` 作为 core 函数,在 `task start` 新建任务时与 web 保存画布时各跑一次(harness §3、web §3.3);手改 `workflow.json` 的结构错误会在下次 `task start` 新建任务时被拦截。

### 3.3 实施计划 implement.md(agent 维护,web 只读展示)

任务的实施顺序与当前进度用 `tasks/<id>/implement.md` 承载,**agent 用自己的文件工具直接写**。规划阶段从 `prd.md` 和 `design.md` 提炼有序步骤,每项包含验证方式;完成时把 `- [ ]` 改为 `- [x]`。无 CLI 子命令——与知识库「检索=agent 自读文件」同一取舍。

- **定位:实施计划 + web 只读进度**,可被节点 `gate.artifacts` 当存在性核对,勾选状态不参与放行、不做跨任务统计。
- **进度解析 best-effort**:core 扫 `- [ ]` / `- [x]` 行算 `done/total`;**把没识别成复选框的 bullet 数显式标出**,丢项变成可见提示而非静默失守(规避 markdown 解析的老问题)。
- **职责分离**:`prd.md` 是需求与验收标准,`design.md` 是方案与边界,`implement.md` 是可勾选的实施步骤和逐步验证。

---

## 4. 全流程命令编排

从初始化到会话结束,命令按下图串起来(箭头=下一步,`└`=分支)。门禁与节点图推进全在 core,CLI 只解析参数、调 core、映射退出码。

```text
withy init [--global]
   │  建 .withy/(config·context·workflow·knowledge·身份)+ 装 skill + 配 agent hook
   ▼
〔用户打开 agent 交互会话〕
   │
withy hook session-start            ← 平台 SessionStart 自动触发
   │  注入 guide + 当前态(git)+ workflow 概览 + 任务状态 + planned context
   │  追加 session_start 事件
   ▼
当前任务?
   ├─ 无 / 要新建 ─▶ withy task start "<title>"   不存在→建 task.json/state.json(游标=entry)并设为当前
   ├─ 多个歧义 ────▶ withy task start <id>          聚焦已存在任务
   └─ 已定位 ─┐
              ▼
      ┌────────────── 推进循环(直到 currentNode=null)──────────────┐
      │  currentNode 是 switch?                                       │
      │     是 ──▶ withy next --branch <label> --reason "..."           │
      │             记 state.decisions + decision 事件,路由到分支     │
      │     否(skill)──▶ 读 skill 干活、产出产物                       │
      │             └─▶ withy next                                      │
      │                   ├ 门禁过(exit 0)──▶ 进入 next 节点           │
      │                   └ 门禁挡(exit 2)                             │
      │                        ├ 缺产物 ─▶ 补产物后重试                │
      │                        ├ 检查未过 ─▶ 修复后重试                │
      │                        ├ 缺 approval ─▶ withy approve 后重试    │
      │                        └ 授权放行 ─▶ withy next --skip --reason │
      │  判错分支 ──▶ withy rewind --to <node>(清下游)再重判            │
      └───────────────────────────────────────────────────────────────┘
   │
   ▼
任务完成(status=completed,completedAt 写入,清当前任务指针)
   │  可选
   ▼
withy task archive <id> [--cancelled]   移入 tasks/archive/<YYYY-MM>/<id>/
```

三条链路与本图的对应:**控制链** = `next`/`rewind`(改 state 游标);**内容链** = `hook session-start` 注入 → skill 产出 → `implement.md`/产物;**审计链** = 每步追加 `events.jsonl`(session_start / complete_attempt / decision / approval / skip / rewind)。

---

## 5. 模板更新机制(managed-templates)

`update`/`uninstall` 共用一套哈希追踪,保护用户对 skill 的本地改动不被升级覆盖:

```text
analyzeTemplateChange:
  文件不存在 → create        内容相同 → unchanged
  哈希匹配(用户没改)→ auto-update     否则 → conflict
```

`create`/`auto-update` 直接写;`conflict` 按 flag 或交互选 overwrite(备份后覆盖)/ skip / create-new(`.new` 副本)。哈希(sha256)清单存 `template-hashes.json`,扫描范围为 `.agent/skill` 与 `.claude/skills`(copy 副本计入,symlink 跳过)。**铁律(Trellis 教训)**:init 写盘与 update 收集必须用同一组 resolve/copy helper,否则升级会丢文件。

---

## 6. Agent 接入:数据注册表 + per-agent configurator + 通用层

**Trellis 风格(数据与行为分离)**,四层职责:

| 层           | 文件                                                      | 职责                                                                                                                |
| ------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 数据注册表   | core `agents/registry.ts` 的 `AGENT_PLATFORMS`            | 平台静态元数据单一源(`configDir`/`cliFlag`/`defaultChecked`/`skillTarget`/`skillDirs`/`templateContext`),**无行为** |
| 配置器(行为) | `configurators/<id>.ts` 的 `configure<Id>(ctx, platform)` | 拷本平台模板目录 + 按 `skillTarget` 落 skill,不写平台分支逻辑                                                       |
| 通用层(生成) | `configurators/shared.ts`                                 | `copyAgentTemplates`/`writeSkills`/`linkSkills`/`copyCanonicalSkills`/占位符渲染                                    |
| 派发         | `registry.ts` 的 `configureAgentPlatform(id, ctx)`        | `= PLATFORM_CONFIGURATORS[id](ctx, AGENT_PLATFORMS[id])`                                                            |

设计原则:**注册表只放静态数据;"装什么文件"一律下沉到 `templates/<id>/` 模板树,init 整目录拷过去即可。** 挂 hook、定义 agent 角色、写 settings 都是模板文件,不是注册表配置项,也无需"登记适配器"抽象。

**加一个新 agent**:① 注册表加一条数据;② 行为表加一条(多数照抄 codex/claude 的 `copyAgentTemplates` 模式);③ 建 `templates/<id>/` 模板树。公共生成逻辑零增量;全局模式不走 configurator(core §2.3)。

### 6.1 Hook:声明文件即模板,命令直配

挂 hook 不是注册表配置、也无 `registerHook` 适配器:每个平台的 hook 声明放在 `templates/<id>/` 里,`copyAgentTemplates` 拷过去(json 占位符渲染)即完成登记。已核实 Claude/Codex 的 hook 都接受 `type:"command"` 命令字符串,声明文件里直接写 `withy hook <event>`,**不落任何 `.py`/`.sh` 包装脚本**(`.sh` 在 Windows 不可移植,直接命令靠 `withy.cmd` shim 全平台可用,harness §6.3)。

| 平台   | 声明文件                         | MVP 注册事件            | 落地到                  |
| ------ | -------------------------------- | ----------------------- | ----------------------- |
| codex  | `templates/codex/hooks.json`     | `SessionStart`          | `.codex/hooks.json`     |
| claude | `templates/claude/settings.json` | `SessionStart`          | `.claude/settings.json` |
| gemini | `templates/gemini/settings.json` | 待核实(per-turn 名待定) | `.gemini/settings.json` |

per-turn breadcrumb 与子 agent 注入是后续事件,届时在同一声明文件追加 event 段即可——仍是"改模板、零适配器代码"。

> ⚠️ **Codex 的 hook 需用户手动开启并信任**:① `~/.codex/config.toml` 设 `[features] hooks = true`;② Codex 0.129+ 在 CLI 里 `/hooks` review/trust 一次。任一缺失则 hook 静默不生效——症状即 `events.jsonl` 中没有任何 `session_start` 事件(web 据此告警)。`init` 的 `warnCodexHookFlag()` 已在 stderr 提示。

> 声明文件冲突:全新项目按模板直接写;目标已有用户内容时,沿用 §5 的 managed-templates 冲突策略,不做隐式深合并。

### 6.2 Skill 发现(core 能力,供 web,不暴露 CLI 命令)

workflow 编排 skill,需要列出本地有哪些 skill。**这是 core 的读能力,不是 `withy` 命令**——消费方是 web 画布的 skill 下拉(按逻辑名去重、按 `agent`/`source` tag 分组)。发现目录由 `AGENT_PLATFORMS.skillDirs` 派生(**单一数据源**):project 组相对项目根、global 组相对各 agent 的 home 目录(全局 skill 不在 `~/.withy/`,core §2.3 安全边界)。扫描 + 解析 frontmatter 落在 core `skills.ts` 的 `discoverSkills`;`resolveSkillRef` 用同一组目录做校验期/运行期检查(解析不到则报错)。CLI 不为此单开命令(对齐 Trellis 只有 init/uninstall/update)。

---

## 7. 由命令写出的数据文件(归属 core)

`.withy/` 结构、各 JSON schema、双层布局统一在 [core.md §2/§4](./core.md),本文不复制;CLI 只通过 `core.store` 读写。

| 写入者                                                | 文件                                                                                                                                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`                                                | `config.yaml`、`context.json`、`guide.md`、`workflows/default.workflow.json`、`template-hashes.json`、`.developer`、`workspace/<slug>/index.md`、`.gitignore`、`knowledge/{sources,wiki,index.md,log.md}` |
| `task start` / `next` / `approve` / `rewind` / `hook` | `tasks/<id>/task.json`、`tasks/<id>/state.json`(含 `decisions`/`approvals`)、`tasks/<id>/events.jsonl`、`runtime/current-task.json`                                                                       |
| agent(文件工具直接写)                                 | `tasks/<id>/design.md`、`tasks/<id>/implement.md` 等节点产物                                                                                                                                              |
| `archive` 后                                          | 整个任务目录迁入 `tasks/archive/<YYYY-MM>/<id>/`                                                                                                                                                          |

---

## 8. TODO 与待确认

### 8.1 TODO

| #   | 项                                                                                             | 状态/优先级                             |
| --- | ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| C1  | CLI 改依赖 `@withy/core`,删自有读盘/常量                                                       | ✅ 已实现                               |
| C2  | `task start`(建或聚焦合一)/`list`/`status`/`archive`(归属/快速失败/YYYY-MM 分桶)               | 🟡 旧 create/start 待合并;assign 待删   |
| C3  | `next`(读取 currentNode、唯一推进门禁、switch `--branch`、`--skip` 留痕)+ `rewind` + `approve` | ✅ 已实现(`complete` 已删除)            |
| C4  | `hook <event>` + hook 声明文件(命令直配)+ session_start 事件回写                               | ✅ session-start;per-turn/子 agent 待补 |
| C5  | 数据注册表 + PLATFORM_CONFIGURATORS 行为表 + 模板树承载 hook                                   | ✅ 已实现                               |
| C6  | InitConfig 三输入(flag/交互/web)+ serializeToCommand                                           | 🟡 CLI/core 已实现;web 表单待接入       |
| C7  | `init --global` / `uninstall --global` / dashboard 多项目 runtime                              | ✅ CLI 已实现;web 多项目待补            |
| C8  | `knowledge graph/index/lint`(分 scope)                                                         | ✅ 已实现                               |
| C9  | 全局 `--json` flag + 每命令人读渲染(缺省人读、`--json` 转结构化)                               | ❌ 待实现(当前 agent 命令恒 JSON)       |
| C10 | `implement.md` 承载实施计划与复选框进度(agent 直写 + best-effort 解析);删 `withy check` 命令族 | ✅ 已实现                               |
| C11 | `workflow validate` CLI 命令删除(`validateWorkflow` 仍作 core 函数,create/web 在用)            | 🟡 命令待删                             |
| C12 | `discoverSkills` 富化(按 agent 细分 tag,供 web `GET /api/skills`)                              | 🟡 基础版已实现                         |
| C13 | workflow 类 skill 正文(brainstorm/grill-me/dev/check/finish)+ `withy-knowledge`                | ✅ 已落地                               |
| C14 | ~~`task create --worktree`~~ 已后置(方案存档 core §9.1)                                        | P2                                      |

### 8.2 待确认

- agent flag 全集随注册表增长(每加平台一个 `--xxx`)?**推荐**:是,与 Trellis 一致,flag↔注册表用编译期断言锁一致性。
- ~~`withy run <node>` 是否进 MVP~~ → **已定:不进**,run 模式整体移除,交互模式唯一。
- ~~缺省 `--task`~~ → **已定**:`resolveCurrentTask` 三层解析(`--task` > 指针 > 唯一未完成兜底,harness §7.1)。
