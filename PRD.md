# Tuteur 产品需求文档

## 1. 产品概述

Tuteur 是一个本地优先的 CLI 工具和可视化控制台，用于编排、执行、观察和审计 AI coding agent 的工作流。

它面向 Codex、Claude Code、Gemini CLI 等 AI 编码工具，目标不是替代这些 agent，而是在它们之上提供一个更强约束的 harness 层：由 Tuteur 管理任务状态、工作流阶段、阶段产物、执行记录和流转条件；由具体 agent 负责完成某个阶段内的实际工作。

核心想法是：不要只用 Markdown 告诉 AI “应该怎么做”，而是用结构化 workflow 定义任务生命周期，让 harness 判断当前阶段是否完成、产物是否齐全、是否允许进入下一步。

## 2. 背景

Trellis 这类工具证明了 AI 编码工作需要任务化、阶段化和产物化。它通过 `.trellis/tasks`、`prd.md`、`implement.jsonl`、`check.jsonl`、skill、hook 和 workflow 文档，让 agent 更容易围绕一个明确任务工作。

但在实际使用中，仍然存在一个关键问题：当工作流主要由 Markdown 描述时，规范对 agent 来说偏弱。AI 可能跳过阶段、忘记调用 skill、没有生成必要产物、没有执行检查，或者在需求还不清楚时直接进入实现。

Tuteur 试图把这部分变成更强的系统约束：

- 工作流由 JSON 或 YAML 定义。
- 每个阶段由一组必须按顺序完成的 step 组成。
- 每个 step 可以引用用户现有的 agent skill，并定义必需产物、检查命令和人工确认条件。
- 任务状态由 harness 控制，而不是完全依赖对话上下文。
- UI 可以看到每个任务走到哪一步、产物有哪些、哪次 agent run 成功或失败。
- skill 仍由具体 agent 生态管理，Tuteur 只负责发现、引用和编排，不在 `.tuteur/` 内定义 skill。

## 3. 问题陈述

AI coding agent 能力很强，但在多阶段产品研发任务中仍然不够可控。

当前主要痛点：

- 用 Markdown 描述工作流时，AI 经常只部分遵守。
- 用户很难一眼看到项目下每个任务的状态。
- PRD、设计文档、调研记录、测试用例、review 结果、实现总结分散在不同文件和聊天上下文中。
- 不同 agent 的命令系统、hook、skill、上下文注入方式差异很大。
- 任务整体状态、当前 workflow 阶段和 step 完成情况缺少统一视图。
- agent 每次执行后的日志、产物和失败原因缺少一致的审计记录。

## 4. 目标用户

主要用户：

- 高频使用 AI coding agent 的个人开发者。
- 正在尝试 agent 驱动开发流程的小型工程团队。
- 希望把 PRD、设计、实现、验证流程标准化的技术负责人或产品型工程师。

早期用户大概率已经使用过 Codex、Claude Code、Gemini CLI、Cursor、Trellis 等工具，并且感受到“提示词流程”不够稳定的问题。

## 5. 产品目标

Tuteur 需要做到：

- 提供简单 CLI，用于初始化项目、创建任务、运行工作流、查看状态和归档任务。
- 提供本地可视化 UI，展示任务、阶段、产物、日志和 agent run。
- 使用结构化 workflow 作为工作流唯一事实源。
- 发现当前项目下 agent 已有的 skill，并在 workflow step 中引用这些 skill。
- 跟踪每个 step 要求的产物、检查命令和人工确认条件。
- 当必需产物或检查条件缺失时，阻止任务进入下一阶段。
- MVP 至少支持一个 AI coding agent，后续通过 adapter 扩展到更多 agent。
- 将任务状态和产物存储在项目仓库内，便于查看、迁移和版本管理。
- 支持本地用户初始化，并在 UI 中按当前用户过滤自己创建或分配给自己的任务。

## 6. MVP 非目标

第一版不解决以下问题：

