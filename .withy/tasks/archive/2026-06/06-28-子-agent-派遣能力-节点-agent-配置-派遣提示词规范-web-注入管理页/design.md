# 技术设计:子 agent 派遣能力 + 节点 agent 配置 + web 注入管理页

> 配合 `prd.md` 读。本文给数据结构、流程、改动落点、需更新的设计文档清单。
> 事实源仍以 [[core]]/[[cli]]/[[harness]]/[[web]]/[[knowledge-base]] 为准;本文是本次改动的技术规格。

---

## 1. 数据结构改动

### 1.1 节点新增可选 `agent` 字段(core §4.3)

skill 节点增加一个可选字段:

```jsonc
{
  "id": "check",
  "type": "skill",
  "skill": "withy-check",
  "agent": "review",            // 新增:可选;声明本步由该角色子 agent 执行;省略=主会话自己干
  "phase": "execute",
  "next": "wrapup",
  "gate": { "checks": ["pnpm test"] }
}
```

- 字段:`agent?: string`,值是角色名(对应 canonical `.agents/agents/<role>.md`)。
- 仅 `type:skill` 适用;switch 节点无 `agent`。
- zod schema 增可选字段;`validate` 期解析 agent 名,**解析不到 → warning(不拦)**,与 skill 悬空处理一致(harness §5、web §3.3 保存校验)。
- 接力 JSON(`describeNext`)在节点带 `agent` 时,除带出 `agent` 外,**渲染一个 `dispatch` 块**告诉主 agent「这步要派 + 怎么派」(见 §2.1)。

### 1.2 dispatch.json(扁平任务级清单;取代 context.json)

放任务目录 `.withy/tasks/<id>/dispatch.json`,**一份扁平清单**(不按角色分键),所有被派的子 agent 共读这一份:

```jsonc
// .withy/tasks/<id>/dispatch.json
{
  "read": [
    { "id": "api-conventions", "description": "接口/命名/导出风格规范的梗概" },  // 引用知识条目 id
    { "artifact": "design.md", "description": "本任务的技术设计梗概" }            // 引用任务内产物名
  ],
  "_help": "填 read:[{id|artifact, description}];description 写文档梗概,子 agent 据梗概自判要不要细读。只放知识/规范/产物,别放代码路径(代码由子 agent 实现时现读)。跑 `withy knowledge index` 看可用知识。"
}
```

种壳(任务创建时,只有 `_help`):

```jsonc
{ "_help": "填 read:[{id|artifact, description}];description 写文档梗概,子 agent 据梗概自判要不要细读。只放知识/规范/产物,别放代码路径。" }
```

约束:

- 条目两种:`{id, description}` 引用知识条目;`{artifact, description}` 引用任务产物名。
- **`description` 是文档梗概**(讲这文档/知识大概是什么),不是"为什么必读"。子 agent 扫一遍 description,自己判断哪条要细读——**读多了也没关系**(指针级清单,不构成污染);这也免去 per-role 定向。
- **扁平、不分角色**:一份 `dispatch.json`,不再按角色分键。所有被派子 agent 读同一份。
- **子 agent 直接 `Read` 这份文件**(纯文件读,不调 withy 命令,守 prd 边界 2);**不再有 `task status --role`**。
- **禁止代码路径**;实例范围走派遣 prompt。`_help` 键非清单项,消费/门禁都忽略。
- 种壳时机:**core 在任务创建时读 workflow 文件**(core 有整张图,不受主 agent 流程暴露节奏约束),只要有任一节点配了 `agent` 就种 `_help` 壳;之后 web 给节点新加 agent 时,core 在 relay 计算/门禁处**幂等懒补**壳(没壳就补)。
- 知识 id 校验:子 agent 读时若某 `id` 解析不到知识条目,无所谓(它按 description 判断、读不到就跳过);不做全局 dispatch lint(原 context.json 的 knowledge lint 随 context.json 一并移除,见 §1.3)。

### 1.3 context.json 移除

