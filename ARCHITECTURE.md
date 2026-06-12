# Tuteur 架构设计

## 1. 设计结论

Tuteur 是一个本地优先的 AI coding agent workflow harness。

它不替代 Codex、Claude Code、Gemini CLI 等 agent，而是在它们之上提供任务、workflow、产物、检查、approval、run 日志和可视化观察能力。

MVP 推荐采用：

- Node.js / TypeScript 作为主技术栈。
- CLI 作为主要入口。
- Next.js 作为本地 dashboard，包含页面和本地 API。
- `.tuteur/` 作为 repo-native 存储目录。
- JSON workflow 作为任务流转的唯一事实源。
- Codex 作为第一版优先支持的 agent adapter。

核心原则：agent 负责执行某个 step 内的实际工作，Tuteur 负责判断这个 step 能不能完成、任务能不能进入下一阶段。

## 2. 技术选型

这部分保留为“大方向选型”，用于约束后续实现，不提前锁死每个库的细节。

| 层             | 初步选择                                | 说明                                                                                              |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Runtime        | Node.js 20+                             | CLI、本地文件、子进程、Next standalone server 都依赖 Node。                                       |
| 语言           | TypeScript                              | workflow、task、state、run 等核心对象需要类型约束。                                               |
| 包管理         | pnpm workspace                          | 适合 CLI 与 dashboard 分包组织；CLI 拥有项目初始化、模板和 agent 配置逻辑。                       |
| CLI            | commander 或同类轻量 CLI 框架           | 负责命令解析、项目初始化、模板安装、agent 配置和本地 dashboard 管理。                             |
| 本地 dashboard | Next.js App Router                      | 页面和本地 API 放在同一个应用里。                                                                 |
| 本地 API       | Next Route Handlers                     | 负责读写 `.tuteur/`、执行检查、调用 agent adapter。                                               |
| 存储           | JSON + Markdown + log file              | 保持 repo-native、可读、可迁移。                                                                  |
| 校验           | zod 或同类 schema 工具                  | 后续用于 workflow/task/state 基础校验。                                                           |
| Agent 集成     | CLI-local templates + platform registry | 参考 Trellis：模板、configurator 和安装逻辑都归属于 CLI package，不额外拆独立核心或模板 package。 |
| 后台进程       | Node child_process detached             | `dashboard start` 后台启动 Next standalone server。                                               |
| 测试           | Vitest + Playwright                     | CLI 确定性逻辑后续用 Vitest；dashboard 关键路径后续用 Playwright。                                |

Next 只能作为带 Node server 的本地应用使用，不能使用纯静态导出。需要本地文件访问、命令执行和 agent 调用的 API 都必须运行在 Node runtime。

## 3. 顶层功能划分

Tuteur 的代码层面先按几个大模块划分，先不细化到具体文件：

```text
tuteur/
  docs/
  packages/
    cli/   # 命令行入口、项目初始化、模板和 agent configurator
    app/   # Next 本地 dashboard
  tests/
```

### 3.1 CLI

CLI 是用户和 agent 都能调用的稳定入口，也是项目初始化、模板维护和 agent 平台适配的所有者。

主要职责：

- Project 管理：识别项目根目录，初始化 `.tuteur/`。
- Task 管理：创建、查询、归档任务。
- Workflow 管理：读取和校验 workflow，计算当前 phase/step。
- Step 完成门禁：检查 artifact、command check、approval。
- Artifact 管理：发现和读取任务产物。
- Context 管理：计算 planned context，记录 actual context。
- Run 管理：记录 agent run metadata 和 log。
- Skill 发现：扫描外部 agent skill，但不保存 skill 本体。
- Skill 安装：先把默认 skill 包安装到 `.agent/skill`，再根据用户选择的 agent 派发 configurator 做适配。
- Agent adapter：封装 Codex 等外部 agent 的启动和日志捕获。
- User identity：初始化本地用户身份，用于任务归属和 dashboard 默认过滤。
- Dashboard 管理：后台启动/停止本地 Next dashboard。

CLI 内部参考 Trellis 的组织方式，把职责拆到 `commands/`、`project/`、`configurators/`、`templates/`、`utils/`、`types/`。确定性逻辑必须用代码处理，不能交给 agent 决定。