- 云同步。
- 多用户权限系统。
- 服务端账号体系。MVP 的用户隔离只是本地 developer identity 和任务过滤，不做访问控制。
- 企业级审计和合规。
- 替代 Jira、Linear、GitHub Issues 等任务系统。
- 深度支持所有 AI coding agent。
- 任意复杂分支的完整可视化工作流编辑器。
- 在 `.tuteur/` 中定义或编辑 agent skill。
- 复杂 artifact schema 校验。
- 托管 SaaS 控制台。

## 7. 核心概念

### 7.1 Project

被 Tuteur 初始化过的代码仓库。项目根目录下包含 `.tuteur/`，用于保存 workflow 定义、任务记录、运行时状态和本地配置。

`.tuteur/` 不保存 skill 本体。Tuteur 默认 skill 本体放在 `.agent/skill/`；具体 agent 目录只作为适配层，例如 Claude 可选择 `.claude/skills/*` 软链到 `.agent/skill/*`，也可以直接复制生成。

每个开发者可以在本机初始化一个本地用户身份。该身份写入 `.tuteur/.user`，并被 `.tuteur/.gitignore` 忽略，不进入共享仓库事实源。共享任务仍通过 `task.json` 中的 `creator`、`assignee` 等字段表达归属。

### 7.2 Task

一个可追踪的工作单元。每个任务绑定一个 workflow，并记录状态、当前 workflow 进度、产物、运行记录和元数据。

MVP 只内置三个任务状态：

- `planning`：任务已创建，正在明确需求、计划和上下文。
- `in_progress`：任务已进入执行流程，正在按 workflow 推进。
- `completed`：任务绑定的 workflow 已全部完成。

`archived` 不是任务状态。归档只是把已完成任务移入 archive 目录，或记录 `archivedAt`。

### 7.3 Workflow

结构化的工作流定义，描述任务会经过哪些 phase、每个 phase 包含哪些 step、每个 step 引用哪个 skill、需要哪些产物和检查条件。

Phase 建议字段：

- `id`
- `name`
- `description`
- `steps`

Step 建议字段：

- `id`
- `skillRef`
- `required`
- `requiredArtifacts`
- `checks`
- `approvalRequired`

当当前 phase 的所有 required step 都完成后，Tuteur 自动推进到下一个 phase，不需要额外命令。

### 7.4 Skill

可复用的 agent 能力。Skill 由具体 agent 生态定义和维护，Tuteur 不重新定义 skill 格式。

Tuteur 可以扫描当前项目中已有的 skill，供 workflow 通过 `skillRef` 引用。Skill 内部描述“应该怎么做”，Tuteur 只负责保证 workflow 中要求经过的 step 不能被跳过。

### 7.5 Artifact

工作流 step 产生的文件。MVP 只支持文件型 artifact。

`requiredArtifacts` 的路径相对当前 task 目录。默认任务产物参考 Trellis 的任务目录组织方式，并按 UI 展示需要区分 Markdown 和 JSON：

- `prd.md`：需求说明，记录目标、范围、用户故事、约束和验收口径。
- `design.md`：实现设计，记录方案、影响范围、数据流、接口变化和风险。Trellis 当前常见等价文件是 `info.md`，Tuteur 默认使用更明确的 `design.md` 命名。
- `checklist.json`：功能验收清单，用结构化 JSON 表达测试点、验收项、状态和责任方，方便 UI 展示和勾选。
- `implement.json`：实现阶段上下文清单。它不是实现结果，而是列出 dev/implement step 必须优先阅读的 spec、research、design 等文件。
- `check.json`：检查阶段上下文清单。它列出 check step 必须优先阅读的 spec、research、checklist 等文件。
- `research/*.md`：调研产物，按主题拆分。
- `check-result.json`：检查结果摘要，用结构化 JSON 记录测试、lint、typecheck 和人工验收项的结果。

文档类内容优先使用 Markdown，便于 agent 阅读和用户编辑。需要 UI 展示、筛选、勾选、统计或校验的内容优先使用 JSON。

