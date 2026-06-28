# PRD:子 agent 派遣能力 + 节点 agent 配置 + web 注入管理页

> 本文是需求文档,回答 **做什么 / 为什么 / 边界 / 验收口径**。技术方案见同目录 `design.md`。
> 上位设计:[[harness]] §7(子 agent 约定)、[[core]] §4.3/§4.5、[[web]] §3、[[knowledge-base]] §7。
> 本任务是一次会话内的**规划产出**:结论已在前序讨论收敛,下一会话据此实现。务求自洽完整,实现会话不应再缺信息。

---

## 0. 一句话

让 workflow 的某个节点可以声明"由一个子 agent 来执行这一步",由**主会话 agent** 在 `withy next` 推进到该节点时拿到现成的 `dispatch` 派遣块,把子 agent 拉起来、喂对上下文、收回紧凑结果;并把"子 agent 角色定义"和"派遣必读上下文"做成可在 web 可视化管理的能力。同时用一份**扁平的 `dispatch.json`**(任务级 `read` 清单)取代 `context.json`。

---

## 1. 背景与动机

Withy 现状里**子 agent 编排是空白**:设计文档(harness §7)只写了"靠 skill 正文约定、子 agent 自己 pull",`templates/{claude,codex}/agents/` 是空的(只有 `.gitkeep`),5 个 workflow skill 正文里没有任何调度协议。这块是 Withy 唯一退回"纯 Markdown 约定"的地方——恰恰是 Withy 立项要取代的软约束。

动机有二:

1. **上下文隔离**:重上下文的活(实现、检查、调研)塞给子 agent 去干,重活憋在子 agent 里、只回传紧凑摘要,主会话上下文保持干净(对抗注意力转移)。
2. **把派遣从"约定"升格为"结构 + 审计"**:节点声明"这步派谁",比塞在 skill 正文里靠 agent 自觉更可见、可配、可审计。

参考 Trellis(`mindfold-ai/Trellis`)的 `implement.jsonl` / `check.jsonl` 模式(调研结论见 design.md 附录)。

---

## 2. 不可逾越的产品边界(实现时反复对照)

这些是前序讨论反复确认的硬约束,违反即跑偏:

1. **Withy 不启动、不托管 agent 进程**(PRD §6.4 排除 run 模式)。派遣动作由**主会话 agent 用它自己的工具(如 Claude Task)发起**;Withy 只在节点上**声明**"该派谁",并提供上下文与审计。声明 ≠ 托管。
2. **不为子 agent 读状态新增任何命令**。子 agent 用普通文件读取(Read/Grep)拿上下文,不调 `withy` 命令。主 agent 把"该读什么"通过**派遣提示词规范**传给子 agent。
3. **门禁卡产出,不卡派发**。Withy 逼不出"主 agent 必须派子 agent"(工具调用层够不着);所以放行永远落在 `gate.checks` / `gate.artifacts` 这类**对产出的确定性核对**上,不落在"有没有派"。派不派子 agent 是手段,不是被强制的目标。
4. **单一事实源,不造重复**。派遣必读清单只有一处(一份扁平的 `dispatch.json`),不再额外维护 `context.json`;知识引用按 **id**(不按裸路径)。
5. **知识条目 frontmatter 绝不写任何工作流耦合内容**(不写"我属于哪个节点")。工作流耦合只住在贴着 workflow 的配置/任务产物里。

---

## 3. 核心结论(已收敛的设计决策)

### 3.1 节点级派遣

- 每个 **skill 节点**可声明一个**可选** `agent` 字段(最多一个)。声明了 → 主 agent 应派这个角色的子 agent 来执行本步;**不声明 → 主会话自己干**(行为与现在完全一致)。
- **子 agent 不碰 workflow 游标**:它干完交回,由**主 agent** 跑 `withy next` 推进。游标始终在主 agent 手里。
- **一节点一 agent**:不支持"一个子 agent 跨多个节点"。若两步该由同一个脑子连着干,就在 workflow 里建成**一个节点**;实现内部的迭代(写→自测→修)是子 agent 的内部循环,不是它走过的多个节点。

### 3.2 主 agent 负责派遣 + 提供必读上下文(以指针,不以内容)