仓库现状(核实后):`context.json` 的 schema 在 `core/src/types.ts`(`ContextConfigSchema`,只有 `default` + `nodes` 两层,**无 role 层**);`readContextConfig` 在 `core/src/store/meta.ts`;`resolvePlannedContext` 在 `core/src/session/context.ts`(合并 default+node、去重,**目前只读 context.json**)。**唯一消费方是 session-start**(`core/src/session/hook.ts` 调 `resolvePlannedContext`);web 的 Context 页**当前是空壳(EmptyState,待实现)**,并未消费 `resolvePlannedContext`——design 早先"session-start 与 web 注入对比共用"的说法不成立,据此修正。

- core 的 `context.json` schema、`readContextConfig`、`resolvePlannedContext` 里读 context.json 的分支删除/重构。
- **`injectByDefault` 聚合是净新增**:`KnowledgeEntry.injectByDefault` / `KnowledgePage.injectByDefault` 这两个布尔元数据**已存在但当前没人消费**(`resolvePlannedContext` 不读它)。所以"session-start = guide + injectByDefault + 派生态"里的 injectByDefault 这一层**要新建**(扫知识条目取 `injectByDefault:true` 的,按 mode 注入),不是"保留现有能力"。
- `resolvePlannedContext` 职责拆解:
  - **session-start 注入** = guide.md(全文,已实现)+ **新建的全局 `injectByDefault` 聚合**(索引/正文)+ 派生态(git/workflow/task-status)。**节点级"必读"从 session-start 注入中剥离**,改由派遣场景的 dispatch.json 承担。
  - 即:session-start 给主 agent 的是"开场 + 全局常驻 + 当前态";"派遣时该读哪些规范"交给扁平 dispatch.json(子 agent 直接 Read)。
- **context.json 的 lint 一并移除**:`core/src/knowledge/lint.ts` 现在对 context.json 的 required/optional id 做悬空校验(**error 级**);context.json 删除后这段 lint 删掉(dispatch.json 不做悬空 lint,子 agent 按 description 自判,见 §1.2)。
- 迁移:`init` 现在会写空 `context.json`(`cli/src/installation/init.ts`),改为**不再写**;`cli/tests/installation/managed-templates.test.ts` 已断言 context.json 不是 managed 模板,移除 init 写入后据实调整相关测试;已有 `.withy/context.json` 文件忽略即可(不强制删,本仓的就是空默认值)。`PlannedEntry`/相关测试调整。

> ⚠️ 兼容性:context.json 的**节点级注入**能力被丢弃(原 `nodes[nodeId].required` 那套)。等价行为现在分两路:全局常驻走 `injectByDefault`,每任务派遣必读走扁平 dispatch.json。本仓 context.json 是空默认值,无实际迁移负担。

---

## 2. 派遣机制(无新命令;由 `withy next` 在派遣节点吐出)

派遣**由 `withy next` 的接力 JSON 在推进到「配了 agent 的节点」时输出**——主 agent 在正确时机(就近、节点条件触发)直接拿到触发信号 + 操作提示 + curation 检查,不靠记忆、不靠翻 skill 正文。

### 2.1 dispatch 块(relay 在派遣节点上补)

`withy next`(及 `task status`)推进/停在带 `agent` 的 skill 节点时,relay JSON 多带一个 `dispatch` 块:

```jsonc
{ "ok": true, "done": "dev",
  "next": {
    "node": "check", "type": "skill", "skill": "withy-check", "agent": "review",
    "dispatch": {
      "role": "review",
      "activeTask": ".withy/tasks/<id>/",
      "curated": false,
      "action": "Dispatch the `review` subagent for this step: prompt it with the Active task path + the concrete scope to review. If `curated` is false and this step needs task-specific reading, first fill `.withy/tasks/<id>/dispatch.json`'s `read` list. On its compact summary: `withy note`, then `withy next`. Don't re-read its working files; if it returns blocked, don't advance."
    }
  } }
```

- `role`:派哪个角色的子 agent(取自 `node.agent`)。
- `activeTask`:子 agent 的定位锚点(对齐 Trellis「Active task: <path>」),主 agent spawn 时带给子 agent。
- `curated`:**core 现读 dispatch.json 算出的检查结果**——`read` 非空为 true,空(或只有 `_help`)为 false。这是**派遣前的检查点**(§2.3),主 agent spawn 前就看到。
- `action`:一行固定英文操作提示(与现有 `nextAction` 同类,core 既有就吐英文操作串)。它是"就近、按节点条件出现"的提示,解决"开头规则被长上下文消解"——这是 relay 唯一适合承载操作提示的理由(skill 静态焊不死、session-start 太早被消解)。