Tuteur 参考 Trellis 的 implement/check 上下文清单概念，但默认不使用 JSONL。不同阶段或 step 的 agent 注入上下文应使用不同 JSON 文件，例如 `implement.json` 和 `check.json`，避免把所有上下文混进一个总文件。

`tuteur complete <step>` 会检查这些文件是否存在。MVP 不提供 artifact 登记命令，也不做复杂 schema 校验。

### 7.6 Spec 与上下文管理

Tuteur 需要像 Trellis 一样维护项目规范和长期上下文。它不只关心当前任务产物，也要让用户明确管理“会话开始时 hook 默认加载哪些规范”和“每次 agent run 实际读到了哪些上下文”。

项目规范放在 `.tuteur/spec/` 下，例如：

```text
.tuteur/spec/
  frontend.md
  backend.md
  testing.md
  product.md
```

MVP 的上下文管理规则：

- `.tuteur/spec/` 存放项目级规范、约定、经验和长期上下文。
- `.tuteur/context.json` 存放 hook/session-start 的默认注入配置。
- 用户可以在 UI 中启用、禁用或调整某个 spec 是否默认注入。
- 用户可以标记某些 spec 为必读，要求 agent 会话开始时默认加载。
- 用户可以按 agent、workflow 或 phase 配置不同的默认注入集合。
- Tuteur 需要记录每次 agent run 实际注入或读取过哪些 spec、task artifact 和 research 文件。
- UI 需要能展示“计划注入的上下文”和“本次 run 实际注入的上下文”之间的差异，帮助用户发现 hook 未生效或上下文缺失。

`.tuteur/context.json` 示例：

```json
{
  "default": {
    "required": [".tuteur/spec/product.md", ".tuteur/spec/testing.md"],
    "optional": [".tuteur/spec/frontend.md", ".tuteur/spec/backend.md"],
    "disabled": []
  },
  "agents": {
    "dev": {
      "required": [".tuteur/spec/frontend.md"]
    },
    "check": {
      "required": [".tuteur/spec/testing.md"]
    }
  }
}
```

### 7.7 Check

Step 可以定义检查命令。MVP 只支持 command check，并只看退出码：

- 退出码为 0：通过。
- 退出码非 0：失败。

检查失败时，`tuteur complete <step>` 必须失败，并显示失败命令和输出摘要。

### 7.8 Approval

人工确认由 UI 完成，不提供 CLI approval 命令。

当某个 step 需要人工确认时，`tuteur complete <step>` 只读取确认状态。如果确认尚未完成，命令失败并提示等待 UI approval。

### 7.9 Run

某个 agent 对某个阶段或 skill 的一次执行尝试。Run 需要记录 agent、命令、开始时间、结束时间、状态、日志、生成产物和失败原因。

## 8. MVP 功能范围

### 8.1 CLI

第一版需要支持：

```bash
tuteur init
tuteur init -u "yan"
tuteur task create "任务标题"
tuteur task list
tuteur task list --mine
tuteur task status <task>
tuteur complete <step>
tuteur task archive <task>
tuteur ui
```

可选增强命令：

```bash
tuteur workflow validate
tuteur skill list
tuteur run list <task>
```

### 8.2 本地目录结构

建议结构：

```text
.tuteur/
  .gitignore
  .user
  config.json
  context.json
  spec/
    product.md
    testing.md
  workflows/
    default.workflow.json
  tasks/
    2026-06-11-example-task/
      task.json
      state.json
      prd.md
      design.md
      checklist.json
      implement.json
      check.json
      check-result.json
      research/
      runs/
        001.json
        001.log
  runtime/
  workspace/
    yan/
      index.md
```

`.tuteur/.user`、`.tuteur/runtime/` 和 `.tuteur/workspace/` 是本地状态，默认不提交。`config.json`、`context.json`、`workflows/`、`spec/` 和 `tasks/` 是共享项目状态。