MVP 命令：

```bash
tuteur init
tuteur init -u "yan"
tuteur task create "任务标题"
tuteur task list
tuteur task status <task>
tuteur complete <step>
tuteur task archive <task>
tuteur dashboard start
tuteur dashboard stop
```

`tuteur dashboard start` 后台启动本地 dashboard，不占用当前 terminal。

`tuteur dashboard stop` 停止后台 dashboard。

可以兼容 `tuteur dashbord start/stop` 作为拼写 alias，但帮助文档只展示标准拼写 `dashboard`。

### 3.2 App

App 是 Next.js 本地 dashboard。

它分两部分：

- 页面：展示任务列表、任务详情、workflow 进度、artifact、run log、context、approval。
- 本地 API：读写 `.tuteur/`，执行 step completion，启动 agent run。

浏览器页面不直接访问本地文件系统，所有本地副作用都通过 Next route handlers 完成。

Dashboard 读取 `.tuteur/.user` 作为当前本地用户身份。初始化过用户时，任务列表默认使用 `mine` 视角，只展示 `task.json` 中 `creator` 或 `assignee` 匹配当前用户的任务；用户仍可以切换到 `all` 查看全量任务。这个能力只做本地协作过滤，不做权限控制。

Dashboard 第一版只追求清晰和可观察，不做复杂 workflow 编辑器。

### 3.3 Agent 集成

Agent 集成参考 Trellis 的 init 设计，但 MVP 暂不搬入 Trellis 的全部复杂度。

Trellis 的关键形态是：

- `AI_TOOLS` 注册表声明平台名称、配置目录、CLI flag、template context、是否支持共享 Agent Skills。
- `init` 交互选择平台；非交互模式使用默认平台选择。
- `configurePlatform(platformId, cwd)` 从平台函数注册表派发到具体 configurator。
- `configurators/shared.ts` 提供 `resolveSkills`、`resolveCommands`、`writeSkills` 等通用能力。
- `packages/` 下只保留 CLI package；模板源位于 CLI package 内部的 `src/templates/`。
- Trellis 的 Claude configurator 写 `.claude/skills`、`.claude/commands`、hooks、agents、settings。
- Trellis 的 Codex configurator 写共享 `.agents/skills`，并补 `.codex/skills`、`.codex/agents`、hooks、config 等 Codex 私有内容。

Tuteur 当前先保留这个骨架，不提前做完整功能：

```text
packages/cli/src/
  commands/
    init.ts            # init 命令交互和调用 project init
    dashboard.ts       # dashboard 进程管理
  project/
    init.ts            # 创建 .tuteur、安装默认技能、派发 configurator
  configurators/
    index.ts           # 平台行为注册表
    registry.ts        # 平台数据注册表
    shared.ts          # 通用模板解析和写入 helper
    codex.ts           # Codex 安装逻辑
    claude.ts          # Claude Code 安装逻辑
    gemini.ts          # Gemini CLI 安装逻辑占位
  templates/
    common/
      skills/          # 默认 skill 模板源
      commands/        # 共享 command 模板预留
    codex/
      agents/
      hooks/
      hooks.json
      config.toml
      skills/
    claude/
      agents/
      settings.json
    gemini/
      agents/
      settings.json
    shared-hooks/      # 可被多个平台复用的 hook 脚本模板
  utils/
  types/
```

模板不是运行时业务状态，也不写入 `.tuteur/`。Tuteur 仓库内先保留一份 CLI-owned 的统一 skill 模板源：

```text
packages/cli/src/templates/
  common/
    skills/
      brainstorm/
      grill-me/
      dev/
      check/
      finish/
    commands/
  codex/
    agents/
    hooks/
    hooks.json
    config.toml
    skills/
  claude/
    agents/
    settings.json
  gemini/
    agents/
    settings.json
  shared-hooks/
```

`tuteur init` 先把这份统一模板安装到项目内的 skill 包目录：

```text
.agent/
  skill/
    brainstorm/
      SKILL.md
    grill-me/
      SKILL.md
    dev/
      SKILL.md
    check/
      SKILL.md
    finish/
      SKILL.md
```

