# Tuteur 设计文档索引

> 这是 `docs/design/` 的入口。**先读本页,再按需跳转。**
> 背景见 [../PRD.md](../PRD.md);本目录是实施规格级的分域细化。
> 主线:**唯一逻辑层 `@tuteur/core` + 唯一入口 `ttur` + hook 薄转发 + 双层(全局/项目)+ InitConfig 统一初始化 + 注册表/per-agent configurator/通用层 + 固定阶段容器(规划/执行/收尾)workflow(skill/switch 两类节点)+ switch 靠 agent 判断(报分支、harness 路由)。**
> 参考实现:Trellis(`mindfold-ai/Trellis`)—— **数据注册表纯数据(`AI_TOOLS` 无函数)+ 行为表分离 + hook 是模板文件拷贝(无适配器)**、归档移目录、身份 gitignore、per-agent flag、当前任务指针,CLI 仅 init/uninstall/update(无 skill 命令);**反向教训**:其禁止 home 运行,我们做全局时设了安全边界(core §2.3)。
> **2026-06-13 评审**:run 模式 / worktree 并行 / 节点级 agent / 子 agent 隔离移出 MVP;新增 events.jsonl、`ttur task start`、complete 接力输出与 `--json`、归档 cancelled 与按月分桶。
> **2026-06-14 评审**:workflow 改**固定三阶段容器 + skill/switch 两类节点**;废弃 decision/signal/decision.json/JSON-Pointer——**switch 靠 agent 判断、走到就停、`ttur complete --branch --reason` 报分支**,记 `state.decisions`;`skillRef`→`skill`(按名引用、运行时各工具用自己那份、缺则报错);门禁三项收进可选 `gate`(产物只核存在+非空);approval 降为软约定(`ttur approve`,agent 可写、不依赖 web);命令输出统一简单 JSON;新增 `ttur rewind`;当前任务多个未完成→AMBIGUOUS 报错;新任务由 agent 建。
> **2026-06-14 评审(上下文/产物轮)**:厘清「会话上下文管理」三问。**注入内容三分法**:`fixed`(协议外壳=代码常量)/`config`(用户可改=工具文件+context.json+知识库+skill)/`derived`(core 现算=身份/git/任务/进度)。session-start 补 git 块、把「Tuteur 介绍/项目须知」放进**工具文件 `.tuteur/guide.md`**(session-start 直接读、注全文,**不走知识库/context.json**——它是工具自身要用的上下文,对齐 Trellis 把 workflow/spec 放 `.trellis/` 的做法)。**产物模板=知识库 `kind:template` 条目**,workflow `gate.artifacts` 升级 `string|{path,title?,template?}`(门禁仍只核 path 存在非空),格式由 skill 引用、session-start 注入,不内联进 workflow.json。知识条目注入分 `inject:full|index`(`resolvePlannedContext` 返回带形态的 `PlannedEntry[]`)。**验收清单=结构化 `checklist.json`(zod 校验)** 而非 markdown checkbox(后者靠模型输出正确语法、丢项即静默失守);默认不进硬门禁,web 任务详情**三层进度**(phase/gate/checklist)。
> **2026-06-15 评审(知识库检索轮)**:知识库**检索定为 agent 自读文件(渐进披露)**——删 `search` 命令与 qmd 依赖,保留 `graph/index/lint`(维护侧 bookkeeping);`index.md` 改**每层一个**(根 catalog + `wiki/` 可分子目录,各级由 `ttur knowledge index` 重算);检索升级(SQLite FTS5)仅在无 fs 权限消费者或 grep 失效时、藏 core 检索接口后,不引入 qmd CLI 依赖。详见 knowledge.md §6/§9。

---

## 1. 文档地图(6 份)