> 实现落点:`describeNext` 现签名 `(wf, state)`(`core/src/workflow/interpret.ts`),`NextStep` 无 `dispatch`/`agent`。dispatch 块需 `role`(取自 `node.agent`)+ `activeTask`(taskId 拼路径)+ `curated`(读 dispatch.json 现算)。两种接法:① 给 `describeNext` 增 `taskId`/`scope` 现拼;② 保持纯函数,由调用侧(`task status` 的 `runStatus`、`next` 的 `nextNode`,都已持有 taskId/scope)在 relay 上补 dispatch 块。推荐 ②。`action` 是固定串模板,`curated` 是唯一需要读盘的字段。

### 2.2 单一事实源:relay 触发+检查,角色定义管行为,skill 不提派遣

避免规范两处漂移,职责切开:

- **relay 的 dispatch 块**(core 现算)= 主 agent 的**触发器 + curation 检查 + 一行操作提示**(`role`/`activeTask`/`curated`/`action`)。
- **角色定义正文**(子 agent 自己的系统提示,spawn 时自动加载)= 子 agent 的**行为 + 回传契约**:你是谁、开头 `Read .withy/tasks/<id>/dispatch.json` + `design.md` 拿必读、按 description 自判细读、自豁免(不再递归派同类)、回传 `{status,summary,touched[],blockers[]}`。
- **skill 正文不提 agent/dispatch**:派不派是节点动态配的(web 画布可改),skill 静态共用,焊不进去。"怎么消费 dispatch 块"由 relay 的 `action` 就近承载。

于是:relay 给"现在派谁+检查+怎么做",角色定义给"子 agent 怎么行为",两边不重复。主 agent 的派遣 prompt 只需 `Active task: <activeTask>` + 本次实例范围(它自己定);行为契约不写进 prompt——派该角色时平台自动加载角色定义当系统提示。

### 2.3 子 agent 取上下文:直接 Read,不分角色、不加命令

子 agent 开头 `Read .withy/tasks/<id>/dispatch.json`(扁平 `read` 清单)+ `design.md`,按每条 `description` 梗概自判要不要细读其中的知识/产物。

- **不再有 `task status --role`**:扁平清单无需切片,子 agent 纯文件读即可,**守 prd 边界 2(子 agent 不调 withy 命令)**——之前 `--role` 版其实破了这条。
- 必读是**指针**(`read` 里的 id/产物 + 梗概),子 agent 自展开读;读多了无妨(指针级、不污染)。
- 代码不在清单里,子 agent 按 design.md + 实例指派现读。
- **curation 缺失不卡**:dispatch.json 只有 `_help`(`curated:false`)→ 子 agent 仍读 design.md/prd.md 兜底,不报错。`curated` 检查在 §2.1 的 dispatch 块给主 agent,主 agent 视需要在派遣前补 `read`;要硬性强制则挂可选 curation 门禁(§5)。

---

## 3. 回传契约

- 形状:`{ status, summary, touched[], blockers[] }`(见上),写死在角色定义正文。
- 主 agent 收到 → 转述 summary + `withy note "<reviewer: ...>"` + `withy next`。
- **status=blocked 时主 agent 不推进**:转述 blockers、记 `withy note`,但**不跑 `withy next`**(`gate.checks` 本来也会拦);主 agent 据 blocker 决定重新派遣 / 自己补 / 回头问用户,而不是硬推游标。status=done 才走 `withy next`。
- `withy next` 的 `gate.checks` 才是真正验收;回传摘要不进门禁、不被信任为放行依据。
- 软性限制如实写进角色定义与 skill:摘要要短,主 agent 不得回读子 agent 工作文件。

---

## 4. 角色定义 canonical + 跨工具投递(格式驱动,可扩展)

