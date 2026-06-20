---
id: decisions
title: '评审决策与实现状态'
scope: project
kind: overview
tags: [withy, decisions, status, roadmap, review]
summary: '评审决策史、实现状态矩阵、针对历轮不满的解法、落地优先级、待产品确认与维护约定(自旧 INDEX 提炼,去掉导航地图与概念速查)。'
inject: index
injectByDefault: false
updated: 2026-06-20
---

# 评审决策与实现状态

> 本页汇总 Withy 设计的**评审决策史、实现状态矩阵、落地优先级与待确认项**(自旧 `docs/design/INDEX.md` 提炼,去掉与生成索引/各设计页重复的导航地图与概念速查;章节号保留原编号,故跳过 §1/§4)。
> 背景见 [[prd]];分域设计见 [[core]] · [[cli]] · [[harness]] · [[harness-flow]] · [[knowledge-base]] · [[web]] · [[visual-design]]。
> 主线:**唯一逻辑层 `@withy/core` + 唯一入口 `withy` + hook 薄转发 + 双层(全局/项目)+ InitConfig 统一初始化 + 注册表/per-agent configurator/通用层 + 固定三阶段(规划/执行/收尾)workflow(skill/switch 两类节点)+ `withy next` 低歧义推进 + switch 靠 agent 判断(报分支、harness 路由)。**
> 参考实现:Trellis(`mindfold-ai/Trellis`)—— **数据注册表纯数据(`AI_TOOLS` 无函数)+ 行为表分离 + hook 是模板文件拷贝(无适配器)**、归档移目录、身份 gitignore、per-agent flag、当前任务指针,CLI 仅 init/uninstall/update(无 skill 命令);**反向教训**:其禁止 home 运行,我们做全局时设了安全边界(core §2.3)。
> **2026-06-13 评审**:run 模式 / worktree 并行 / 节点级 agent / 子 agent 隔离移出 MVP;新增 events.jsonl、`withy task start`、complete 接力输出与 `--json`、归档 cancelled 与按月分桶。
> **2026-06-14 评审**:workflow 改**固定三阶段容器 + skill/switch 两类节点**;废弃 decision/signal/decision.json/JSON-Pointer——**switch 靠 agent 判断、走到就停、`withy complete --branch --reason` 报分支**,记 `state.decisions`;`skillRef`→`skill`(按名引用、运行时各工具用自己那份、缺则报错);门禁三项收进可选 `gate`(产物只核存在+非空);approval 降为软约定(`withy approve`,agent 可写、不依赖 web);命令输出统一简单 JSON;新增 `withy rewind`;当前任务多个未完成→AMBIGUOUS 报错;新任务由 agent 建。
> **2026-06-14 评审(上下文/产物轮)**:厘清「会话上下文管理」三问。**注入内容三分法**:`fixed`(协议外壳=代码常量)/`config`(用户可改=工具文件+context.json+知识库+skill)/`derived`(core 现算=身份/git/任务/进度)。session-start 补 git 块、把「Withy 介绍/项目须知」放进**工具文件 `.withy/guide.md`**(session-start 直接读、注全文,**不走知识库/context.json**——它是工具自身要用的上下文,对齐 Trellis 把 workflow/spec 放 `.trellis/` 的做法)。**产物模板=知识库 `kind:template` 条目**,workflow `gate.artifacts` 升级 `string|{path,title?,template?}`(门禁仍只核 path 存在非空),格式由 skill 引用、session-start 注入,不内联进 workflow.json。知识条目注入分 `inject:full|index`(`resolvePlannedContext` 返回带形态的 `PlannedEntry[]`)。**验收清单=结构化 `checklist.json`(zod 校验)** 而非 markdown checkbox(后者靠模型输出正确语法、丢项即静默失守);默认不进硬门禁,web 任务详情**三层进度**(phase/gate/checklist)。
> **2026-06-15 评审(知识库检索轮)**:知识库**检索定为 agent 自读文件(渐进披露)**——删 `search` 命令与 qmd 依赖,保留 `graph/index/lint`(维护侧 bookkeeping);`index.md` 改**每层一个**(根 catalog + `wiki/` 可分子目录,各级由 `withy knowledge index` 重算);检索升级(SQLite FTS5)仅在无 fs 权限消费者或 grep 失效时、藏 core 检索接口后,不引入 qmd CLI 依赖。详见 knowledge-base.md §6/§9。
> **2026-06-17 评审(推进命令收敛轮)**:确认 Withy 是**协作式 harness / 轻量状态机**,不是 agent 执行沙箱;继续排除 run 模式、命令代理、shell allowlist。agent 面向命令从 `withy complete <node>` 收敛为 **`withy next`**:默认读取 `state.currentNode` 校验当前节点门禁并推进,不再让 agent 传 node;停在 switch 时 `withy next` 只输出合法分支与提示,真正判定用 `withy next --branch <label> --reason "..."`。**删除 CLI `complete` 命令**,不保留兼容入口;`approve` 默认批准当前节点;`rewind` 使用 `--to <node>` 显式选择回退目标。
> **2026-06-17 评审(画布编排轮)**:workflow 画布从「固定容器 Sub Flow」改为**自由画布 + 软泳道**(n8n 式自由摆放 + 端口连线)。确立**位置与阶段解耦**:节点新增 `pos:{x,y}`(纯展示、不参与校验),`phase` 是驱动 task.status 的字段;**泳道不入库**,从 `workflow.phases` 顺序渲染(横带,上→下=规划→执行→收尾;flow 左→右),**无独立分诊列**——`phase` 缺省/`null` 节点归入第一条泳道(规划)显示。**拖进哪条泳道即写回 `node.phase`**(drop 时按节点中心命中、命中带否则取最近带,`pos.y` 存为带内相对偏移、钳到带顶之下故节点恒在带内、不出带不夹缝),每次 drop 强制改写故位置与 phase 不漂移;**不为 placement 新增任何校验——用户怎么摆就怎么存**(入口落在哪阶段、空阶段、跳过整段都接受)。连线由端口拖拽写回 `next`/`branches`、贝塞尔**统一实线**(分支靠 label 区分);泳道按内容自动长高、**虚线包围 + 带间间隔 + 暖色半透明底**(规划金/执行陶土/收尾橄榄);入口/终点用「入口」「终点」徽标。既有图校验(无环/阶段单调/switch default)仅保存时生效、`pos` 不参与。详见 web §3.3、core §4.3。
> **2026-06-18 评审(命令收敛轮)**:CLI 输出从「全命令默认 JSON」改为**每命令两态**——缺省人读、全局 `--json` 转结构化(无 per-command flag;hook 例外)。**`task create` 并入 `task start`**(实参命中已存在 id→聚焦,否则当 title 新建;`-w/-a` 仅新建路径)。**删除三个命令**:`task assign`(改派改手动编辑 task.json,保留 `assignee` 字段与 `start --assignee`)、`withy check` 命令族、`withy workflow validate`(`validateWorkflow` 仍作 core 函数,在 `task start` 新建与 web 保存时跑)。**实施计划统一为 `implement.md`(markdown 复选框)**:agent 直写、web 只读展示、`implementationProgress` best-effort 解析复选框行并报未识别行数;文件存在性可进规划门禁,勾选状态不参与放行。详见 cli.md、core §3.1/§4.7。
> **2026-06-20 评审(推进引导与进度可见性轮)**:修新会话误推进(events 实证:`session_start` 后 20s 即 `complete_attempt dev ok`,被迫 rewind)。**session-start 对 skill 节点的 Next-Action 不再字面让 agent 直接 `withy next`**,改为「先看 `withy task status`、再跑该节点 skill(由 skill 自调 `withy next`)」;新会话无本会话工作记忆,故引导先核对再推进。`withy task status` 增出**当前节点 skill + git 工作区进度 + 软 nextAction**;确立 **dev 执行进度的真相源 = git 工作树**(withy-dev 进入时先 `git status/diff` 对照工作区续做),**刻意不给 dev 阶段加产物/勾选门禁**——dev 节点保持无 gate,implement 勾选只在 finish 归档前校验(harness §1、core §9),不在 dev 阶段越权校验。落地 `inject-workflow-state`(UserPromptSubmit)的**无活跃任务→提醒 build work 先 `withy task start`** 子集(H12 由 P2 部分落地);guide 的建 task 触发改写为**「动手写代码前的可操作前置门」**(build work 才提议、纯问答/只读不需)。仓库约定:`.prettierignore` 忽略 `.withy/`(运行时/任务/知识数据)与 `*.md`(Prettier 无意义重排 CJK 表格),见 [[testing-build-conventions]]。