| 文档 | 讲什么 | 何时读 |
| --- | --- | --- |
| [core.md](./core.md) | **事实源**:`@tuteur/core`、双层数据格式、用户模型、**阶段容器 workflow/state**、events、InitConfig、归档、**skill 发现**、数据契约 | 读写 `.tuteur/`、类型、门禁、全局/项目、用户、初始化、归档、契约时 |
| [cli.md](./cli.md) | `ttur` 命令(`complete`/`task`/`rewind`/`approve`/`hook`,默认 JSON 输出)、数据注册表+per-agent configurator+通用层(hook 走模板树)、模板更新 | 改命令、加 agent 平台、做 hook 入口、skill 发现时 |
| [harness.md](./harness.md) | 节点门禁(gate)、**switch 靠 agent 判断**、上下文流转、hook 三阶段注入、**当前任务定位 + 子 agent 约定**、用户扩展 | 做门禁、分支、写 hook、定注入、定位任务时 |
| [knowledge.md](./knowledge.md) | **知识库**:全局/项目同构 `knowledge/`(karpathy LLM Wiki 三层)、条目 schema、ingest/query/lint、注入接入(`context.json` 分层) | 做知识库、上下文注入内容、`tuteur-knowledge` skill、注入编排时 |
| [web.md](./web.md) | 多项目+全局 dashboard、**workflow 画布编辑**、事件时间线、知识库管理+注入编排器、页面、API、web 触发 init | 做 UI、画布、注入管理、加 API 时 |


**依赖方向**:cli / harness / web / knowledge 都引用 **core**。数据 schema、双层模型、阶段容器/节点图、用户模型、InitConfig、归档、skill 发现、数据契约只在 core 定义一次,其余引用不重写。知识库目录模型/条目 schema/维护操作在 **knowledge.md** 定义一次,core 只承载 `knowledge/` 目录与 `context.json`/`resolvePlannedContext` 数据。

---

## 2. 针对历轮不满的解法

| 你的不满 | 解法 | 落点 |
| --- | --- | --- |
| 流程用 CLI、session 用 py 不统一 | hook 退化为薄转发 → `ttur hook <event>`,逻辑全在 core | harness §0/§6、cli §8.4 |
| 读本地数据未抽公共 util | `@tuteur/core` 唯一读写层,cli/app/hook 共用 | core 全文 |
| 用户数据无管理 | `.developer`(本地身份)+ `workspace/<slug>/`(提交,子目录即名册);项目过滤、全局不过滤 | core §3 |
| web 页面没对齐 | 多项目看板+全局配置+项目过滤+web 触发 init | web §2/§3 |
| agent 接入无统一流程 | **数据注册表(纯数据)+ per-agent configurator + shared 通用层;hook 走模板树** | cli §8 |
| 无数据契约 | 四方数据通道契约(机制,产物按需,不绑每步) | core §7 |
| web/cli 交互不统一 | **InitConfig** 统一模型,flag/交互/web 表单同源,serializeToCommand | core §8、cli §4.1 |
| 归档绑产物、逻辑不清 | 归档=改状态+移整个目录到 `tasks/archive/`,**不绑产物** | core §9 |
| `--agents`/`skill-mode` 命名 | per-agent flag(`--codex`)+ `skills`(`--copy`) | cli §4.1 |
| 数据结构不满意 | 按全局/项目分层逐文件重定义 + web 用途标注 | core §2/§4 |
| workflow 需画布+分支 | 固定三阶段容器(skill/switch)+ 画布编辑;switch 靠 agent 判断、报分支、harness 路由 | core §4.3、harness §2.5、web §3.3 |
| 读不到本地 skill | `discoverSkills`(core 能力):扫项目+全局各 agent home,带 source tag,供 web 画布;不暴露 CLI 命令 | core §5.1、cli §8.6 |
| 工程化:子 agent | 由主 agent 自主派发;预置角色定义 + skill 调度协议(pull-based prelude) | harness §7.2 |
| 去掉 phases 怎么看主体流程 | phase 升为**固定三阶段容器**(粗粒度,驱动 status)+ 框内节点图(细粒度) | harness §1 |
| web 不实时 | chokidar watch `.tuteur/` + SSE 推送局部刷新 | web §4.2 |
| 多任务并行 | 已后置;worktree 方案确认并存档(主仓库事实源 + sparse-checkout) | core §9.1 |
| 执行质量可观察 | `events.jsonl` 记验收尝试/跳步/注入;阈值告警 + P2 统计页 | core §4.4 |

