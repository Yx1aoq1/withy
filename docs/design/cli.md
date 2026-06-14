# CLI 设计

> 适用范围:`packages/cli`(`@tuteur/cli`,可执行名 `ttur`)。
> 定位:实施规格级。CLI 是用户与 agent 的稳定入口、确定性逻辑的调用方。**所有 `.tuteur/` 读写与门禁都委托 [@tuteur/core](./core.md),CLI 不自己碰盘。**
> 数据 schema 见 [core.md §4](./core.md#4-类型与校验);双层模型见 [core.md §2](./core.md#2-双层模型全局-vs-项目)。
> 先看 [INDEX.md](./INDEX.md) 的实现状态矩阵区分已实现/待实现。

---

## 1. 职责边界

| CLI 负责 | 委托给谁 |
| --- | --- |
| 命令解析、交互、参数校验 | —— |
| 初始化项目/全局结构、装 skill、配 agent | configurator 引擎(§8) |
| 读写数据、计算 phase/step、门禁判定 | **@tuteur/core**(store + domain) |
| hook 事件入口(`ttur hook <event>`) | core(context/state) |
| 模板更新冲突检测 | installation/managed-templates |

核心不变量:**agent 自称完成 ≠ 节点完成**,完成只由 `ttur complete <node>`(经 `core.completeNode`)判定。

---

## 2. 包结构与入口

```text
packages/cli/src/
  index.ts                # shebang 入口
  program.ts              # commander 装配
  harness/runtime.ts      # [已实现] CLI 侧公共:requireProjectScope/resolveTaskId/emit(JSON)/makeTaskId
  commands/
    index.ts              # 约定式动态加载器
    init.ts               # [已实现] 初始化(待扩展 --global)
    dashboard.ts          # [已实现] dashboard 进程管理
    uninstall.ts update.ts# [已实现] 卸载 / 模板更新
    task.ts               # [已实现] 任务命令族(create/list/status/start/assign/archive)
    complete.ts           # [已实现] 节点门禁(调 core.completeNode;--branch/--skip)
    rewind.ts             # [已实现] switch 回退(调 core.rewindTo)
    approve.ts            # [已实现] 人工确认(调 core.approveNode)
    hook.ts               # [已实现] 平台事件入口 session-start(§5.3)
  configurators/
    registry.ts           # [已实现] 行为表 PLATFORM_CONFIGURATORS + configureAgentPlatform 派发(数据从 @tuteur/core 引)
    shared.ts             # [已实现] copyAgentTemplates/resolveWorkflowSkills/writeSkills/linkSkills/copyCanonicalSkills/占位符
    codex.ts claude.ts gemini.ts  # [已实现] 每平台 configurator(拷模板树 + skill)
    index.ts              # [已实现] 聚合 re-export(类型/数据从 core)
  installation/
    init.ts               # initProject():调 core 建结构 + 装 skill + 配 agent
    managed-templates.ts  # 模板哈希追踪
  templates/              # 写入用户仓库的模板源(见 harness.md §6)

# 注:AGENT_PLATFORMS 数据 + agent 类型 + 公共 utils 已迁入 @tuteur/core(core §5.1、agents/、utils/)
```

### 2.1 约定式命令加载(已实现,保留)

`commands/index.ts` 扫描目录,每个文件默认导出 `(program)=>void|Promise<void>`,按字母序注册。**加命令 = 放一个文件**,不改 `program.ts`。新增 `task.ts`/`complete.ts`/`hook.ts` 即自动生效。

---

## 3. 命名常量

`constants/product.ts` 由产品名派生一切(`PRODUCT_DISPLAY_NAME`→`Tuteur`、`CLI_COMMAND_NAME`→`ttur`、`PROJECT_DIR_NAME`→`.tuteur`、`getBundledSkillName('dev')`→`tuteur-dev`、`getSlashCommandPrefix()`→`/tuteur:`)。**这些常量应迁入 core 或由 core 复导出,app 不再手抄**(消除 `app/product.ts` 重复,core.md K6)。

---

## 4. 已实现命令(保留,部分待扩展)

### 4.1 `ttur init`

参考 Trellis:**每个 agent 一个布尔 flag**(不用 `--agents codex,claude`);所有选择收敛成 [InitConfig](./core.md#8-initconfigcli-与-web-共用的初始化模型),三种输入(flag / 交互 / web 表单)同源产出,统一执行。

```text
ttur init [-y|--yes] [-u|--user <name>] [--global] [--copy]
          [--codex] [--claude] [--gemini] ...      # 每个 agent 一个 flag(由注册表派生)
```

| 选项 | 作用 |
| --- | --- |
| `--codex` / `--claude` / `--gemini` | 选中对应 agent;由 `AGENT_PLATFORMS` 注册表的 `cliFlag` 派生(§8) |
| `-y, --yes` | 用注册表 `defaultChecked` 的 agent,跳过交互;隐含冲突时 skip |
| `-u, --user <name>` | 本地身份;缺省取 `git config user.name`(同 Trellis) |
| `--global` | **写 `~/.tuteur/` 全局根**;全局只装 workflow 模板+config+projects,**不配 agent、不建 workspace 名册**(core.md §2.3 安全边界) |
| `--copy` | skill 写独立副本;缺省 `link`(软链共享)。取代冗长的 `--skill-mode` |

显式 flag > `-y` 默认 > 交互(三路优先级同 Trellis)。所有选项都映射到 InitConfig 字段,因此 `ttur init --codex --claude -u yan` 与交互、与 web 表单等价 —— web「初始化项目」按钮即 `spawn` 序列化出的这条命令(web.md §2.4)。

流程(项目模式):

```text
ttur init
  → 收集 InitConfig(flag 解析 / 交互问 INIT_QUESTIONS / web 表单,三选一)
  → initProject(config)
      ├─ core 建 scope 目录(项目:tasks/workflows/knowledge/...;全局:config+projects+模板)
      ├─ 写 config.json / context.json / 默认 workflow
      ├─ installCanonicalWorkflowSkills() → .agent/skill/<name>(不覆盖)
      │    # 装 templates/common/skills/* 全部:workflow 类(brainstorm/grill-me/dev/check/finish)
      │    # + 维护类 tuteur-knowledge(知识库维护,knowledge.md;非 workflow 节点,不进默认 workflow)
      ├─ 项目模式:写 .developer(本地身份)+ workspace/<slug>/(提交即登记进成员名册,core §3)
      ├─ 对每个 agent:configureAgentPlatform(id, ctx)   # §8 派发到 configurators/<id>.ts
      └─ recordCurrentTemplateHashes()
```

全局模式(`--global`)跳过 agent 配置与 workspace 名册 —— 只在 `~/.tuteur/` 落 config + projects 注册表 + workflow/knowledge 模板(core.md §2.1/§2.3)。

**交互输入**:agent 多选用 `@inquirer/prompts` 的 checkbox(choices 由注册表 `defaultChecked` 派生);名字这类纯文本输入参考 Trellis 用 readline 避免闪烁。问题定义见 `INIT_QUESTIONS`(core.md §8),与 web 表单同源。

### 4.2 `ttur dashboard start|stop`(已实现,待调整)

当前 `start` 把单一 `TUTEUR_PROJECT_ROOT` 传给 `next dev`。**多项目 dashboard 下,项目根不再由启动参数固定**,而由 web 端选择(web.md §2)。`start` 应改为:确保全局根存在 → 启动 dashboard(不强绑单项目)→ 写 `runtime/dashboard.json`。详见 web.md §7。

### 4.3 `ttur update` / `uninstall`(已实现,保留)

基于 `managed-templates` 哈希追踪,见 §7。`uninstall` 需支持 `--global` 清理全局根。

---

## 5. 待实现命令

退出码约定:`0` 成功 / `1` 通用错误 / `2` **门禁失败** / `3` 用户取消。**命令面向 agent,统一吐简单 JSON**(`{ok, ...}`,成败都结构化,退出码语义不变);人看进度去 web,不为 CLI 做花哨人读文本(harness §2.3)。

### 5.1 `ttur task ...`

```text
ttur task create "<title>" [--workflow <id>] [--assignee <slug>]
ttur task list [--mine|--all] [--status ...] [--archived]
ttur task status [<task>]
ttur task start <task>                 # 写 runtime/current-task.json 当前任务指针(harness §7.1)
ttur task assign <task> <slug>         # 改派 assignee(creator 不变,core.md §3.1)
ttur task archive <task> [--cancelled]
```

> 所有命令默认输出简单 JSON(`{ok, ...}`,见 §5 开头),不再有独立 `--json` flag。

`create`(**新任务通常由 agent 替用户建**:用户描述需求 → agent 跑此命令):`core.resolveProjectScope()` → 校验 workflow → `taskId=<MM-DD>-<slug>` → 写归属(`creator = 当前 .developer.slug`,`assignee = --assignee ?? 当前 .developer.slug`;**既无 `.developer` 又无 `--assignee` 则快速失败**,提示先 `ttur init -u`,对齐 Trellis,core.md §3.1)→ `core.writeTask/writeState`(state 初始化到 `entry` 节点);同名检测只查活跃任务目录(归档区按 `<YYYY-MM>` 分桶,跨年同名可共存,core.md §9)。`start`:写当前任务指针,完成/归档自动清除(harness §7.1)。`assign`:只改 `assignee`(校验 `workspace/<slug>/` 在册,core.md §3.1)。`list --mine` 用 `core.isOwnedBy`(按 assignee)+ `core.shouldFilterByUser`(全局根不过滤,core.md §3),默认不含归档。`archive`:`core.archiveTask` —— 默认不改 status(未完成任务询问,或 `--cancelled` 标记取消)+ 写 archivedAt + 移动目录到 `tasks/archive/<YYYY-MM>/<id>/`,**不绑任何产物、不执行任何 git 操作**(core.md §9)。

### 5.2 `ttur complete <node>` —— 核心门禁

```text
ttur complete <node> [--task <task>] [--branch <label> --reason "..."] [--skip --reason "..."]
  # skill 节点:核对 gate(artifacts/checks/approval);switch 节点:需 --branch <label> --reason
  # --task 缺省走 resolveCurrentTask(harness §7.1);输出统一简单 JSON
  → core.completeNode(scope, taskId, node, { branch, reason, by })
  → result.ok  → exit 0 + stdout 下一步 JSON(harness §2.3:next 节点/类型;switch 列分支 criteria)
  → !result.ok → exit 2 + { ok:false, blocked:[...] }(缺产物/检查失败/待 approve;或 switch 缺/非法 --branch)
  → --skip     → 人工显式跳过并留痕(门禁永不自动放行,harness §2.4)
  每次调用(成败)appendEvent 到 events.jsonl(core §4.4)
```

CLI 只做"解析参数 + 调 core + 映射退出码",**门禁与节点图推进全在 core**(harness.md §2/§3)。

### 5.2.1 `ttur rewind <node>` / `ttur approve <node>`

```text
ttur rewind <node> [--task <task>] [--reason "..."]   # switch 判错恢复:退游标回该节点、清下游、记 rewind 事件(harness §3.1)
ttur approve <node> [--task <task>]                    # 写 state.approvals(by=当前 .developer.slug)+ approval 事件;agent 或人均可跑(harness §2.6)
```

`approve` 是 approval 门禁的写入口(web 点确认是等价的另一入口);`rewind` 是无环图下唯一的"往回走"恢复动作,显式留痕。

### 5.3 `ttur hook <event>` —— 平台事件统一入口(三阶段)

把被动事件收敛成 CLI 子命令,逻辑全在 core(harness.md §6 三阶段功能规格)。三个事件对应 hook 三阶段:

```text
ttur hook session-start            # 会话启动:全量注入(会话须知+当前态+workflow概览+任务状态机+planned context)
                                   #   stdout 输出注入内容 + 追加 session_start 事件
ttur hook inject-workflow-state    # 每轮用户输入:输出当前节点轻量 breadcrumb(P2)
ttur hook inject-subagent-context  # 派生子 agent:输出/改写该节点精选上下文(P1+;pull 平台不发)

  公共参数/行为(harness §6.2):
    --platform <id>   显式平台(否则按 env/ cwd 目录自动探测),决定事件名与输出信封
    任务定位:core.resolveCurrentTask(指针 > 唯一未完成任务兜底,harness §7.1);TUTEUR_PROJECT_ROOT 仅作 scope 兜底
    kill-switch:TUTEUR_HOOKS=0 或平台非交互标志 → 静默退出 0、不注入
    退出码:0=成功;非 0=失败(平台忽略,绝不阻断会话)
```

> **现状(MVP 已实现)**:`ttur hook session-start` —— 经 `renderSessionStart` 输出**纯文本**注入(多态:NO ACTIVE TASK / AMBIGUOUS / STALE / 停在 skill / 停在 switch / COMPLETED)+ 追加 `session_start` 事件;非 Tuteur 项目或 `TUTEUR_HOOKS=0` 静默退出 0;异常软失败不阻断。**未实现**:`--platform` 探测与 `renderHookOutput` 信封适配、`inject-workflow-state`、`inject-subagent-context`(均为后续)。

`hook session-start` 内部:`core.resolveProjectScope` → `core.readState` + `core.resolvePlannedContext` → 按段拼注入内容,经 `renderHookOutput(event, platform)` 出信封(参考实现见 harness.md §6.4)。事件名/信封的平台差异收在 core 一处,CLI 只解析参数 + 调 core。

### 5.4 `ttur knowledge ...` —— 知识库维护(分 scope,P2)

确定性 bookkeeping 的命令化(规格见 [knowledge.md §9](./knowledge.md));检索本身靠 `index.md`+链接,不在此列。**默认作用于当前项目知识库,`--global` 切到全局**(同 `init --global` 语义)。

```text
ttur knowledge graph [--global] [--merged] [--json]   # 从 [[链接]]+frontmatter 派生文档关系图;--merged=全局+项目全景
ttur knowledge index [--global]                        # 据 frontmatter 确定性重算 index.md(catalog)
ttur knowledge lint  [--global]                        # 孤儿页/断链/悬空 injectByDefault 机械体检
  scope:默认 resolveProjectScope(当前项目);--global → ~/.tuteur/knowledge/
  id 撞车:全局/项目同 id 时项目覆盖全局(与注入合并同规则,knowledge.md §7)
```

`graph` 优先(服务 web 图谱视图 W7c);`index`/`lint` MVP 先由 `tuteur-knowledge` skill 让 agent 做,规模大了再固化(knowledge.md §9)。

---

## 6. 数据文件(归属 core)

`.tuteur/` 结构、各 JSON schema、双层布局**统一在 [core.md §2/§4](./core.md)**,本文不复制。CLI 只通过 `core.store` 读写。

由 `init` 写出:`config.json`、`context.json`、`workflows/default.workflow.json`、`template-hashes.json`、`.developer`、`workspace/<slug>/index.md`、`.gitignore`。
由 `task`/`complete`/`approve`/`hook` 运行时写出(已实现):`tasks/<id>/task.json`、`tasks/<id>/state.json`(含 `decisions`/`approvals`)、`tasks/<id>/events.jsonl`、`runtime/current-task.json`。归档后迁入 `tasks/archive/<YYYY-MM>/<id>/`。

> 注意:`init` 当前写的 `default.workflow.json` 仍是旧扁平结构(节点只有 `skillRef`/`required`)。需改成固定阶段容器 + skill/switch 节点 + `gate` 门禁(core §4.3、harness §1)。

---

## 7. 模板更新机制(managed-templates,已实现)

```text
analyzeTemplateChange:
  不存在→create  内容相同→unchanged  哈希匹配(用户没改)→auto-update  否则→conflict

ttur update → create/auto-update 直接写;conflict → --force(备份后覆盖)/--skip-all/--create-new/交互
```

`hashContent=sha256`,清单存 `template-hashes.json`。扫描 `.agent/skill` 与 `.claude/skills`(copy 副本计入,symlink 跳过)。这套机制保护用户对 skill 的自定义改动不被升级覆盖(harness.md §8 扩展安全网)。

---

## 8. Agent 接入:数据注册表 + per-agent configurator + 通用层

**Trellis 风格(数据与行为分离)**:平台差异尽量建模成**纯数据**和**模板文件**,configurator 只是「把这个平台的模板目录拷过去」。四层职责:

```text
数据注册表    registry.ts:AGENT_PLATFORMS —— 平台静态元数据单一源(目录/flag/勾选/skill 目录/templateContext),无行为
配置器(行为)  configurators/<id>.ts:configure<Id>(ctx, platform) —— 拷本平台模板目录 + 调 shared helper,不写平台逻辑分支
通用层(生成)  shared.ts:copyAgentTemplates/writeSkills/linkSkills/copyCanonicalSkills/resolvePlaceholders
派发          registry.ts:configureAgentPlatform(id, ctx) = PLATFORM_CONFIGURATORS[id](ctx, AGENT_PLATFORMS[id]);index.ts 仅聚合 re-export
```

设计原则(同 Trellis):**注册表只放静态数据(目录、flag、生效目录、`templateContext` 占位符);凡是「装什么文件」一律下沉到 `templates/<id>/` 模板树,init 拷过去即可。** 挂 hook、定义 agent 角色、写 settings 都是**模板文件**,不是注册表里的配置项,也不需要「登记适配器」抽象。不用 OOP 基类,契约是隐式函数类型 + 共用 shared helper。

> **与旧稿的差异(本轮更正)**:删去注册表里的 `hooks:{ registry: HookRegistry }` 适配器枚举与 `registerHook` 机制——hook 文件改由模板树承载(§8.4);`configure` 不再写进数据注册表,行为放 `PLATFORM_CONFIGURATORS` 行为表(§8.2);`ttur skill list` 命令删除,skill 发现是 core 能力、给 web 用(§8.6)。

### 8.1 AGENT_PLATFORMS 注册表(纯数据单一源)

注册表只描述「这个平台长什么样、文件落到哪」,**不含任何函数与 hook 登记逻辑**:

```ts
// configurators/registry.ts(数据) + types/agent.ts(类型)
export interface AgentPlatformConfig {
  id: string; name: string; configDir: string;        // '.codex' / '.claude'
  cliFlag: string; defaultChecked: boolean;            // init flag 与默认勾选
  skillTarget: string | null;                          // skill 适配目录;null=只用 .agent/skill
  skillDirs: { project: string[]; global: string[] };  // skill 发现目录(静态):project 相对项目根,global 相对用户 home(§8.6)
  supportsAgentSkills?: boolean;                       // 直接读共享 .agent/skill(Codex/Gemini)
  templateContext: TemplateContext;                    // 占位符渲染上下文(枚举字段)
}
export interface TemplateContext { cmdRefPrefix: string; userActionLabel: 'Skills' | 'Slash commands'; cliFlag: string; }

// defineAgentPlatforms 用映射类型把每条的 id/cliFlag 锁到注册表 key,使 AgentTool 保持窄联合
export const AGENT_PLATFORMS = defineAgentPlatforms({
  codex:  { id:'codex', name:'Codex', configDir:'.codex', cliFlag:'codex',
            defaultChecked:true, skillTarget:null, supportsAgentSkills:true,
            skillDirs:{ project:['.agent/skill','.codex/skills'], global:['.codex/skills'] },
            templateContext:{ cmdRefPrefix:'$', userActionLabel:'Skills', cliFlag:'codex' } },
  claude: { id:'claude', name:'Claude Code', configDir:'.claude', cliFlag:'claude',
            defaultChecked:true, skillTarget:'.claude/skills',
            skillDirs:{ project:['.claude/skills'], global:['.claude/skills'] },
            templateContext:{ cmdRefPrefix:'/tuteur:', userActionLabel:'Slash commands', cliFlag:'claude' } },
  gemini: { id:'gemini', name:'Gemini CLI', configDir:'.gemini', cliFlag:'gemini',
            defaultChecked:false, skillTarget:null, supportsAgentSkills:true,
            skillDirs:{ project:['.agent/skill'], global:['.gemini/skills'] },
            templateContext:{ cmdRefPrefix:'/tuteur:', userActionLabel:'Slash commands', cliFlag:'gemini' } },
});
export type AgentTool = keyof typeof AGENT_PLATFORMS;   // 'codex' | 'claude' | 'gemini'
```

init 的 agent flag、交互勾选、InitConfig 全从这张表派生(§4.1、core.md §8)。**平台特有文件(hook/agent/settings)放 `templates/<id>/`,由 `copyAgentTemplates` 整目录拷到 `configDir`,不在注册表里逐项声明。**

### 8.2 per-agent configurator(行为,与数据分离)

行为不进数据注册表,单独一张 `PLATFORM_CONFIGURATORS` 表(`registry.ts`)。每个 `configurators/<id>.ts` 导出 `configure<Id>(context, platform): Promise<ConfigureAgentResult>`(platform 由派发器注入,免去 configurator 反向 import 注册表),主体只有两件事:**拷本平台模板目录树** + **按 `skillTarget` 落 skill**:

```ts
// configurators/claude.ts
export async function configureClaude(context: ConfigureAgentContext, platform: AgentPlatformConfig): Promise<ConfigureAgentResult> {
  const writtenPaths = copyAgentTemplates({                // 拷 templates/claude/* → .claude/(settings.json、hooks/、agents/),json 占位符渲染
    projectRoot: context.projectRoot, templateId: platform.id,
    configDir: platform.configDir, templateContext: platform.templateContext, createdPaths: context.createdPaths,
  });
  if (platform.skillTarget)                                // skill:link 或 copy 到 .claude/skills
    writtenPaths.push(...(context.skillAdapterMode === 'copy'
      ? copyCanonicalSkills({ projectRoot: context.projectRoot, targetRoot: platform.skillTarget, createdPaths: context.createdPaths })
      : linkSkills({ projectRoot: context.projectRoot, linkRoot: platform.skillTarget, createdPaths: context.createdPaths })));
  return { configured: true, writtenPaths };
}
// configurators/codex.ts —— supportsAgentSkills,skill 直接用 .agent/skill;hook 模板随 copyAgentTemplates 落地,另发 feature-flag 提醒
export async function configureCodex(context: ConfigureAgentContext, platform: AgentPlatformConfig): Promise<ConfigureAgentResult> {
  const writtenPaths = copyAgentTemplates({ projectRoot: context.projectRoot, templateId: platform.id,
    configDir: platform.configDir, templateContext: platform.templateContext, createdPaths: context.createdPaths });
  warnCodexHookFlag();                                     // stderr 提醒开 features.hooks(§8.4)
  return { configured: true, writtenPaths };
}
```

隐式契约:`type PlatformConfigurator = (context: ConfigureAgentContext, platform: AgentPlatformConfig) => Promise<ConfigureAgentResult>`。派发:`registry.ts` 的 `PLATFORM_CONFIGURATORS: Record<AgentTool, PlatformConfigurator>`,`configureAgentPlatform(id, ctx) = PLATFORM_CONFIGURATORS[id](ctx, AGENT_PLATFORMS[id])`。**加平台 = 注册表加一条数据 + 行为表加一条 + 建 `templates/<id>/` 目录**(§8.5)。

### 8.3 通用层 shared.ts(生成方法)

所有 configurator 共用,保证模板拷贝/skill 渲染/写盘/软链/占位符一致:

```ts
copyAgentTemplates({ projectRoot, templateId, configDir, templateContext, createdPaths }): string[];  // 拷 templates/<templateId>/ → configDir,过滤 *.ts/.js/.gitkeep,*.json 占位符渲染,不覆盖已存在文件
resolveWorkflowSkills(ctx: TemplateContext): { name; content }[];   // 读 common/skills/*,替换占位符
writeSkills({ skillsRoot, skills, createdPaths }): string[];        // 写盘(不覆盖同名)
linkSkills({ projectRoot, linkRoot, createdPaths }): string[];      // 软链 .agent/skill → linkRoot(Win 用 junction)
copyCanonicalSkills({ projectRoot, targetRoot, createdPaths }): string[];  // 复制独立副本
resolvePlaceholders(content, ctx): string;                  // {{PRODUCT_NAME}}/{{CMD_REF_PREFIX}}/{{USER_ACTION_LABEL}}/{{CLI_FLAG}}(skill 另替换 {{SKILL_NAME}})
installCanonicalWorkflowSkills({ projectRoot, createdPaths }): string[];  // 装到 .agent/skill
```

占位符替换表(值由 `templateContext` 提供)见 harness.md §5.1。**关键不变量(Trellis 教训)**:init 写盘与 update collect 必须用**同一组** resolve/copy helper,否则升级用户会丢文件。

### 8.4 Hook:声明文件即模板,命令直配(无脚本、无适配器)

挂 hook **不是注册表配置,也没有 `registerHook` 适配器**。每个平台的 hook 声明文件放在它的 `templates/<id>/` 模板树里,`copyAgentTemplates` 拷过去(json 占位符渲染)即完成登记。**已核实 Claude/Codex 的 hook 都接受 `type:"command"` 命令字符串,所以声明文件里直接写 `ttur hook session-start`,不落任何 `.py`/`.sh` 包装脚本**(理由见 harness.md §6.3:`.sh` 在 Windows 不可移植,直接命令靠 `ttur.cmd` shim 全平台可用):

| 平台 | 声明文件 | 注册的 hook 事件(harness §6.1) | 落地到 |
| --- | --- | --- | --- |
| codex | `templates/codex/hooks.json` | `SessionStart`(MVP);`UserPromptSubmit`/`PreToolUse` 后续 | `.codex/hooks.json` |
| claude | `templates/claude/settings.json` | `SessionStart`(MVP);`UserPromptSubmit`/`PreToolUse` 后续 | `.claude/settings.json` |
| gemini | `templates/gemini/settings.json` | 待核实(per-turn 事件名为 `BeforeAgent`,§6.2) | `.gemini/settings.json` |

每个事件登记一行 `ttur hook <event>` 命令(命令随事件不同:`session-start`/`inject-workflow-state`/`inject-subagent-context`)。**MVP 只装 `SessionStart`→`ttur hook session-start`**(P0);per-turn breadcrumb 与子 agent 注入是 harness §6.5/§6.6 的后续事件,届时在同一声明文件追加对应 event 段即可——仍是「改模板、零适配器代码」。

Codex 的 `hooks.json` 结构(event → matcher 组 → command handler,键名大小写敏感):

```jsonc
// templates/codex/hooks.json(MVP 只含 SessionStart;后续在同文件追加 UserPromptSubmit/PreToolUse 段)
{ "hooks": { "SessionStart": [
  { "matcher": "startup|resume",
    "hooks": [ { "type": "command", "command": "ttur hook session-start" } ] } ] } }
```

Claude 的 `settings.json` 同理(`hooks.SessionStart[].hooks[].command`);两者都不需要包装脚本文件。仅当将来接入「只收脚本路径」的平台时才用包装,且优先 `command_windows` 这类可移植覆盖而非 shebang 脚本。

> 说明:声明文件(`settings.json`/`hooks.json`)在「全新项目」场景按模板直接写;若目标已存在用户内容,沿用 §7 的 managed-templates 冲突策略(哈希未改→覆盖更新,改过→冲突走 `--force`/交互),不做隐式深合并,避免静默改写用户配置。

> ⚠️ **Codex 的 hook 需用户手动开启并信任**:① `~/.codex/config.toml` 里设 `[features] hooks = true`(`init` 完成输出与文档须含此指引);② Codex 0.129+ 装好后还要在 CLI 里 `/hooks` review/trust 一次。任一缺失 hook 都静默不生效——症状即 `events.jsonl` 中没有任何 `session_start` 事件(web 事件时间线据此告警,web.md §3.1)。`init` 的 `warnCodexHookFlag()` 已在 stderr 提示(configurators/codex.ts)。

### 8.5 加一个新 agent 的步骤

1. `AGENT_PLATFORMS` 加一条**数据**(cliFlag/configDir/skillTarget/skillDirs/templateContext)。
2. `PLATFORM_CONFIGURATORS` 加一条**行为**(多数照抄 codex/claude 的 `copyAgentTemplates` 模式)。
3. 建 `templates/<id>/` 模板树,把该平台的 hook 脚本/声明文件/agent 角色放进去。
4. 若 hook 声明是全新格式,只是模板里多一个文件——**不需要新增任何适配器代码**。

公共生成逻辑(模板拷贝/skill 渲染/软链)零增量——这就是「数据注册表 + 模板树 + 通用生成层」。**全局模式不走 configurator**(core.md §2.3)。

### 8.6 Skill 发现(core 能力,供 web,不暴露 CLI 命令)

workflow 编排 skill,需要列出本地都有哪些 skill。**这是 core 的读能力,不是一条 `ttur` 命令**——消费方是 web 画布:定义 workflow 时,skill 节点的 `skill` 下拉从这里取候选(**按逻辑名去重**)、按 `agent`/`source` tag 分组(web §3.3、core §5.1)。CLI 不为此单开命令(对齐 Trellis:其 CLI 也只有 init/uninstall/update)。

发现目录由 core `agents/registry.ts` 的 `getProjectSkillDirs()`/`getGlobalSkillDirs()` 从 `AGENT_PLATFORMS.skillDirs` 派生(**单一数据源**):project 组相对项目根、global 组相对各 agent 的 **home 目录**(全局 skill 不在 `~/.tuteur/`,core §2.3 安全边界)。扫描 + 解析 frontmatter 落在 core(`skills.ts` 的 `discoverSkills`,core §5.1),按逻辑名去重(剥 `tuteur-` 前缀、合并多处安装位置):

```ts
// core/skills.ts(节选,完整签名见 core §5.1)
export function discoverSkills(scope: Scope): DiscoveredSkill[] {
  // 扫 getProjectSkillDirs()(相对 scope.root)+ getGlobalSkillDirs()(相对 os.homedir())
  // 每个含 SKILL.md 的目录 → 取 logicalSkillName,按名折叠成一条,合并 paths[]
  // 返回 { name, description?, source, paths } 列表
}
```

web 经 `GET /api/skills?project`(web §3.3/§9 W11)拿到去重后的结果;`resolveSkillRef` 用同一组目录做校验期/运行期检查(解析不到则报错)。目录清单只在 `AGENT_PLATFORMS` 定义一次,扫描与解析是 core 的事。

---

## 9. 代码评价与 TODO

### 9.1 评价
- 约定式命令加载、哈希追踪更新、幂等写入:成熟,保留。
- **数据注册表 + per-agent configurator + shared 通用层**(Trellis 风格)兼顾「每平台一个文件可读」与「公共生成逻辑不重复」,呼应你的诉求 4。注册表纯数据,挂 hook/定义 agent 一律走 `templates/<id>/` 模板树,不做适配器配置。
- **InitConfig 统一模型** 让 CLI flag/交互/web 表单三种输入同源,初始化逻辑只有一份(诉求 1)。
- **依赖 core** 后,CLI 不再持有读盘逻辑,与 app 行为天然一致(诉求 2)。
- 现状缺口仍是:核心命令(task/complete/hook)未实现、无测试。

### 9.2 TODO

| # | 项 | 优先级 | 依赖 |
| --- | --- | --- | --- |
| C1 | CLI 改依赖 `@tuteur/core`,删自有读盘/常量 | P0 | core K1-K7 |
| C2 | `task create/list/status/start/assign/archive`(create 写 creator/assignee 默认当前用户、无身份快速失败,§3.1;归档:不改状态/`--cancelled`/YYYY-MM 分桶) | P0 | core store/§3.1/§9、harness §7.1 |
| C3 | `complete <node>`(skill gate / switch `--branch --reason`;退出码 0/2;JSON 接力;`--skip` 留痕)+ `rewind` + `approve` | P0 | core K4、harness §2.3-§2.6 |
| C4 | `hook <event>` 入口 + hook 声明文件(命令直配,无脚本)+ session_start 事件回写 | P0 | core context、harness §6 |
| C5 | 数据注册表(含 skillDirs 两组)+ PLATFORM_CONFIGURATORS 行为表 + 模板树承载 hook(含 Codex feature flag 指引) | P0 | §8 |
| C6 | InitConfig 三输入(flag/交互/web)+ serializeToCommand | P0 | core §8 |
| C7 | `init --global`(只装模板+config+projects,不配 agent) | P1 | core §2.3 |
| C8 | `uninstall --global`、dashboard 多项目调整 | P1 | web §2/§7 |
| C9 | 给门禁/状态/归档/decision 写 Vitest | P0 | core K4 |
| C10 | `discoverSkills`(core 能力,项目+agent home,带 tag;供 web `GET /api/skills`,**不暴露 CLI 命令**) | P1 | §8.6、core §5.1 |
| C11 | `workflow validate`(节点连通/无环/阶段单调/switch default/skill 可解析) | P2 | core resolveSkillRef |
| C12 | ~~`task create --worktree`~~ 已后置(方案存档 core §9.1) | P2 | core §9.1 |

### 9.3 待确认
- agent flag 全集是否随注册表增长(每加平台一个 `--xxx`)?**推荐**:是,与 Trellis 一致;flag↔注册表用编译期断言锁一致性。
- ~~`ttur run <node>` 是否进 MVP~~ → **已定:不进**,run 模式整体移除,交互模式唯一(harness §7)。
- ~~缺省 `--task`~~ → **已定**:`resolveCurrentTask` 三层解析(`--task` > `runtime/current-task.json` 指针 > 唯一未完成任务兜底,harness §7.1)。