- 主 agent 出两样:**这次的具体指派**(实例范围,如"实现 checklist 第 3–4 项"/"review `src/auth/**` 的改动")+ **必读上下文清单**。
- "提供上下文" = 提供**清单/指针**(读哪些知识 id、哪些产物),**绝不把正文读进来再转发**——否则主上下文被污染,隔离目的落空。子 agent 拿到清单自己读。

### 3.3 派遣机制(不新增命令)

不新增命令、也不改 `task status`,而是由 **`withy next` 推进到「配了 agent 的节点」时的接力 JSON 直接吐 `dispatch` 块**(见 design.md §2),主 agent 在正确时机(就近、节点条件触发)拿到触发 + 检查 + 操作提示。dispatch 块只含:

- `role`:派哪个角色。
- `activeTask`:子 agent 的定位锚点(`Active task: <路径>`,对齐 Trellis)。
- `curated`:core 现读 dispatch.json 算的派遣前检查(`read` 非空与否)。
- `action`:一行固定英文操作提示(派、检查、回传后 note+next、别回读子 agent 文件、blocked 不推进)。

主 agent 实际写给子 agent 的派遣 prompt 只有两段:`Active task: <activeTask>` + **本次实例范围**(干哪几个 checklist 项 / review 哪片);**行为、回传契约、prelude 都不写进 prompt**——派该角色时平台自动加载它的角色定义当系统提示。

单一事实源:dispatch 块给"触发+检查+操作"(core 现算),角色定义正文给"行为+回传契约"(spawn 自动加载),**skill 正文不提 agent/dispatch**(派不派是节点动态配的,skill 静态共用焊不进去)。

### 3.4 dispatch.json(扁平任务级清单)取代 context.json

- **扁平、不分角色**:`.withy/tasks/<id>/dispatch.json` = `{ "read": [{id|artifact, description}], "_help": "..." }`。所有被派的子 agent 共读这一份。
- **`description` 是文档梗概**(讲这文档大概是什么),不是"为什么必读";子 agent 扫梗概**自判**要不要细读,**读多了也没关系**(指针级、不污染),省掉 per-role 定向。
- **内容只放稳定规范**:知识 **id** + 任务产物名;**禁止代码路径**——代码子 agent 现读。实例范围走派遣 prompt。
- **子 agent 直接 `Read` 这份文件**(纯文件读,守边界 2),**不再有 `task status --role`、不分片、不隔离**。
- **种壳 = core 在任务创建时做**:core 读 workflow 文件(有整张图),只要有节点配 `agent` 就种 `_help` 壳;web 给节点新加 agent 时 core 幂等懒补。**curate(填 `read`)由主 agent 在执行期按需做**(`action` 就近提示),不填走 design.md 兜底;要硬性强制挂可选门禁。

### 3.5 context.json 删除,三个关注点各归各家

| 原 context.json 承担 | 新归宿 |
| --- | --- |
| session-start 可配文案 | `.withy/guide.md`(web 可编辑,复用 markdown 编辑器) |
| 全局常驻标准 | 知识条目 `injectByDefault`(**当前未被消费,本任务新建聚合**) |
| 每任务派遣必读规范 | 扁平 `dispatch.json`(主 agent 执行期按需 curate) |

静态 `context.json` 文件、schema、`readContextConfig`、其 knowledge lint,以及 `resolvePlannedContext` 的 context.json 依赖**移除**(具体迁移见 design.md)。

### 3.6 回传契约(命门)

- 子 agent 干完**只回一段紧凑结构化摘要**:`status`(done/blocked)、一句话总结、动了哪些文件/产物、blocker(若卡住)。规格写在角色定义正文里。
- 主 agent 收到后**只做三件**:转述摘要给用户 → 用 `withy note` 记一条(进 events.jsonl,审计可见)→ 跑 `withy next` 让 `gate.checks` 真正验收。**绝不回头把子 agent 改过的文件重新读进主上下文**。
- 限制如实写明:回传是约定、软的(平台返回值 Withy 插不了手),牙齿在角色定义 + skill 正文写得够死,以及产出门禁兜底。

### 3.7 子 agent 角色定义 + 跨工具投递(已查证三家格式)