---

## 3. 实现状态矩阵

> **当前只实现初始化与模板管理骨架。** 驱动闭环的核心(core 包、task/complete/hook、门禁、events、UI 视图、多项目)全部待实现。标 `[待实现]` 为推荐方案,可调但应守契约。

| 能力 | 状态 | 落点 |
| --- | --- | --- |
| `ttur init` / `dashboard` / `update` / `uninstall` | ✅ 已实现 | cli §4 |
| 数据注册表(AGENT_PLATFORMS)+ per-agent configurator(拷模板树+skill)+ shared 通用层 | ✅ 已实现(hook 脚本正文待填,见 §6) | cli §8 |
| dashboard 用户识别+任务计数(单项目) | ✅ 已实现(待并入 core) | web §3 |
| **`@tuteur/core` 包** | ✅ 已建(types/paths/store/domain/context/skills/hook) | core 全文 |
| 双层(全局/项目)模型 + projects 注册表 | 🟡 项目 + 全局 init(config/projects 写入层)已实现;dashboard 消费待补 | core §2 |
| InitConfig 统一初始化(flag/交互/web 同源) | 🟡 core 模型 + CLI(per-agent flag/`--global`/`--copy`/交互)已实现;web 表单待接入 | core §8 |
| `ttur task`(create/list/status/start/assign/archive 分桶)/ `complete`(--branch/--reason/--skip)/ `rewind` / `approve` / `hook` | ✅ 已实现 | cli §5、core §9 |
| workflow 固定阶段容器 + 节点图(skill/switch) | ✅ 已实现(zod schema + init 默认 workflow) | core §4.3、harness §2.5 |
| 节点门禁 completeNode(skill gate / switch --branch)+ advanceWorkflow(遇 switch 停)+ rewind | ✅ 已实现 | harness §2/§3 |
| `events.jsonl`(验收/注入/跳过/判定/回退)+ 阈值告警(派生) | ✅ 已实现(告警计数 countConsecutiveFailures) | core §4.4 |
| 当前任务定位(task start/指针/兜底/AMBIGUOUS/STALE) | ✅ 已实现 | harness §7.1 |
| skill 发现(项目 + 各 agent home,带 tag,按名去重) | 🟡 discoverSkills/resolveSkillRef 基础版已实现 | core §5.1、cli §8.6 |
| workflow 画布编辑(三固定容器 + skill/switch 节点) | ❌ 未实现 | web §3.3 |
| 实时更新(chokidar watch + SSE) | ❌ 未实现 | web §4.2 |
| worktree 多任务并行 | ⏸ 已后置(方案存档) | core §9.1 |
| 上下文流转 planned + session_start 事件回写 | ✅ 已实现(resolvePlannedContext + hook 回写) | harness §4 |
| 知识库 `knowledge/`(目录+条目 schema+ingest/query/lint)+ `tuteur-knowledge` skill | 🟡 目录布局(init 建 sources/wiki + 空 index.md/log.md)+ 条目 schema + 维护命令已实现;ingest/query 与 `tuteur-knowledge` skill 正文未实现 | knowledge.md |
| 知识库 web 管理页(全局+项目两区,md 渲染)+ `ttur knowledge graph/index/lint`(分 scope)+ 图谱视图 | 🟡 `ttur knowledge graph/index/lint`(分 scope,graph 含 `--merged`)已实现;web 管理页 + 图谱视图未实现 | knowledge.md §9/§10、web §3 |
| context.json 分两层(default/node,项目共享不分用户)+ resolvePlannedContext 合并 | 🟡 default/node 合并已实现;全局/知识层待补 | knowledge.md §7、core §4 |
| hook 薄转发 + `ttur hook session-start` 注入(多态 + 软失败 + kill-switch) | ✅ 已实现(后续 per-turn/子 agent hook 待补) | harness §6 |
| session-start `<guide>`(读 `.tuteur/guide.md` 工具文件)+ `<current-state>` git 块 | ✅ 已实现(严格 section 分块为后续细化) | harness §6.4、H13 |
| 注入形态 `inject:full\|index` + resolvePlannedContext 返回 PlannedEntry[] | ✅ 已实现(知识库读取层 readKnowledgeEntry) | knowledge §4/§7、H14 |
| 产物模板(`kind:template` + `gate.artifacts` 升级 ArtifactSpec) | 🟡 `gate.artifacts` 升级 `ArtifactSpec`(门禁只核 path)已实现;`kind:template` 注入待补 | core §4.3.1、knowledge §4.1、K13 |
| 验收清单 `checklist.json`(zod + `ttur check` + web 三层进度) | 🟡 `checklist.json`(zod)+ `ttur check add/done/undo/list` + `checklistProgress` 已实现;web 三层进度待补 | core §4.7、web §3.4、K14/W16 |
| workflow 校验 `validateWorkflow`(无环/唯一 default/边存在/阶段单调/skill·template ref)+ `ttur workflow validate` + create 拦截 | ✅ 已实现(结构 error 拦 create,ref 悬空告警) | harness §3、H10 |
| skill 正文(5 个 SKILL.md 全 TODO) | ❌ 未实现 | harness §5 |
| 多项目 dashboard + 全局配置 + web 触发 init | ❌ 未实现 | web §2-§6 |
| listDevelopers(读 workspace/)/ approval 读写 | 🟡 approval 读写(`ttur approve`)已实现;listDevelopers 待补 | core §3、web §6 |