**MVP 只实现 Claude + Codex 两家**;投递层按"格式驱动"设计,之后接入别的 agent 工具只是**加一条 registry 条目**(若是已支持的格式)或**再加一个 format handler**(全新格式),不改主流程。这是本节的核心可扩展性要求。

各工具子 agent 定义格式(2026 查证):**Claude** `.claude/agents/<role>.md`(md+frontmatter,正文=系统提示)、**Codex** `.codex/agents/<role>.toml`(TOML,必填 `name`/`description`/`developer_instructions`)。扩展样例(本期不做):**Cursor** `.cursor/agents/<role>.md`(同为 md+frontmatter,字段略异但都容忍未知键)——它复用 markdown handler,将来加一条 registry 即可。结论:**md 格式能软链共用一份 canonical;TOML 软链不了,从 canonical 转换生成**。

### 4.1 canonical:单 Markdown 文件

- canonical 角色定义:**`.agents/agents/<role>.md`**——单文件、和 skill 同一个 `.agents/` 提交家(skill 是 `.agents/skills/<skill>/SKILL.md`)。选单文件而非目录,因为 Claude/Cursor 原生就是单 md、最利于直接文件软链。
- frontmatter 保持**最小且跨工具中性**:`name`、`description`、可选 `model`。Claude 特有键(`tools`)、Cursor 特有键(`readonly`/`is_background`)都不写进 canonical——两家都容忍缺失/未知键,各自取默认。正文 = 角色提示 + prelude(`Read .withy/tasks/<id>/dispatch.json` + `design.md`)+ 回传契约。
- `.agents/` 已提交、不在 `.withy/.gitignore` 内;`.agents/agents/` 随之提交,无需额外 gitignore 改动。

### 4.2 格式驱动的投递(投递逻辑放 **core**,cli + web 共用)

> ⚠️ 边界修正:web 管 agent 要**真正投递到各工具目录**,而 web 经 core、够不着 cli 的 configurator。所以投递逻辑(软链 md / 生成 toml)**落在 core**(如 `core/src/agents/deploy.ts`),cli 的 configurator 与 web 的 agents API **都调 core 这一处**。skill 的 `linkSkills` 现住在 `cli/configurators/shared.ts`(install 时才跑、web 不需要),agent 投递不同,必须 core 化。

registry 每平台增一个可选 `agentDef` 描述符,投递策略由 `format` 驱动;**format handler 是一个小注册表**(`markdown` → 文件级软链、`toml` → md 转换生成),新格式 = 加一个 handler,平台只声明用哪个 format:

```ts
// AGENT_PLATFORMS 每平台增(可选)agentDef —— MVP 两家:
claude:  { ..., agentDef: { target: '.claude/agents', format: 'markdown' } }
codex:   { ..., agentDef: { target: '.codex/agents',  format: 'toml' } }
// 扩展示例(本期不写):md 工具复用 markdown handler,只加一条 ——
// cursor: { ..., agentDef: { target: '.cursor/agents', format: 'markdown' } }
```

| 平台 | format | 投递 | 机制 |
| --- | --- | --- | --- |
| Claude | markdown | **文件级软链** `.claude/agents/<role>.md` → canonical | 新增**文件级** link helper(现有 `linkSkills` 是**目录级** `symlinkSync(...,'dir')`,不能直接复用) |
| Codex | toml | **生成** `.codex/agents/<role>.toml` | 读 canonical frontmatter(`name`/`description`)+ 正文(→`developer_instructions`),写 toml;跟随 init/保存重新生成(非软链) |

- **MVP 不动 registry 平台清单之外的东西**:Claude 已有完整平台条目,只给它 + Codex 各加 `agentDef`;不新增 Cursor 平台。
- format handler 注册表是扩展点:`markdown`/`toml` 两个 handler 覆盖当前两家;将来某工具用新格式(如某种 yaml),加一个 handler + 平台 `agentDef.format` 指过去即可,主投递流程不变。
- 软链/拷贝缺省跟随 init 的 link/copy 设置(md 平台);Codex 恒为生成(toml 无软链语义)。
- 投递幂等:已存在且指向同源的软链跳过;canonical 变了重新生成 toml(对齐现有 `linkSkills` 幂等思路)。

### 4.3 模板预置三角色