---

## 2. 针对历轮不满的解法

| 你的不满                         | 解法                                                                                                    | 落点                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 流程用 CLI、session 用 py 不统一 | hook 退化为薄转发 → `withy hook <event>`,逻辑全在 core                                                  | harness §0/§6、cli §8.4           |
| 读本地数据未抽公共 util          | `@withy/core` 唯一读写层,cli/app/hook 共用                                                              | core 全文                         |
| 用户数据无管理                   | `.developer`(本地身份)+ `workspace/<slug>/`(提交,子目录即名册);项目过滤、全局不过滤                     | core §3                           |
| web 页面没对齐                   | 多项目看板+全局配置+项目过滤+web 触发 init                                                              | web §2/§3                         |
| agent 接入无统一流程             | **数据注册表(纯数据)+ per-agent configurator + shared 通用层;hook 走模板树**                            | cli §8                            |
| 无数据契约                       | 四方数据通道契约(机制,产物按需,不绑每步)                                                                | core §7                           |
| web/cli 交互不统一               | **InitConfig** 统一模型,flag/交互/web 表单同源,serializeToCommand                                       | core §8、cli §4.1                 |
| 归档绑产物、逻辑不清             | 归档=校验已完成 + 实施清单全勾选后移整个目录到 `tasks/archive/`,校验而非改状态                          | core §9                           |
| `--agents`/`skill-mode` 命名     | per-agent flag(`--codex`)+ `skills`(`--copy`)                                                           | cli §4.1                          |
| 数据结构不满意                   | 按全局/项目分层逐文件重定义 + web 用途标注                                                              | core §2/§4                        |
| workflow 需画布+分支             | 固定三阶段(skill/switch)+ 自由画布(软泳道)编辑;switch 靠 agent 判断、报分支、harness 路由               | core §4.3、harness §2.5、web §3.3 |
| 推进命令让 agent 易传错节点      | agent 面向入口收敛为 `withy next`,由 core 读取 `state.currentNode`;只有 switch 需要 `--branch --reason` | harness §2、cli §5.2              |
| 读不到本地 skill                 | `discoverSkills`(core 能力):扫项目+全局各 agent home,带 source tag,供 web 画布;不暴露 CLI 命令          | core §5.1、cli §8.6               |
| 工程化:子 agent                  | 由主 agent 自主派发;预置角色定义 + skill 调度协议(pull-based prelude)                                   | harness §7.2                      |
| 去掉 phases 怎么看主体流程       | phase 升为**固定三阶段**(粗粒度,驱动 status)+ 阶段内节点图(细粒度)                                      | harness §1                        |
| web 不实时                       | chokidar watch `.withy/` + SSE 推送局部刷新                                                             | web §4.2                          |
| 多任务并行                       | 已后置;worktree 方案确认并存档(主仓库事实源 + sparse-checkout)                                          | core §9.1                         |
| 执行质量可观察                   | `events.jsonl` 记验收尝试/跳步/注入;阈值告警 + P2 统计页                                                | core §4.4                         |