---

## 4. 核心概念速查

| 术语 | 一句话 | 详见 |
| --- | --- | --- |
| Scope | 全局(`~/.tuteur`)或项目(`<repo>/.tuteur`)根;全局不过滤用户,项目过滤 | core §2 |
| @tuteur/core | 唯一碰盘 + 门禁 + 类型层,cli/app/hook 共用 | core §1/§5/§6 |
| 阶段容器 + 节点图 | 固定三容器(规划/执行/收尾,不可增删)+ 框内/框前 skill 节点(单出)、switch 节点(单入多出,必含 default);无环、阶段单调 | core §4.3 |
| 节点门禁 | `completeNode`:skill 走 `gate`(artifact 存在+非空/check/approval)、switch 需 `--branch`;失败不改 state(停留重试);switch 走到就停、不自动求值 | harness §2/§3 |
| 分支(switch) | **靠 agent 判断**:走到就停,agent 读各分支 criteria、`ttur complete --branch --reason` 报分支,harness 校验并路由;记 state.decisions(可审计);判错用 `ttur rewind` | harness §2.5/§3.1 |
| events | 每任务 `events.jsonl`(提交进 git):验收尝试/会话注入/跳过;告警与统计数据源 | core §4.4 |
| 当前任务 | `--task` > `runtime/current-task.json` 指针(`task start` 写)> 唯一未完成兜底;多个未完成→AMBIGUOUS 报错让用户选定/新建 | harness §7.1 |
| skill 发现 | `discoverSkills` 扫项目目录 + 各 agent home 目录,带 agent/source tag | core §5.1 |
| 上下文流转 | knowledge → context.json(分层) → plannedContext → hook 注入 → session_start 事件(injected) | harness §4、knowledge.md §7 |
| 知识库 | 全局/项目同构 `knowledge/`(sources+wiki+index.md+log.md,karpathy 模式);agent 维护、`tuteur-knowledge` skill 定协议;注入按 id 注索引 | knowledge.md |
| Hook 薄转发 | 声明文件里直接写 `ttur hook <event>` 命令(无 py/sh 脚本),逻辑在 core;Codex 需手动开 hook flag 并 `/hooks` 信任 | harness §6、cli §8.4 |
| Agent 接入 | 数据注册表(纯静态数据)+ per-agent configurator(行为)+ shared(生成);hook 走 `templates/<id>/` 模板树;不含进程托管 | cli §8 |
| InitConfig | flag/交互/web 表单同源产出,统一执行 + 序列化成命令 | core §8 |
| 归档 | 移目录到 `tasks/archive/<YYYY-MM>/<id>/`,默认不改状态(可标 cancelled),不绑产物 | core §9 |
| 数据契约 | 四方数据通道(机制,产物按需,不绑每步) | core §7 |
| 用户模型 | `.developer`(本地身份,gitignore)+ `workspace/<slug>/`(提交,子目录即名册,无 members.json) | core §3 |
| 主体流程 vs 步骤 | 固定三阶段容器(粗:planning/execute/finish,phaseOf 派生驱动 status)+ 框内节点图(细) | harness §1 |
| 实时更新 | chokidar watch `.tuteur/` + SSE 推浏览器局部刷新 | web §4.2 |
| worktree 并行 | 已后置;方案存档(主仓库事实源 + sparse-checkout 排除 .tuteur) | core §9.1 |