`templates/common/agents/<role>.md`(单文件,canonical 源)三个:**implement / review / research**。init 时铺到 `.agents/agents/`,再由 §4.2 投递到各工具目录。

角色定义正文原则:**只写"你是谁、开头 `Read .withy/tasks/<id>/dispatch.json` + `design.md` 拿必读(按 description 自判细读)、自豁免、回传 `{status,summary,touched[],blockers[]}`",具体做法引用同名 skill**(避免与 skill 内容重复,prd 边界 4)。implement 引用 `withy-dev`、review 引用 `withy-check`(finish 复用 check 清单)、research 偏调研产出。

### 4.4 discoverAgents / resolveAgentRef / agentExists(core)

- `discoverAgents(scope)`:类比 `discoverSkills`,扫 canonical `.agents/agents/*.md` + 各平台 `agentDef.target` 目录,去重返回角色列表(`{name, description?, source, deliveredTo[]}`),供 web agent 选择器 + 节点 `agent` 字段校验。
- **悬空校验走 validate 层,不是 resolve 层**(查证后修正):skill 的 `resolveSkillRef` 解析不到是**抛错**;"warning 不拦"实际由 `validate.ts` 经 `ctx.skillExists` 回调产出(`level:'warning'`)。所以 agent 同构:validate ctx 增 `agentExists` 回调,节点 `agent` 解析不到 → warning(不拦),与 skill 悬空同路。
- `getAgentDeliveryStatus(scope, role)`:报告某角色在各工具的投递态(已链/已生成/缺失/过期),供 web different-tool 视图。

---

## 5. curation 门禁 checker(可选)

- 新增 gate 字段(如 `curated: true` 或复用既有扩展点),checker 读 `dispatch.json.read`,要求 ≥1 条带 `id`/`artifact` 的真条目(`_help` 忽略)。
- 归入 `workflow/gate.ts` 的 checker 注册表(现有 checker 范式:`artifactsChecker`/`checksChecker`/...,push 进 `CHECKERS` + `GateContext` 注入对应 IO)。
- **默认 workflow 不挂**;opt-in。只在声明了 `agent` 的节点上有意义。它是"硬性强制 curation"的那道牙(派遣前软检查在 §2.1 的 `curated` 字段;这道门禁在节点出口兜底拦)。

---

## 6. Web:注入管理页重构

### 6.1 结构(按草图)

```text
┌───────────────────────────────────────────────────────────┐
│  顶部:different-tool 切换(codex / claude / …)              │  ← 已有顶部区,复用
├──────────┬────────────────────────────────────────────────┤
│ project  │  内层功能导航      内层内容区                     │
│ 列表/切换 │  ┌─────────┐      ┌──────────────────────────┐  │
│ (复用)    │  │ context │ ───► │ 编辑 .withy/guide.md       │  │
│          │  │ agents  │ ───► │ 管理子 agent(角色 CRUD)   │  │
│          │  │ …other  │      │ …                          │  │
│          │  └─────────┘      └──────────────────────────┘  │
└──────────┴────────────────────────────────────────────────┘
```

- 外层(project 栏 + different-tool 顶部)保留现有布局。
- 内层 = 功能导航(左)+ 内容区(右);把原 `/p/context` 注入编排器并入此页作为其中一项(或保留为 `other`)。

### 6.2 context 功能 → 编辑 guide.md

- 读写 `.withy/guide.md`:core 现有 `readGuide`,**缺 `writeGuide`,需新增**。
- **复用编辑器组件,不复用保存接口**:知识库的 `MarkdownEditor`(Milkdown/Crepe,`appTemplates/Knowledge/components/MarkdownEditor.tsx`)是组件级可复用;但它的保存走 `/api/knowledge/save`(写在 `.withy/knowledge/` 下),而 guide.md 在 `.withy/guide.md`,**路径根不同**,不能复用该接口。
- 新增 API:`GET|PUT /api/guide?project`(经 core `readGuide`/`writeGuide`)。编辑器组件挂这个新接口。

### 6.3 agents 功能 → 管理子 agent