- canonical 角色定义落 **`.agents/agents/<role>.md`**(单 Markdown 文件,和 skill 同一个 `.agents/` 提交家,随仓库提交)。frontmatter 保持跨工具中性最小集(`name`/`description`/可选 `model`),正文 = 角色提示 + prelude + 回传契约。
- 投递按**目标工具的格式**分路,格式驱动(MVP 两家):
  - **Claude `.claude/agents/<role>.md`**:md+frontmatter,**文件级软链**到 canonical。
  - **Codex `.codex/agents/<role>.toml`**:TOML,从 canonical **转换生成**(md 软链不了 toml)。
  - 之后接别的工具(如 Cursor,也是 md)= 加一条 registry 复用 markdown 投递;全新格式 = 加一个 format handler。**本期不做 Cursor**。
- **投递逻辑放 core**(不放 cli configurator):web 管 agent 也要真正投递,而 web 经 core;cli + web 共用 core 的投递。
- MVP 预置三角色:**implement / review / research**(finish 复用 review/check 的清单);覆盖 Claude + Codex 两家。

### 3.8 curation 门禁(可选,opt-in)

- 可在**声明了 agent 的节点**上加一道可选门禁:`dispatch.json.read` 需有 ≥1 条真条目(只有 `_help` 不算)。
- **默认 workflow 不强制开**;它是 per-node、可选的 gate(与 Withy 现有"所有 gate 可选"一致)。不派子 agent 的流程没清单、也就没这道坎,绝不会平白卡住。
- 它是"硬性强制 curation"的牙(派遣前软检查在 dispatch 块的 `curated` 字段,这道门禁在节点出口兜底拦);实现是一个小 checker,归入现有 gate checker 扩展点(`CHECKERS` + `GateContext`)。

---

## 4. 要做的内容(任务范围)

### 4.1 底层派遣能力(core + cli + 模板)

- 节点 schema 增加可选 `agent` 字段;validate 校验(agent 名能解析到角色定义,解析不到 → warning,经 validate 的 `agentExists` 回调,对齐 skill 悬空处理)。
- 角色定义机制:canonical `.agents/agents/<role>.md`(单 md)+ registry 每平台 `agentDef{target,format}`(MVP claude/codex,格式驱动可扩展)+ **core 投递**(md 文件级软链 / toml 生成)+ discoverAgents/resolveAgentRef/getAgentDeliveryStatus + 模板树预置三角色。
- **扁平 `dispatch.json`**(`{read:[{id|artifact,description}],_help}`):schema、core 任务创建时种 `_help` 壳(workflow 有 agent 节点时)+ 幂等懒补;**不改 task status、无 `--role`**,子 agent 直接 Read。
- 角色定义正文写行为 + 回传契约(含 blocked 不推进)+ prelude(Read dispatch.json + design.md);**skill 正文不提 agent/dispatch**。
- `next`/`task status` 接力 JSON 在节点带 `agent` 时补 `dispatch` 块(`role + activeTask + curated + action`,无 seedTemplate/hint/manifest)。
- 可选 curation 门禁 checker(查 `dispatch.json.read` 非空)。
- `context.json` 移除(schema/读取/lint)+ `resolvePlannedContext` 调整(留 guide、**新建 injectByDefault 聚合**、删 default/node);init 不再写 context.json。

### 4.2 节点 agent 配置开放 + web 可视化

- workflow 画布的节点配置面板:skill 节点新增 **agent 选择器**(可选,下拉来自已发现的角色定义 + "无")。保存进节点 `agent` 字段。
- 校验与 skill 一致(悬空角色 → warning 不拦)。

### 4.3 web 注入管理页(按草图重构)

外层保留(左 project 栏 + 顶部 different-tool 切换),把原 `/p/context` 扩成一个**带内层功能面板**的管理页:

- 内层左侧功能导航:`context` / `agents` / …(可扩展 `other`)。
- 内层右侧 = 选中功能的内容区。
- **context 功能** → 编辑 `.withy/guide.md`(复用知识库已有的 markdown 编辑界面;读写经 core)。
- **agents 功能** → 创建/管理子 agent:列出角色、新建/编辑角色定义正文(落 canonical `.agents/agents/<role>.md`)、显示投递到了哪些工具(Claude 软链态、Codex 生成态)、增删角色。
- 顶部 different-tool 切换:用于在不同工具(codex/claude)视角间切(展示该工具识别到的 agents/软链状态)。
- 其余内容可自由设计(见 design.md 的 web 细化);至少把 context、agents 两个功能做出来。