---

## 3. 实现状态矩阵

> **当前核心 CLI/harness 闭环已部分落地。** `task`/`rewind`/`approve`/`hook session-start`、workflow schema、门禁、events 已实现;主要缺口是删除 `complete` 并落地 agent 面向的 `withy next`、skill 正文、web 画布/实时能力、多项目控制台与部分知识库体验。标 `❌/🟡` 的项仍可调但应守契约。

| 能力                                                                                                                         | 状态                                                                                                                 | 落点                             |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `withy init` / `dashboard` / `update` / `uninstall`                                                                          | ✅ 已实现                                                                                                            | cli §4                           |
| 数据注册表(AGENT_PLATFORMS)+ per-agent configurator(拷模板树+skill)+ shared 通用层                                           | ✅ 已实现(hook 入口由模板树承载,见 §6)                                                                               | cli §8                           |
| dashboard 用户识别+任务计数(单项目)                                                                                          | ✅ 已实现(待并入 core)                                                                                               | web §3                           |
| **`@withy/core` 包**                                                                                                         | ✅ 已建(types/paths/store/workflow〔engine/interpret/gate/runtime/validate〕/task/context/skills/hook)               | core 全文                        |
| 双层(全局/项目)模型 + projects 注册表                                                                                        | 🟡 项目 + 全局 init(config/projects 写入层)已实现;dashboard 消费待补                                                 | core §2                          |
| InitConfig 统一初始化(flag/交互/web 同源)                                                                                    | 🟡 core 模型 + CLI(per-agent flag/`--global`/`--copy`/交互)已实现;web 表单待接入                                     | core §8                          |
| `withy task`(start 建或聚焦/list/status/archive 分桶)/ `rewind` / `approve` / `hook`                                         | ✅ 已实现                                                                                                            | cli §5、core §9                  |
| `withy next`(读取当前节点、校验当前门禁、输出下一节点;switch 需 `--branch --reason`)                                         | ✅ 已实现(agent 面向唯一推进入口;`complete` 已删除)                                                                  | cli §5.2、harness §2             |
| `withy complete <node>`                                                                                                      | 🗑️ 已删除(无 `complete` 命令,推进统一走 `withy next`)                                                                | cli §5.2                         |
| workflow 固定三阶段 + 节点图(skill/switch)                                                                                   | ✅ 已实现(zod schema + init 默认 workflow)                                                                           | core §4.3、harness §2.5          |
| 节点门禁 nextNode(skill gate / switch --branch)+ advanceWorkflow(遇 switch 停)+ rewind                                       | ✅ 已实现(`nextNode` + `withy next`;`complete` 路径已移除)                                                           | harness §2/§3                    |
| `events.jsonl`(验收/注入/跳过/判定/回退)+ 阈值告警(派生)                                                                     | ✅ 已实现(告警计数 countConsecutiveFailures)                                                                         | core §4.4                        |
| 当前任务定位(task start/指针/兜底/AMBIGUOUS/STALE)                                                                           | ✅ 已实现                                                                                                            | harness §7.1                     |
| skill 发现(项目 + 各 agent home,带 tag,按名去重)                                                                             | 🟡 discoverSkills/resolveSkillRef 基础版已实现                                                                       | core §5.1、cli §8.6              |
| workflow 画布编辑(自由画布 + 软泳道,skill/switch 节点)                                                                       | ✅ 已实现(节点 `pos` + 拖动落盘 + 拖停定阶段 + 贝塞尔连线)                                                           | web §3.3                         |
| 实时更新(chokidar watch + SSE)                                                                                               | ❌ 未实现                                                                                                            | web §4.2                         |
| worktree 多任务并行                                                                                                          | ⏸ 已后置(方案存档)                                                                                                   | core §9.1                        |
| 上下文流转 planned + session_start 事件回写                                                                                  | ✅ 已实现(resolvePlannedContext + hook 回写)                                                                         | harness §4                       |
| 知识库 `knowledge/`(目录+条目 schema+ingest/query/lint)+ `withy-knowledge` skill                                             | ✅ 目录布局 + 条目 schema + 维护命令(graph/index/lint)+ `withy-knowledge` skill 正文(ingest/query/lint 协议)均已落地 | knowledge-base.md                |
| 知识库 web 管理页(全局+项目两区,md 渲染)+ `withy knowledge graph/index/lint`(分 scope)+ 图谱视图                             | 🟡 `withy knowledge graph/index/lint`(分 scope,graph 含 `--merged`)已实现;web 管理页 + 图谱视图未实现                | knowledge-base.md §9/§10、web §3 |
| context.json 分两层(default/node,项目共享不分用户)+ resolvePlannedContext 合并                                               | 🟡 default/node 合并已实现;全局/知识层待补                                                                           | knowledge-base.md §7、core §4    |
| hook 薄转发 + `withy hook session-start` 注入(多态 + 软失败 + kill-switch)                                                   | ✅ 已实现;per-turn `inject-workflow-state`(UserPromptSubmit)落地「无活跃任务→提醒建 task」子集,子 agent hook 待补          | harness §6                       |
| session-start `<guide>`(读 `.withy/guide.md` 工具文件)+ `<current-state>` git 块                                             | ✅ 已实现(严格 section 分块为后续细化)                                                                               | harness §6.4、H13                |
| 注入形态 `inject:full\|index` + resolvePlannedContext 返回 PlannedEntry[]                                                    | ✅ 已实现(知识库读取层 readKnowledgeEntry)                                                                           | knowledge §4/§7、H14             |
| 产物模板(`kind:template` + `gate.artifacts` 升级 ArtifactSpec)                                                               | 🟡 `gate.artifacts` 升级 `ArtifactSpec`(门禁只核 path)已实现;`kind:template` 注入待补                                | core §4.3.1、knowledge §4.1、K13 |
| 实施计划 `implement.md`(markdown + best-effort 复选框解析 + web 只读进度)                                                    | ✅ 已实现                                                                                                            | core §4.7、web §3.4、K14/W16     |
| workflow 校验 `validateWorkflow`(无环/唯一 default/边存在/阶段单调/skill·template ref)+ `task start` 新建拦截 + web 保存校验 | 🟡 校验逻辑 + create 拦截已实现;独立 `withy workflow validate` 命令待删(校验留作 core 函数)                          | harness §3、H10                  |
| skill 正文(5 个 workflow SKILL.md + `withy-knowledge`)                                                                       | ✅ 已落地(brainstorm/grill-me/dev/check/finish + withy-knowledge)                                                    | harness §5                       |
| 多项目 dashboard + 全局配置 + web 触发 init                                                                                  | ❌ 未实现                                                                                                            | web §2-§6                        |
| listDevelopers(读 workspace/)/ approval 读写                                                                                 | 🟡 approval 读写(`withy approve`)已实现;listDevelopers 待补                                                          | core §3、web §6                  |