最重要不变量:**agent 自称完成 ≠ 节点完成**;完成只由 `completeNode` 判定,确定性门禁(产物/检查)永不自动放行,人工跳过显式留痕。**例外:approval 已降为软约定**——允许 agent 经 `ttur approve` 写,强制停下问人只靠 skill 提示词(harness §2.6,单人交互下的取舍)。

---

## 5. 落地优先级(P0 有序)

```text
P0(主闭环,先地基后闭环)
  1. @tuteur/core:包+zod类型+双层 paths+store(含 events/当前任务指针)   core K1-K3/K10/K11
  2. domain:completeNode(skill gate / switch --branch)/advanceWorkflow(遇 switch 停+无环+阶段单调)/rewindTo/phaseOf+单测  core K4 / harness H2-H3/H9
  3. InitConfig + INIT_QUESTIONS + serializeToCommand          core K6 / cli C6
  4. cli/app 改依赖 core,删重复读盘与常量                    cli C1 / web W1
  5. ttur task create/list/status/start/archive(归档分桶)     cli C2 / core §9 / harness H7
  6. 默认 workflow 改固定阶段容器(triage switch 分诊 + 三框)          harness H1
  7. ttur complete <node>(skill gate 0/2、switch --branch、JSON 接力、--skip)+ rewind + approve      cli C3 / harness H8
  8. ttur hook session-start(五态)+ hook 声明文件(命令直配)+ 事件回写       harness H4-H5 / cli C4
  9. 数据注册表+per-agent configurator+模板树承载 hook            cli C5
 10. 填实 5 个 SKILL.md(brainstorm/grill-me/dev/check/finish)         harness H6
 11. web 项目列表+任务看板+详情+web 触发 init                 web W2-W3

P1:skill 发现(K9/C10/W11)、workflow 画布(W10)、实时更新 watch+SSE(W13)、
    事件时间线页(W4)、approval(H11/W6)、全局配置页(W5)、context 页(W7)、
    --global(C7)、standalone(W9)、skill 解析校验(H10)
P2:人工分支、workflow validate、artifact 查看器、members、执行质量统计页、
    inject-workflow-state / inject-subagent-context hook(H12)、worktree 并行(K12/C12/W14,方案存档)
```

---

## 6. 待产品确认汇总(推荐已给,❓需拍板)