### 4.4 设计文档同步

更新 harness/core/web/knowledge-base/status/cli 对应章节(清单见 design.md §"需改动的设计文档"),使持久设计与本结论一致(本任务规划阶段已先行更新一版,实现阶段按落地情况再校准 status)。

---

## 5. 范围外(本任务不做)

- Claude PreToolUse 的 push 注入(子 agent prompt 自动改写)——后置 P1+,MVP 走 pull(派遣 prompt 规范)。
- per-turn breadcrumb(inject-workflow-state)相关改动。
- 给子 agent 新增任何"读状态"命令。
- 子 agent 进程托管 / run 模式。
- 一个子 agent 跨多节点。
- worktree 并行。

---

## 6. 验收口径

1. **节点配置**:能在 workflow.json(及 web 画布)给某 skill 节点配 `agent`;不配的节点行为不变;配了悬空角色给 warning 不拦。
2. **派遣闭环(交互演示)**:主 agent 在配了 agent 的节点上,按 `withy next` 吐的 dispatch 块(`role/activeTask/curated/action`)拉起子 agent;子 agent `Read .withy/tasks/<id>/dispatch.json` + `design.md` 拿必读(按 description 自判)+ 实例指派,干完回传紧凑摘要,主 agent `withy note` + `withy next` 推进;全程主 agent 没有把子 agent 工作文件重读进上下文。
3. **dispatch.json 取代 context.json**:context.json(schema/读取/lint)不再被读;guide.md 经 web 可编辑并在 session-start 注入;全局常驻走**新建的 injectByDefault 聚合**;扁平 `dispatch.json`(`read` 清单)由子 agent 直接 Read,dispatch 块的 `curated` 反映其状态;**无 `--role`**。
4. **不派子 agent 的流程不被卡**:无 agent 声明的 workflow 跑通,无 dispatch.json、无相关门禁。
5. **web**:注入管理页内层 context(编辑 guide.md,经新 guide API)与 agents(增删改角色 + 投递可见)两功能可用;角色定义落 canonical `.agents/agents/<role>.md`,Claude 软链、Codex 生成 toml 到各工具目录(投递经 core)。
6. **校验三件套**:`pnpm typecheck` / `pnpm lint`(0 warning)/ 相关包 build 通过;改动文件相关测试通过。
7. web 行为变化用 `agent-browser` 走真实流程验证。

---

## 7. 微决策状态

本会话(grill)已拍定的结构决策(写进 design.md,不再是开放项):

- **canonical 角色定义** = `.agents/agents/<role>.md` 单 Markdown 文件(非 `.withy/agents/`、非目录)。
- **跨工具投递** = Claude 文件级软链 + Codex md→toml 生成;投递逻辑在 core;**格式驱动**,之后接别的工具(Cursor 等,本期不做)= 加 registry 条目 / format handler,不动主流程。
- **dispatch.json 扁平化** = 一份 `{read:[{id|artifact,description}],_help}`,不分角色、无 `--role`,子 agent 直接 Read;`description` 写文档梗概由子 agent 自判细读、读多了无妨。
- **派遣前检查** = dispatch 块的 `curated` 字段(core 现读 dispatch.json 算),Withy 原生、跨工具、无需平台钩子;硬性强制走可选出口门禁。PreToolUse 硬拦留 P1(Claude 专属,§5 已排除)。
- **种壳时机** = core 在 task start 即种(它有 workflow 文件)+ 后加角色幂等懒补;curate 由主 agent 执行期按需做,不改 brainstorm/grill-me。

仍开放、非阻塞(design.md 已给推荐,实现会话落地时定):

- curation 门禁是否进默认 workflow(推荐不进,做成 opt-in)。
- md 平台软链 vs 拷贝的缺省(跟随现有 skill 的 link/copy 设置)。
- `description` 是否对知识 id 自动取知识条目 summary 回填(推荐可做,降 curate 成本;artifact 仍手写)。