---

## 5. 落地优先级(P0 有序)

```text
P0(主闭环,先地基后闭环)
  1. @withy/core:包+zod类型+双层 paths+store(含 events/当前任务指针)   core K1-K3/K10/K11
  2. workflow:nextNode(skill gate / switch --branch)/advanceWorkflow(遇 switch 停+无环+阶段单调)/rewindTo/phaseOf+单测  core K4 / harness H2-H3/H9
  3. InitConfig + INIT_QUESTIONS + serializeToCommand          core K6 / cli C6
  4. cli/app 改依赖 core,删重复读盘与常量                    cli C1 / web W1
  5. withy task start(不存在则新建)/list/status/archive(归档分桶)     cli C2 / core §9 / harness H7
  6. 默认 workflow 改固定三阶段(triage switch 分诊 + 三阶段)          harness H1
  7. withy next(读取 currentNode、switch --branch、JSON 接力、--skip)+ 删除 withy complete + rewind --to + approve 当前节点      cli C3 / harness H8
  8. withy hook session-start(五态)+ hook 声明文件(命令直配)+ 事件回写       harness H4-H5 / cli C4
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

| 主题                         | 推荐                                                                                                                                                                                                     | ❓  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 全局根放 tasks               | **已定:否**,全局只放 config+注册表+模板                                                                                                                                                                  |     |
| 加项目无 .withy 时           | **已定:做「初始化项目」按钮**,web 经非交互 init 触发                                                                                                                                                     |     |
| agent 接入方式               | **已定:数据注册表(纯数据)+per-agent configurator+通用层,hook 走模板树**(Trellis 风格)                                                                                                                    |     |
| `--agents`/`skill-mode` 命名 | **已定:per-agent flag(`--codex`)+ `--copy`**                                                                                                                                                             |     |
| 归档逻辑                     | **已定:仅已完成任务可归档(校验状态=completed + 实施清单全勾选)→ 移目录(`archive/<YYYY-MM>/` 分桶),校验而非改状态,未完成须 `--cancelled` 标取消,不做 git 操作**                                           |     |
| workflow 模型                | **已定:固定三阶段 + skill/switch 两类节点**(skill 单出/switch 必含 default/无环/阶段单调)                                                                                                                |     |
| 画布编辑 MVP                 | **已定:可编辑画布**,自由画布 + 软泳道(React Flow,节点存 `pos`;泳道从 `phases` 渲染、不入库)+ skill/switch 节点                                                                                           |     |
| 推进命令                     | **已定:agent 主入口用 `withy next`**,默认读取当前节点并校验门禁;switch 才用 `withy next --branch --reason`;**删除 `complete <node>`**,不保留兼容入口                                                     |     |
| 分支判断机制                 | **已定:switch 靠 agent 判断,走到就停,`withy next --branch --reason` 报分支,harness 校验并路由;判错用 rewind**                                                                                            |     |
| 返工模型                     | **已定:停留原节点重试,门禁失败不改 state;validate 拒绝回边**                                                                                                                                             |     |
| 重试上限语义                 | **已定:仅告警线(标黄),永不自动放行;人工 `--skip` 显式跳过留痕**                                                                                                                                          |     |
| 执行模式                     | **已定:交互模式唯一,run 模式移除**(Withy 不启动/托管 agent 进程)                                                                                                                                         |     |
| 节点 agent / 子 agent 隔离   | **已撤销:随 run 模式后置**;子 agent 由主 agent 自主派发(harness §7.2)                                                                                                                                    |     |
| 当前任务定位                 | **已定:`task start` 指针 + 唯一未完成任务兜底 + `--task` 覆盖**(对齐 Trellis)                                                                                                                            |     |
| events.jsonl 是否进 git      | **已定:提交**(换环境不丢任务可视内容)                                                                                                                                                                    |     |
| CLI 输出                     | **已定:每命令支持两种输出**——缺省人读文本,全局 `--json` 转单行结构化(无 per-command flag);`hook` 例外,输出注入正文                                                                                       |     |
| 实时更新机制                 | **已定:文件监听(chokidar)+ SSE**                                                                                                                                                                         |     |
| worktree 并行                | **已后置:方案确认并存档**(core §9.1)                                                                                                                                                                     |     |
| phase 去留                   | **已定:升为固定三阶段**(主体阶段概览 + 驱动 task.status;phaseOf 派生,不进 state)                                                                                                                         |     |
| actualContext 采集精度       | **已定:session_start 事件 `injected` 清单近似**                                                                                                                                                          |     |
| session-start 注入可配       | **已定:三分法**(fixed/config/derived);项目须知放**工具文件 `.withy/guide.md`**(非知识库),规范走 `context.json`+知识库,代码只留外壳;git 块已补(harness §6.4)                                              |     |
| 产物模板承载                 | **已定:知识库 `kind:template` 条目**,`gate.artifacts` 升级 `{path,title?,template?}`;门禁仍只核 path 存在非空;格式由 skill 引用、session-start 注入(core §4.3.1、knowledge §4.1)                         |     |
| implement / 进度数据         | **已定:`implement.md` 同时承载有序实施计划与 markdown 复选框进度**,agent 直写、web 只读展示;`implementationProgress` best-effort 解析 + 报未识别行数;文件存在性进规划门禁,勾选状态不参与放行,无 CLI 命令 |     |
| `withy run <step>` 进 MVP    | **已定:不进**(随 run 模式移除)                                                                                                                                                                           |     |
| 命令代理 / shell allowlist   | **已定:不进 MVP**;Withy 不接管 shell 执行,只做 workflow 状态事实源、hook 提醒、门禁验收与事件审计                                                                                                        |     |
| 身份/配置文件格式            | 统一 JSON(web 读写一致),不引入 YAML                                                                                                                                                                      | ❓  |
| web 是否可编辑 artifact      | 只读 + approval/context 编辑                                                                                                                                                                             | ❓  |
| core 是否独立发包            | 内部私有包,随 cli/app 构建                                                                                                                                                                               |     |

---

## 7. 维护约定

- 数据结构/双层/用户/契约只在 **core.md** 改,其余引用。
- 新「已实现」能力 → 更新 §3 状态矩阵(❌→✅)。
- 推荐方案被采纳/否决 → 更新对应 §9.3 与本页 §6,去掉 `[待实现]`/❓。
- 实施规格定位,不写营销话术;每条主张可追溯到代码或明确标注推荐。

---

## 关联页

- [[prd]] · [[core]] · [[cli]] · [[harness]] · [[harness-flow]] · [[knowledge-base]] · [[web]] · [[visual-design]]