然后根据用户在 init 里选择的 agent，给需要特殊目录的 agent 做适配。这里不是在 `init` 里按平台硬编码复制，而是：

- `initProject()` 创建 `.tuteur/` 基础结构。
- `initProject()` 调用 `installCanonicalWorkflowSkills()` 写入 `.agent/skill`。
- `initProject()` 对每个 agent 调用 `configureAgentPlatform(agent, context)`。
- `configureAgentPlatform()` 从平台函数注册表找到 configurator。
- configurator 做平台适配；例如 Claude 通过软链把 `.claude/skills/<name>` 指向 `.agent/skill/<name>`。

默认 skill 大类先保持与默认 workflow 对齐：

- `brainstorm`
- `grill-me`
- `dev`
- `check`
- `finish`

不同 agent 的实际落地形态可以不同：

- Codex：第一阶段只依赖 `.agent/skill`；后续只有在确认需要 Codex 私有 adapter 时才补 `.codex/*`。
- Claude Code：init 时可选择创建 `.claude/skills/<name>` 到 `.agent/skill/<name>` 的软链，或直接复制 skill 到 `.claude/skills/<name>`；后续再补 `.claude/commands/`、hooks、agents、settings。
- Gemini CLI：第一阶段只依赖 `.agent/skill`；后续确认 `.gemini` 命令、hooks 和 settings。

这个设计和 `.tuteur/` 不保存 skill 本体不冲突：Tuteur 可以安装默认 skill，但本体在 `.agent/skill`，不在 `.tuteur/`。只有当某个平台确实需要不同 frontmatter、命令入口、hook 或 adapter glue 时，才增加平台专属 override。

## 4. 运行时目录规划

用户在项目中执行 `tuteur init` 后，生成 `.tuteur/`。

先按这个大结构规划：

```text
.tuteur/
  .gitignore
  .user              # local only，被 .tuteur/.gitignore 忽略
  config.json
  context.json
  spec/
  workflows/
  tasks/
  runtime/
  workspace/         # local only，每个用户自己的本地工作区
```

同时，`tuteur init` 会根据用户选择的 agent，在对应 agent 生态目录创建适配层。例如：

```text
.agent/
  skill/
    brainstorm/
    grill-me/
    dev/
    check/
    finish/

.codex/
  # TODO: 只有确认需要 Codex 私有适配时才创建

.claude/
  skills/
    brainstorm -> ../../.agent/skill/brainstorm
    grill-me  -> ../../.agent/skill/grill-me
    dev       -> ../../.agent/skill/dev
    check     -> ../../.agent/skill/check
    finish    -> ../../.agent/skill/finish
```

这些目录不属于 `.tuteur/`，但可以由 Tuteur 初始化时生成或补齐。`.agent/skill` 是 Tuteur 的统一 skill 包目录；`.claude/skills`、`.codex/*` 这类目录是平台适配层。适配层创建方式在 init 中选择：软链引用统一 skill，或复制成独立文件。

职责说明：

- `config.json`：项目配置，例如默认 workflow、默认 agent、dashboard 端口。
- `context.json`：默认注入上下文配置。
- `spec/`：项目级规范和长期上下文。
- `workflows/`：结构化 workflow 定义。
- `tasks/`：任务状态、产物、run 日志。
- `runtime/`：dashboard pid、port、log 等本地运行时文件，默认不提交。
- `workspace/`：本地用户工作区，例如 `.tuteur/workspace/yan/index.md`，默认不提交。
- `.user`：本地用户身份，例如 `{ "name": "Yan", "slug": "yan" }`，默认不提交。

`.tuteur/` 不保存 skill 本体。Skill 仍属于 Codex、Claude Code 等各自生态目录。Tuteur 只负责在初始化时安装默认模板，并在 workflow 中通过 `skillRef` 引用它们。

用户身份的设计参考 Trellis 的 developer identity：身份是当前开发者机器上的本地状态，不进入共享仓库事实源。共享的 `task.json` 后续保存 `creator`、`assignee` 等归属字段；dashboard 根据 `.tuteur/.user` 做默认过滤。