### 8.3 默认工作流

第一版默认 workflow 保持简单，并用 step 串起已有 skill：

1. Planning：`brainstorm` -> `grill-me`
2. Execute：`dev` -> `check`
3. Finish：`finish`

每个 step 可以定义必需产物、检查命令和人工确认条件。例如：`brainstorm` 不能在 `prd.md` 缺失时完成；`grill-me` 不能在 planning 阶段完整产物缺失时完成。

Planning 阶段需要把任务上下文准备充分：

- `brainstorm` 产出初始 `prd.md`。
- `grill-me` 追问并压实计划，最终补齐 `prd.md`、`design.md`、`checklist.json`、`implement.json` 和 `check.json`。

默认 workflow 不把 `design`、`checklist`、`context`、`confirm-plan` 拆成独立 step。它们是 planning 阶段应完成的产物和校验条件，而不是默认流程里的额外动作。

`tuteur complete <step>` 是 agent 推进 workflow 的统一入口。它会读取 workflow 定义并执行校验：

- `<step>` 必须属于当前 phase。
- 必需 artifact 必须存在。
- command check 必须返回 0。
- 需要人工确认的 step 必须已在 UI 中确认。
- 校验通过后记录 step completed。
- 当前 phase 的所有 required step completed 后，自动进入下一 phase。
- Planning phase 完成并进入 Execute phase 时，任务状态从 `planning` 更新为 `in_progress`。
- 整个 workflow 完成后，任务状态更新为 `completed`。

### 8.4 可视化 UI

UI 首要目标是清晰，不是装饰。

初始页面：

- 任务列表：按状态分组展示任务。
- 用户过滤：读取 `.tuteur/.user`；初始化过用户时默认显示 `My tasks`，只展示 `creator` 或 `assignee` 匹配当前用户的任务；用户可以切换到 `All tasks`。
- 任务详情：展示当前 phase、step 完成情况、产物列表和 run 记录。
- 工作流视图：展示任务当前处于哪个阶段。
- 产物查看器：查看 `prd.md`、`design.md`、`research/*.md` 等 Markdown 文档，以及 `checklist.json`、`check-result.json` 等结构化结果。
- Spec 与上下文管理：查看 `.tuteur/spec/`，配置 hook/session-start 默认注入哪些规范，查看每次 run 实际注入或读取过的上下文文件。
- 执行日志：查看 agent run 的命令、输出、错误和结果。
- Approval 面板：人工确认计划产物或其他需要确认的 checkpoint。

### 8.5 Agent Adapter

MVP 只支持一个 agent，建议优先选择 Codex 或 Claude Code。

Adapter 需要负责：

- 启动一次 agent run。
- 把当前 task、phase、step、skill 和 artifact 上下文传给 agent。
- 根据 `.tuteur/context.json` 和当前 workflow 信息准备会话开始时默认注入的 spec/context。
- 捕获执行日志。
- 判断执行成功或失败。
- 写入 run 元数据，包括计划注入和实际注入/读取的 spec、task artifact、research 文件列表。
- 提醒 agent 使用 `tuteur complete <step>` 尝试完成当前 step。

## 9. Workflow JSON 示例

```json
{
  "id": "default",
  "name": "Default Coding Workflow",
  "version": "0.1.0",
  "phases": [
    {
      "id": "planning",
      "name": "Planning",
      "steps": [
        {
          "id": "brainstorm",
          "skillRef": "brainstorm",
          "required": true,
          "requiredArtifacts": ["prd.md"]
        },
        {
          "id": "grill-me",
          "skillRef": "grill-me",
          "required": true,
          "requiredArtifacts": ["prd.md", "design.md", "checklist.json", "implement.json", "check.json"]
        }
      ]
    },
    {
      "id": "execute",
      "name": "Execute",
      "steps": [
        {
          "id": "dev",
          "skillRef": "dev",
          "required": true
        },
        {
          "id": "check",
          "skillRef": "check",
          "required": true,
          "requiredArtifacts": ["check-result.json"],
          "checks": [
            {
              "id": "tests",
              "type": "command",
              "command": "npm test"
            }
          ]
        }
      ]
    },
    {
      "id": "finish",
      "name": "Finish",
      "steps": [
        {
          "id": "finish",
          "skillRef": "finish",
          "required": true
        }
      ]
    }
  ]
}
```