- 列出角色(`discoverAgents`):名称、描述、投递到了哪些工具(`getAgentDeliveryStatus`:已链/已生成/缺失)、是 canonical 还是某工具特有。
- 新建/编辑角色:编辑 canonical 正文(md + 最小 frontmatter),保存落 `.agents/agents/<role>.md`,**保存后调 core 的投递(§4.2)**重新软链/生成到所选工具目录。
- 删除角色:删 canonical + 解除各工具软链 / 删生成的 toml。
- different-tool 顶部切换:展示该工具识别到的 agents / 投递状态(哪些已链/已生成、哪些缺)。
- API:`GET /api/agents?project`(列表)、`GET|PUT|DELETE /api/agents/:role?project`(增删改 + 触发 core 投递)。**投递经 core**(§4.2),web 不碰 cli configurator。
- 自由发挥的展示项(建议):每个角色显示它引用的 skill、被哪些 workflow 节点 `agent` 引用(反查),便于看"这个角色用在哪"。

### 6.4 节点 agent 配置(画布,web §3.3)

- skill 节点配置面板新增 **agent 选择器**(可选下拉:无 + `discoverAgents` 结果)。
- 保存写节点 `agent` 字段;悬空角色保存时 warning 不拦(对齐 skill 悬空)。
- **workflow PUT 校验要补 `agentExists` 回调**:现 `app/api/workflows/[id]/route.ts` 的 `validateWorkflow` 只传 `skillExists`;加 `agentExists`(经 `discoverAgents`),悬空 agent 才会产出 warning(error 才拦,warning 放行)。

---

## 7. 需改动的设计文档(知识库 wiki/design)

实现会话落地后按实际校准;本任务规划阶段先更新一版,使持久设计与结论一致:

| 文档 | 章节 | 改动 |
| --- | --- | --- |
| harness.md | §4 内容流转 | context.json → dispatch.json/guide.md/injectByDefault 三分;派遣清单流转;**injectByDefault 聚合是新建层** |
| harness.md | §7 子 agent 约定 | 重写:节点 `agent` 字段、派遣提示词规范、回传契约(含 blocked 不推进)、不新增命令、一节点一 agent |
| harness.md | §6.6 inject-subagent-context | MVP 走 pull(派遣 prompt 规范);push 后置 |
| core.md | §4.3 节点 schema | 增 `agent?` 字段 + 字段表 |
| core.md | §4.5 context.json | 替换为 `dispatch.json`(扁平 `read` 清单)模型;**context.json schema/readContextConfig/lint 移除** |
| core.md | §2.2 项目根文件 | context.json 行删(任务内改扁平 `dispatch.json`)+ 增 canonical `.agents/agents/<role>.md` + 各工具 agentDef 投递目录 |
| core.md | §5 Store API | 增 discoverAgents/resolveAgentRef/agentExists/getAgentDeliveryStatus/writeGuide/dispatch.json 读写/**agent 投递(deploy:md 软链 / toml 生成,core 化)**/**injectByDefault 聚合** |
| cli.md | §3.1 / §6 / §7 | `task status` / `next` 在派遣节点补 dispatch 块(`role/activeTask/curated/action`);configurator agents 投递改调 core deploy;写出文件增 canonical `.agents/agents/`、各工具 agentDef 目录、`dispatch.json`;**init 不再写 context.json**(不新增命令、无 `--role`) |
| knowledge-base.md | §7 注入接入 | context.json 删除;**injectByDefault 新建为全局常驻聚合**;扁平 dispatch.json 承担派遣必读;context.json 的 knowledge lint 移除 |
| web.md | §3 页面 | `/p/context` 重构为注入管理页(内层 context/agents);§3.3 节点 agent 选择器 + PUT 校验补 agentExists;§4 API 增 guide/agents(投递经 core) |
| status.md | 各域 | 增本批待办行(H/C/K/W) + **registry claude/codex 各加 agentDef + format handler 注册表(可扩展)** |

> 已有 `.withy/knowledge/wiki/design/decisions.md` 被删(git status 显示 D),设计决策散在各页;本任务的决策记录就放本 design.md + 各页更新,不复活 decisions.md。

---

## 8. 实现顺序建议(给实现会话)