| 主题 | 推荐 | ❓ |
| --- | --- | --- |
| 全局根放 tasks | **已定:否**,全局只放 config+注册表+模板 | |
| 加项目无 .tuteur 时 | **已定:做「初始化项目」按钮**,web 经非交互 init 触发 | |
| agent 接入方式 | **已定:数据注册表(纯数据)+per-agent configurator+通用层,hook 走模板树**(Trellis 风格) | |
| `--agents`/`skill-mode` 命名 | **已定:per-agent flag(`--codex`)+ `--copy`** | |
| 归档逻辑 | **已定:移目录(`archive/<YYYY-MM>/` 分桶)+ 默认不改状态,未完成可标 cancelled,不绑产物,不做 git 操作** | |
| workflow 模型 | **已定:固定三阶段容器 + skill/switch 两类节点**(skill 单出/switch 必含 default/无环/阶段单调) | |
| 画布编辑 MVP | **已定:可编辑画布**,三个固定容器(React Flow Sub Flow)+ skill/switch 节点 | |
| 分支判断机制 | **已定:switch 靠 agent 判断,走到就停,`ttur complete --branch --reason` 报分支,harness 校验并路由;判错用 rewind** | |
| 返工模型 | **已定:停留原节点重试,门禁失败不改 state;validate 拒绝回边** | |
| 重试上限语义 | **已定:仅告警线(标黄),永不自动放行;人工 `--skip` 显式跳过留痕** | |
| 执行模式 | **已定:交互模式唯一,run 模式移除**(Tuteur 不启动/托管 agent 进程) | |
| 节点 agent / 子 agent 隔离 | **已撤销:随 run 模式后置**;子 agent 由主 agent 自主派发(harness §7.2) | |
| 当前任务定位 | **已定:`task start` 指针 + 唯一未完成任务兜底 + `--task` 覆盖**(对齐 Trellis) | |
| events.jsonl 是否进 git | **已定:提交**(换环境不丢任务可视内容) | |
| CLI 输出 | **已定:全命令默认输出简单 JSON**(无独立 `--json` flag,成败统一结构化;hook 例外,输出注入文本) | |
| 实时更新机制 | **已定:文件监听(chokidar)+ SSE** | |
| worktree 并行 | **已后置:方案确认并存档**(core §9.1) | |
| phase 去留 | **已定:升为固定三阶段容器**(主体阶段概览 + 驱动 task.status;phaseOf 派生,不进 state) | |
| actualContext 采集精度 | **已定:session_start 事件 `injected` 清单近似** | |
| session-start 注入可配 | **已定:三分法**(fixed/config/derived);项目须知放**工具文件 `.tuteur/guide.md`**(非知识库),规范走 `context.json`+知识库,代码只留外壳;git 块已补(harness §6.4) | |
| 产物模板承载 | **已定:知识库 `kind:template` 条目**,`gate.artifacts` 升级 `{path,title?,template?}`;门禁仍只核 path 存在非空;格式由 skill 引用、session-start 注入(core §4.3.1、knowledge §4.1) | |
| checklist / 进度数据 | **已定:结构化 `checklist.json`(zod)**,非 markdown 解析;默认不进硬门禁,web 三层进度(phase/gate/checklist);「收尾要求全勾」可选 gate 默认关 | ❓全勾门禁 |
| `ttur run <step>` 进 MVP | **已定:不进**(随 run 模式移除) | |
| 身份/配置文件格式 | 统一 JSON(web 读写一致),不引入 YAML | ❓ |
| web 是否可编辑 artifact | 只读 + approval/context 编辑 | ❓ |
| core 是否独立发包 | 内部私有包,随 cli/app 构建 | |

---

## 7. 维护约定

- 数据结构/双层/用户/契约只在 **core.md** 改,其余引用。
- 新「已实现」能力 → 更新 §3 状态矩阵(❌→✅)。
- 推荐方案被采纳/否决 → 更新对应 §9.3 与本页 §6,去掉 `[待实现]`/❓。
- 实施规格定位,不写营销话术;每条主张可追溯到代码或明确标注推荐。