## 10. UX 原则

- 第一屏展示真实任务，不做营销页。
- 用户随时知道当前活跃任务、所在 phase 和下一个 step。
- 缺失产物必须明显可见，并能直接定位。
- agent 日志不需要用户手动翻多个文件。
- 编辑 workflow 应该比编辑长篇 Markdown 指令更安全。
- 产品保持 local-first 和 repo-native。

## 11. 成功标准

MVP 完成的判断标准：

- 用户可以在任意代码仓库执行 `tuteur init`。
- 用户可以通过 `tuteur init -u <name>` 初始化本地身份，并在 UI 中切换 `My tasks` / `All tasks`。
- 用户可以创建任务，并在 UI 中看到任务。
- 一个任务可以走完 Planning、Execute、Finish 三个 phase。
- Planning phase 至少能产出 `prd.md`、`design.md`、`checklist.json`、`implement.json` 和 `check.json`。
- 用户可以在 UI 中管理 `.tuteur/spec/` 和 `.tuteur/context.json`，并看到每次 run 实际注入或读取过的上下文。
- 缺失必需产物、检查失败或等待人工确认时，系统能阻止 step 完成和 phase 流转。
- 至少一个 agent 可以通过 harness 被调用。
- 每次 agent run 都有日志和元数据。
- UI 能准确展示任务状态、当前 phase、step 完成情况、产物、approval 和执行结果。

## 12. 开放问题

- 第一个 agent 应优先支持 Codex 还是 Claude Code？
- Workflow 定义只支持 JSON，还是同时支持 YAML？
- Skill 发现范围应该默认包含哪些 agent 目录？
- 是否需要兼容 Trellis 的 `.trellis/tasks`，还是保持独立结构？
- UI 第一版用本地 Web 页面，还是先做 Terminal UI？

## 13. 路线图

### Milestone 1：本地骨架

- 创建 `.tuteur/` 项目结构。
- 添加默认 workflow schema。
- 实现 task create/list/status 和 `complete <step>` 命令。
- 实现 workflow 和 task 文件校验。

### Milestone 2：可视化任务面板

- 启动本地 Web UI。
- 按状态展示任务列表。
- 展示任务详情、产物、当前 phase、step 状态和 run 历史。
- 支持在 UI 中完成 approval。
- 支持查看和调整 `.tuteur/spec/`、`.tuteur/context.json` 的默认注入配置。

### Milestone 3：第一个 Agent Adapter

- 支持一个 agent。
- 通过 adapter 执行一个 workflow step。
- 捕获日志、run 元数据和本次实际注入/读取的上下文文件列表。
- 用必需产物、检查命令和 approval 控制 step 完成和 phase 流转。

### Milestone 4：Skill 发现

- 扫描当前项目下 agent 已有的 skill。
- 在 UI 中展示 workflow 引用的 skill 是否存在。
- 支持 workflow step 通过 `skillRef` 绑定外部 skill。

### Milestone 5：Workflow 编辑

- 可视化展示 workflow graph。
- 校验阶段流转规则。
- 支持在 UI 中编辑基础阶段配置。

## 14. 命名

当前工作名：Tuteur。

选择原因：

- 语义上接近 Trellis，都是给生长中的东西提供支撑。
- 不直接使用 workflow、agent、harness 等工程化词汇。
- 适合作为 CLI 和可视化产品的共同品牌。
- 有“引导、支撑、约束但不替代”的感觉。

最终命名前仍需要检查 npm 包名、GitHub 组织/仓库名、域名和商标风险。