## 5. 核心对象

MVP 先定义以下核心对象，字段细节后续在实现前再确认。

### 5.1 Project

被 Tuteur 初始化过的仓库。

Project 的事实源是 `.tuteur/`。

### 5.2 Task

一个可追踪的工作单元。

任务状态先只保留：

- `planning`
- `in_progress`
- `completed`

归档不是状态，而是任务完成后的整理动作。

### 5.3 Workflow

结构化任务流程。

Workflow 包含多个 phase，每个 phase 包含多个 step。

Step 可以定义：

- 关联 skill。
- 是否 required。
- 必需 artifact。
- command check。
- 是否需要 approval。

### 5.4 Artifact

Step 产出的文件。

MVP 只支持文件型 artifact，例如：

- `prd.md`
- `design.md`
- `checklist.json`
- `implement.json`
- `check.json`
- `check-result.json`
- `research/*.md`

### 5.5 Run

一次 agent 执行尝试。

Run 记录：

- agent
- phase / step
- 命令
- 开始和结束时间
- 状态
- 日志
- planned context
- actual context
- 生成产物
- 失败原因

Run 成功不等于 step 完成。Step 完成只能由 `tuteur complete <step>` 判断。

## 6. 默认 Workflow

MVP 默认 workflow 保持简单：

```text
Planning
  brainstorm
  grill-me

Execute
  dev
  check

Finish
  finish
```

Planning 阶段负责明确需求和计划。

Execute 阶段负责实现和检查。

Finish 阶段负责收尾和总结。

阶段是否能推进，由 Tuteur 根据 workflow 定义、artifact、check 和 approval 判断。

## 7. 关键流程

### 7.1 初始化

```text
tuteur init
 -> 交互选择 agent 工具，例如 Codex / Claude Code / Gemini CLI
 -> 创建 .tuteur/
 -> 写入默认 config/context/workflow
 -> 创建 spec/tasks/runtime 基础目录
 -> 安装 Tuteur 默认 skill 模板到 .agent/skill
 -> 选择 agent 专属 skill 目录使用软链还是直接复制
 -> 根据所选 agent 创建或补齐其项目级适配层
 -> 校验 workflow 中的 skillRef 是否能解析到已安装或已存在的 agent skill
```

初始化方式：

```bash
tuteur init
tuteur init -y
```

默认进入交互选择；`-y` 用默认选择，便于脚本或非交互环境。不要提供 `--codex --claude` 这类按 agent 安装的 flags，agent 选择属于 init 流程的一部分。

默认安装的 skill/command 与默认 workflow 对齐：

```text
brainstorm -> 产出初始 prd.md
grill-me  -> 压实需求、补齐 design/checklist/context
dev       -> 按 implement context 执行实现
check     -> 按 check context 执行检查
finish    -> 收尾、总结、更新必要上下文
```

如果 `.agent/skill` 已有同名 skill，默认不覆盖。后续可以通过 `tuteur skills update` 这类独立命令更新。

### 7.2 创建任务

```text
tuteur task create
 -> 创建任务目录
 -> 写入任务元数据
 -> 初始化 workflow state
```

### 7.3 完成 Step

```text
tuteur complete <step>
 -> 确认 step 属于当前 phase
 -> 检查 required artifacts
 -> 执行 command checks
 -> 检查 approval
 -> 标记 step completed
 -> 必要时推进 phase
 -> 必要时更新 task status
```

这是 Tuteur 的核心门禁流程。

### 7.4 Dashboard 启停

```text
tuteur dashboard start
 -> 解析项目根目录
 -> 读取 dashboard 配置
 -> 后台启动 Next standalone server
 -> 写入 runtime pid/port/log 信息
 -> 输出 dashboard URL
```

```text
tuteur dashboard stop
 -> 读取 runtime pid
 -> 停止后台进程
 -> 清理 stale runtime 文件
```

Dashboard 只监听 `127.0.0.1`，不默认暴露到公网。

### 7.5 Agent Run

```text
启动 agent run
 -> 解析 task/phase/step
 -> 计算 planned context
 -> 启动 agent adapter
 -> 写入 run log
 -> 记录 run metadata
 -> 提醒 agent 调用 tuteur complete <step>
```