1. **core 地基**:节点 `agent` schema + validate(`agentExists` 回调,悬空 warning);canonical `.agents/agents/<role>.md` + registry claude/codex 各加 `agentDef{target,format}` + discoverAgents/resolveAgentRef;**扁平 `dispatch.json`** schema(`{read:[{id|artifact,description}],_help}`)+ core 种壳(workflow 有 agent 节点时)+ 幂等懒补。
2. **agent 投递(core)**:`core/agents/deploy.ts`——md 平台文件级软链、Codex md→toml 生成、幂等;`getAgentDeliveryStatus`。供 cli + web 共用。
3. **context.json 移除 + injectByDefault 新建**:`resolvePlannedContext` 重构(留 guide,**新建 injectByDefault 聚合**,删 default/node);删 context.json schema/readContextConfig/lint;init 不再写 context.json;测试调整。
4. **dispatch 块(relay)**:`describeNext` 调用侧在带 `agent` 的节点补 `dispatch` 块(`role`/`activeTask`/`curated`(读 dispatch.json 现算)/`action` 固定英文串);子 agent 侧直接 Read dispatch.json,**不加 `--role`、不加命令**。
5. **configurator + 模板**:cli configurator 改调 core deploy(§4.2);`templates/common/agents/{implement,review,research}.md` 三角色单文件(prelude=Read dispatch.json+design.md)+ 模板树接线(铺到 `.agents/agents/`)。
6. **skill / 角色定义正文**:角色定义写行为 + 回传契约(含 blocked 不推进)+ prelude(Read dispatch.json);**skill 正文不提 agent/dispatch**(派遣靠 relay 的 action 就近承载)。
7. **(可选)curation 门禁 checker**:读 `dispatch.json.read` 非空,opt-in 挂派遣节点(出口兜底)。
8. **web**:注入管理页内层(context→guide.md 编辑用新 guide API、agents→角色 CRUD + core 投递);画布节点 agent 选择器 + PUT 校验补 agentExists;相关 API。
9. **验收**:校验三件套 + agent-browser 真实流程。

每步独立可验证;1–4 是其余的前置。

---

## 9. 附录:Trellis implement.jsonl 调研结论(参考来源)

调研自 `mindfold-ai/Trellis`(commit `01ec8d6`),供借鉴:

- **文件**:`.trellis/tasks/<id>/implement.jsonl` + `check.jsonl`,JSONL,每行 `{file, reason}` 或 `{file, type:"directory", reason}`;`_example` 种壳行(无 `file` → 消费者跳过)。
- **关键约束**:**只放 spec/research,禁放代码路径**(代码由子 agent 实现时现读)。← 我们照搬(改为按知识 id)。
- **生产者**:`task.py create` 种 `_example` 壳(仅检测到 subagent 平台时);**规划期(Phase 1.3)由 AI curate 真条目**,非派发时生成。
- **消费者**:两类平台——Class-1(Claude/Cursor 等)PreToolUse hook 注入子 agent prompt;Class-2(Codex 等)pull prelude 子 agent 自读。逻辑读序一致(jsonl → prd → design → implement)。
- **门禁**:issue #292 把 curation 变成 start gate(≥1 真条目),消费侧仍容错 fallback。← 我们做成 opt-in per-node + 派遣前软检查(`curated` 字段)。
- **借鉴**:清单只放规范/禁代码、种壳+自描述、curation 容错 fallback。
- **不搬**:十几平台双通路 + neutral 占位符、靠探测配置目录决定行为、`file`/`path` 双字段技术债、**按角色分桶/分文件**(我们最终用一份扁平清单,见下)。

我们相对 Trellis 的改良:**一份扁平 `dispatch.json`**(不分角色、不分文件;子 agent 直接 `Read`,不加命令、不切片——比 Trellis 多文件和我们中途想过的 `--role` 切片都简单)、**条目 `{id|artifact, description}` 里 description 是文档梗概**(子 agent 据梗概自判细读、读多了无妨,省掉 per-role 定向)、**按知识 id 引用(不裸路径)**(复用 Withy 知识索引)、**派遣前软检查走 relay 的 `curated` 字段**(Withy 原生、跨工具、无需平台钩子)、**实例范围走派遣 prompt 不进清单**。