MVP 是否提供 `tuteur run <step>` 命令，可以后续再确认。

## 8. 与 Trellis 的关系

借鉴 Trellis：

- repo-native 的 spec/task 组织方式。
- 任务目录内保存 PRD、research、implement/check 上下文。
- Plan、Implement、Verify、Finish 的阶段化工作流。
- 多 agent 生态适配思路。
- `init` 期间基于用户选择的平台写入对应 agent 配置、skills、commands、agents、hooks。

区别于 Trellis：

- Trellis 更偏 prompt/workflow 文档和多平台初始化。
- Tuteur 更强调结构化 workflow 状态机和完成门禁。
- Trellis 可以生成 agent 文件；Tuteur 第一阶段只安装默认 skill 并做薄平台适配。
- Tuteur 的 phase/step 推进由 CLI-owned workflow 逻辑控制，不依赖 agent 自觉遵守 Markdown。

Trellis 的 `init` 不是简单复制几份 Markdown。它大致做了这些事：

- 维护一个 AI tool registry，声明每个平台的 `configDir`、templateDirs、hook 能力、是否支持共享 `.agents/skills`。
- 交互或通过 flag 选择平台，例如 Claude、Codex、Cursor、Gemini。
- 支持初始化当前 developer identity，并把该身份保存在本地忽略文件中。
- 创建 `.trellis/` 工作流目录、spec、tasks、scripts、config。
- 按平台执行 configurator，例如 Claude 写 `.claude/agents`、`.claude/commands`、`.claude/hooks`、`.claude/settings.json`、`.claude/skills`；Codex 写 `.agents/skills`、`.codex/skills`、`.codex/agents`、`.codex/hooks`、`.codex/hooks.json`、`.codex/config.toml`。
- 生成 bootstrap / joiner task，帮助第一次初始化或新成员加入时补齐项目规范。
- 在任务命令中支持 “mine” 视角，按当前 developer 过滤任务。
- 记录 template hashes，用于后续 update 时判断哪些文件是模板管理的。

Tuteur 第一阶段不需要完整复刻 Trellis 的所有平台适配，但 init 结构应该向这个方向靠拢：先有 platform registry，再由 configurator 做平台适配；同时保留本地 user identity，用于 dashboard 和后续 task command 的 `mine` 过滤。和 Trellis 不同的是，Tuteur 的 skill 本体先统一安装到 `.agent/skill`，平台目录尽量用软链或薄适配层引用它。

## 9. 第一阶段实施边界

第一阶段只做骨架和核心闭环：

1. 搭建 workspace：`cli`、`app`。
2. 实现 `.tuteur/` 初始化。
3. 准备默认 agent skill/command 模板。
4. 实现 `tuteur init` 的 agent 选择和默认 skill 安装。
5. 实现 task create/list/status/archive。
6. 实现 workflow 读取和基础校验。
7. 实现 `complete <step>` 门禁。
8. 实现 dashboard start/stop。
9. 实现 dashboard 任务列表和任务详情。
10. 实现 run 记录模型。
11. 接入第一个 Codex adapter。

第一阶段暂不做：

- Trellis import。
- YAML workflow。
- 复杂 workflow 编辑器。
- 复杂 artifact schema。
- 多 agent adapter。
- 云同步。

## 10. 待确认问题

- Node.js 最低版本是否定为 20。
- 第一个 agent adapter 是否确定为 Codex。
- `tuteur run <step>` 是否进入 MVP。
- Dashboard 是否允许编辑 artifact，还是第一版只查看。
- `dashbord` alias 是否长期保留，还是只作为早期兼容。
- `.tuteur/runtime/` 是否默认写入 `.gitignore`。

## 11. 信息来源

本设计基于：

- 本仓库 `PRD.md`。
- `mindfold-ai/Trellis` GitHub 仓库公开内容，包括 README、根目录结构、`.trellis/` 结构、`packages/cli` 结构、`packages/cli/src/commands`、`packages/cli/src/configurators`、`packages/cli/src/templates`、`packages/cli/src/utils` 和 `pnpm-workspace.yaml`。
