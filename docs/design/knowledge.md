# 知识库设计(Knowledge Base)

> 适用范围:`.tuteur/knowledge/`(项目)与 `~/.tuteur/knowledge/`(全局)两级知识库,及其与上下文注入、skill、hook、web 的衔接。
> 定位:实施规格级。数据读写仍走 [@tuteur/core](./core.md)(铁律:除 `core/store/*` 外不碰盘);本文定义 KB 的目录模型、条目 schema、维护操作与注入接入。
> 设计来源:karpathy「LLM Wiki」模式(`gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`)—— LLM 增量维护一个持久、复利的 wiki,而非每次 RAG 重检索;**人选源/提问/审阅,agent 做全部 bookkeeping**。
> 先读 [INDEX.md](./INDEX.md);注入策略与 hook 见 [harness.md §4/§6](./harness.md);web 管理界面见 [web.md](./web.md)。

---

## 1. 为什么要知识库(对应 PRD §7.7 上下文管理)

会话注入的内容不该是散落的文件路径硬编码。Tuteur 需要一个**可积累、可复用、可被 UI 管理**的知识源:会话开始时注入「必要索引」,agent 按需读全文;每个人/每个项目/每个节点想注入的内容不同,且必须**可见、可改、可管理**。

借 karpathy 的洞察:知识库的难点不是阅读和思考,而是 **bookkeeping**(更新交叉引用、保持摘要最新、标记矛盾、维持一致性)——人会因维护负担放弃 wiki,而 LLM 不会累、一次能改 15 个文件。所以 Tuteur 的知识库由 **agent 维护文件、人审阅方向**,维护协议写在 `tuteur-knowledge` skill 里(harness §5)。

---

## 2. 统一路径与目录布局(全局/项目同构)

两级知识库用**同一相对布局**,只是挂在不同 scope 根下(对齐 core.md §2 双层模型):

```text
<scope-root>/knowledge/         # 全局 = ~/.tuteur/knowledge/   项目 = <repo>/.tuteur/knowledge/
  sources/                      # 原始源(只读、不可变):文章/论文/导出/转录;agent 只读不改
  wiki/                         # LLM 维护的页:摘要页、实体页、概念页、对比页、综述
    <id>.md                     #   根级页,带 frontmatter(§4)
    <topic>/                    #   子领域子目录(仅当某领域页变多时才开,§6.1)
      index.md                  #     该子目录索引:只列本目录直接子项
      <id>.md
      <subtopic>/               #     可再嵌套,每级一个 index.md
        index.md
        <id>.md
  index.md                      # 根目录索引(catalog 入口):顶层页按类别分组 + 链向各子目录索引(§6.1)
  log.md                        # 时间线(追加式):ingest/query/lint 记录,前缀可 grep
```

- **全局 `~/.tuteur/knowledge/`**:跨项目复用的个人知识——编码规范、长期偏好、通用参考。属单人区,不过滤用户(core §2.1)。在 home 自有命名空间下,不碰各 agent 的 `~/.claude` 等(§2.3 安全边界)。
- **项目 `<repo>/.tuteur/knowledge/`**:本仓库特定知识——架构、领域模型、约定、踩坑。随仓库提交,团队共享(core §2.2)。

> 统一点:**同一子树形状、同一条目 schema、同一维护 skill、同一注入解析**——区别只在 scope 根与「是否过滤用户」。

---

## 3. 三层模型(karpathy → Tuteur 映射)

| karpathy 层     | 是什么                                                                | Tuteur 落点                                                                         |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Raw sources** | 不可变源文档,事实源,LLM 只读                                          | `knowledge/sources/`                                                                |
| **The wiki**    | LLM 生成/维护的 md 页(摘要/实体/概念/综述),带交叉引用                 | `knowledge/wiki/`(可分子目录)+ 每级 `index.md` + 根 `log.md`                        |
| **The schema**  | 告诉 LLM「wiki 怎么组织、约定是什么、ingest/query/lint 怎么走」的配置 | **`tuteur-knowledge` skill**(替代 karpathy 的 CLAUDE.md/AGENTS.md),随项目 init 落地 |

Tuteur 的关键改写:karpathy 把 schema 放在 `CLAUDE.md`;Tuteur 把它放进**结构化 skill**,这样多 agent(Codex/Claude/Gemini)共用同一份维护协议,且能被 workflow 引用、被 `discoverSkills` 发现(cli §8.6)。

---

## 4. 知识条目 schema(wiki 页 frontmatter)

每个 `wiki/<id>.md` 顶部带 frontmatter,供 UI 列表/筛选、供注入决定「注索引还是全文」:

```yaml
---
id: api-conventions # 稳定标识(注入/`[[链接]]` 按 id 引用,文件改名或移子目录不破)
title: API 设计约定
scope: global | project # 来源层(由所在 scope 根决定,落盘冗余以便聚合展示)
kind: summary | entity | concept | comparison | spec | overview | log | template
tags: [backend, convention]
summary: REST 命名、错误码、分页规范 # 一行;注入「索引模式」时只注 summary+路径
inject: full | index # 注入形态(§4.1/§7);缺省 index。full=注正文(短而必读),index=注 summary+路径(长文档按需下钻)
sources: [sources/rest-rfc.md] # 该页综合自哪些原始源(可追溯)
injectByDefault: false # 是否进默认注入集(§7)
format: md # 渲染格式;缺省 md。未来可扩展(json 表/图片/pdf),web 按此选渲染器(§10)
updated: 2026-06-13
---
```

`index.md` 是这些 frontmatter 的聚合目录(内容导向);`log.md` 是操作时间线(时间导向)。两者让 agent 在 wiki 变大后仍能「先读 index 定位、再下钻」,**moderate 规模(~百源/百页)无需 embedding RAG**(karpathy 实证)。当前知识页几乎都是 Markdown(`format: md`);web 先只渲染 md,其它格式留扩展位(§10)。

### 4.1 一种「非源生」条目:template(承载产物模板)

知识库除了 karpathy 式的「源→wiki」页,还**复用同一套基建**承载产物模板,不另造目录或数据结构:

| 用途         | `kind`     | 典型 id                           | `inject`       | 谁消费                                                                                                            |
| ------------ | ---------- | --------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| **产物模板** | `template` | `design-template`、`prd-template` | 由引用方按需注 | workflow `gate.artifacts[].template` 引用(core §4.3.1);web 画布节点预览/编辑;session-start 走到该节点时注模板正文 |

- **产物模板**回答「design.md 该长什么样」:正文就是一份带章节骨架的 Markdown 模板。`grill-me` 等 skill 在 prompt 里写「按 `design-template` 的结构写 `design.md`」,而 workflow 走到声明了 `template:"design-template"` 的节点时,session-start 把这条模板正文一并注入——**产物格式被真正注入,不只靠 skill 提醒**。它是普通知识条目:web 知识库页直接 CRUD/渲染,改模板不动 skill、不动 workflow。
- 默认写项目库(随仓库共享);个人通用模板放全局库(§8)。`tuteur-knowledge` skill 的维护协议对它一视同仁。

> **会话须知(guide.md)不在知识库**:它是工具自身要用的开场上下文,放工具目录文件 `.tuteur/guide.md`(session-start 直接读、注全文,harness §6.4),用户直接编辑;不走知识库、不进 `context.json`。这条与「这是 tool 要用的上下文,不是知识」的直觉一致(对齐 Trellis 把 workflow/spec 直接放 `.trellis/` 工具目录的做法)。

---

## 5. 维护操作(由 `tuteur-knowledge` skill 驱动)

三个操作对齐 karpathy,写进 skill 正文(当前为占位,harness §5 / cli 模板):

- **Ingest(纳入)**:用户把源放进 `sources/` 并示意处理 → agent 读源 → 与用户对齐要点 → 写/更新 `wiki/` 摘要与相关实体/概念页 → 更新 `index.md` → 追加 `log.md`。一个源可能触及 10–15 页。
- **Query(查询)**:先读 `index.md` 定位 → 下钻相关页 → 带引用综合作答。**好的回答回填成新 wiki 页**(对比、分析、发现的关联),使探索像 ingest 一样复利,不消失在聊天里。
- **Lint(体检)**:周期性健康检查——矛盾、被新源推翻的过期断言、孤儿页(无入链)、被提及却没有独立页的概念、缺失交叉引用、可补的空白。

不变量(karpathy):**人负责选源、定方向、提好问题、审阅;agent 负责其余一切**(摘要、交叉引用、归档、保持一致)。

---

## 6. 多级索引、日志与检索约定

### 6.1 每层一个 `index.md`(渐进披露)

检索入口是**目录索引**,不是搜索引擎(§6.3)。借 OKF 的做法:**每个含页的目录都带一个 `index.md`,只列「本目录的直接子项」**(页 + 子目录),让 agent/人一层层下钻,而非把整库塞进上下文。

- **根索引 `knowledge/index.md`**:catalog 入口、agent 导航起点。按类别(entities / concepts / sources / specs / templates…)分组列顶层页,并为每个 `wiki/` 子目录列一行链接+摘要。
- **子目录索引 `wiki/<topic>/index.md`**:只列该子目录的直接子项(页 + 下一级子目录),不递归展开孙级。
- **行格式**:`- [标题](相对路径) — 一句话摘要`;页链相对文件(`<id>.md`),子目录链目录(`<topic>/`),摘要取自页 frontmatter `summary`。
- **无 frontmatter**:`index.md` 本身不带 frontmatter,纯导航(对齐 OKF)。
- **确定性生成**:各级 `index.md` 由 `ttur knowledge index` 据 frontmatter **重算**(§9),不手维护——多级手维护必漏页。
- **何时开子目录**:**默认全平铺在 `wiki/` 根**;只有某领域页数多到根索引扫不动时,才收进一个 `wiki/<topic>/`(避免过度设计)。
- **id 与路径解耦**:页移进/移出子目录,frontmatter `id` 与正文 `[[id]]` 引用都不破(按 id 解析,§4/§5);只有 `index.md` 的相对路径变,而它由命令重算,无需人管。

### 6.2 `log.md`(时间线)

追加式,每条以一致前缀开头便于 `grep "^## \[" log.md | tail -5`:

```text
## [2026-06-13] ingest | API 设计约定   (touched: api-conventions, error-codes, index)
## [2026-06-13] query  | 分页方案对比   (filed: pagination-comparison)
## [2026-06-13] lint   | 3 orphans, 1 stale claim flagged
```

### 6.3 检索 = agent 自己读文件(不设 search 命令)

主消费者是**在本仓库内、自带文件工具(Read/Grep/Glob)的编码 agent**,直接读 `.tuteur/knowledge/`,无需 Tuteur 提供搜索。检索动作是**导航**:

1. 读根 `index.md` 定位(session-start 已告知知识库位置并注入根索引摘要)。
2. 下钻相关页 / 子目录 `index.md`。
3. 顺正文 `[[id]]` 链接跳邻居(一两跳)。
4. 需要时用 agent 自带 grep 在 `knowledge/` 内补刀。

> **两个 index 别混**:`context.json`(§7)是**注入集**(push,会话起点推给 agent 的策划子集);`index.md` 是**目录索引**(pull,agent 据此发现并按需读其余页)。前者是必读的少数,后者是全量地图。

**为何不设 `ttur knowledge search`**:agent 原生文件工具比再包一层更强,也省去索引引擎/外部 CLI 的复杂度与耦合。检索升级只在被逼时做(§9 末)。

---

## 7. 注入接入(context.json 分层 + 注索引)

知识库是「有什么」,`context.json`(core §4)是「注什么、按哪步」,二者分离。注入按**知识 id** 引用(不写文件路径,文件改名不破),`context.json` 分两层:

```jsonc
{
  "default": { "required": ["api-conventions"], "optional": ["db-schema"], "disabled": [] },
  "nodes": { "dev": { "required": ["api-conventions", "test-policy"] } }, // 按节点差异化
}
```

> **不设用户级覆盖层**:个性化由全局/项目两级天然承载——**全局库即用户专属**(本机单人,§8),**项目库即团队公用**(随仓库共享)。所以"每个人想注入的内容不同"靠各自的全局库实现,`context.json` 只描述项目共享的注入策略(default + 按节点),不区分人。

`core.resolvePlannedContext(scope, taskId, node)` = **合并(全局 injectByDefault → 项目 default → 当前 node)** → 产出本次会话注入清单。`ttur hook session-start` 据此拼 `<required-context>` 段(harness §6.4):

- 注入形态**由条目 `inject` 字段决定**(§4):`inject:index`(缺省)只注 `title + summary + 路径`,agent 按需读全文——省 token、保留线索(同 karpathy 的「先 index 后下钻」、Trellis 的「spec index + Pre-Development Checklist」);`inject:full`(产物模板、必读短规范等)注正文。`resolvePlannedContext` 返回带形态的 `PlannedEntry[]`(core §6),session-start 据形态拼块。会话须知(guide.md)不在此机制内,见 §4.1。
- 条目可标必读(`required`),session-start 把必读项显式列出。
- 实际注入清单回写 `session_start` 事件(`injected`),供 web「计划 vs 实际」diff(harness §6.4、web §3)。

---

## 8. 全局 vs 项目分工

|            | 全局 `~/.tuteur/knowledge/`                    | 项目 `<repo>/.tuteur/knowledge/`             |
| ---------- | ---------------------------------------------- | -------------------------------------------- |
| 归属       | **用户专属**(本机单人,天然是「我」的)          | **团队公用**(随仓库共享)                     |
| 内容       | 跨项目复用:个人规范、偏好、通用参考            | 本仓库:架构、领域、约定、踩坑                |
| 注入优先级 | 底层默认(injectByDefault),始终是当前用户自己的 | 项目共享策略(default + 按节点),补充/覆盖全局 |
| 提交       | 不进任何仓库(本机)                             | 随项目仓库提交                               |

**个性化即靠这两级**:不同人有不同的全局库、共享同一个项目库——所以不需要在 `context.json` 里再分用户(§7)。新项目 init 时,全局 `knowledge/` 可作为模板候选播种项目(同 workflow 模板的做法,core §2.1)。

**agent 默认写项目库**(`tuteur-knowledge` skill 约定):大多数 ingest 是本仓库的东西,只有用户明说「记到我的全局/个人知识库」时才动 `~/.tuteur/knowledge/`。判断启发式:**这条知识换个项目还成立吗?成立 → 全局;只对本仓库有意义 → 项目。** 命令同理(默认项目,`--global` 切,§9)。

---

## 9. 检索/维护命令(分 scope)

agent 维护知识库以**直接写文件**为主(karpathy 模型,协议在 `tuteur-knowledge` skill);命令只固化**维护侧的确定性 bookkeeping**——「目录、图谱、体检」是机械计算,用代码做比让模型做更可靠(准则:确定性优先)。**检索不在命令里**:agent 自带文件工具直接读 `knowledge/` 导航(§6.3),不设 `search` 命令、不内置 RAG/图引擎(karpathy:百页规模 index+链接足够)。

**核心原则:两级知识库结构完全相同、各自独立;命令永远只作用在一个 scope,`--global` 切换,默认当前项目。** scope 解析复用 `resolveProjectScope`(从 cwd 向上找 `.tuteur/`),与 `ttur init --global` 同语义。

| 命令                                                  | 作用                                                                                                                      | scope                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `ttur knowledge graph [--global] [--merged] [--json]` | 从 `[[链接]]`+frontmatter `sources` **派生**文档关系图(节点/边);供 web 图谱视图 + lint                                    | 默认项目;`--global` 全局;`--merged` 全景(下) |
| `ttur knowledge index [--global]`                     | 据各页 frontmatter **确定性重算各级 `index.md`**(根 catalog + 各 `wiki/` 子目录索引);agent ingest 后调,避免多级手维护漏页 | 默认项目;`--global` 全局                     |
| `ttur knowledge lint [--global]`                      | 机械体检:孤儿页(入度 0)、断链(指向不存在的页)、`injectByDefault` 引用悬空                                                 | 默认项目;`--global` 全局                     |

- **唯一跨 scope 的是 `graph --merged`**(只为 web「全景」):把全局+项目节点画一起,每节点标 `scope: global|project`,跨 scope 边(项目页引用某全局知识 id)单独标。`index`/`lint` 无跨 scope 意义(两份 `index.md` 永不合并)。
- **id 撞车规则**:全局与项目同 id(如都有 `api-conventions`)时**项目覆盖全局**——与注入合并顺序(全局 `injectByDefault` → 项目 `default` → node,§7)**同一条规则**,保证「看到的图」与「实际注入」一致。
- **MVP 不急着做 `index`/`lint` 命令**:小规模先把「ingest 后更新 index」「定期查孤儿/断链」写进 `tuteur-knowledge` skill 让 agent 自己做;一旦开了子目录、多级 `index.md` 手维护易漏,就把 `index` 固化成命令。`graph` 因直接服务 web 图谱视图可先做。
- **检索升级仅在被逼时**:出现无 fs 权限的消费者(远程 MCP / web 排序搜索),或规模大到 agent grep 失效时,才在 core 的检索接口后加实现——首选 **SQLite FTS5**(BM25 内置、约 30 行、单文件、无模型、无外部进程;中文用 `tokenize='trigram'`),**不引入 qmd 这类 CLI/进程依赖**;实现可换,`ttur`/web/agent 只认 core 接口。MVP 与中期都不做。
- `discoverSkills` 发现 `tuteur-knowledge` skill(cli §8.6);知识库**内容**的发现走 `index.md`/`graph`,不进 skill 发现。

---

## 10. web 管理(可见、可改、可管理)

详见 [web.md §3](./web.md);`/p/knowledge` 是独立的**知识库管理界面**,把「有什么、怎么连、注什么」全摊开:

| 区块         | 功能                                                                                                  | 数据                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 全局知识库   | `~/.tuteur/knowledge/` 条目 CRUD/tag/frontmatter/切 `injectByDefault`;**始终是「我的」,不随项目切换** | `GET\|PUT /api/knowledge?scope=global`                 |
| 项目知识库   | `<当前项目>/.tuteur/knowledge/` 条目 CRUD/tag;团队共享(随仓库)                                        | `GET\|PUT /api/knowledge?scope=project&project=<path>` |
| 文档展示     | 选中条目**渲染正文**;**当前仅 md**(Markdown 渲染 + frontmatter 摘要);未来格式可扩展(下)               | `GET /api/knowledge/:id?scope` 返回 raw + 渲染元数据   |
| 图谱视图     | `[全局] [项目] [合并]` 三档,渲染节点/边(枢纽、孤岛一眼可见)                                           | `ttur knowledge graph --global/默认/--merged --json`   |
| 注入编排器   | 勾选/排序本项目(可下钻节点)注入哪些条目、标必读/可选/禁用、**实时预览注入块**                         | `context.json`(§7)                                     |
| 计划 vs 实际 | 左:`resolvePlannedContext` 计划;右:`session_start` 事件实际 `injected`;diff 高亮                      | events.jsonl                                           |

**文档格式(先 md,留扩展位)**:知识库条目目前几乎都是 Markdown,web 先只支持 **md 的渲染展示**(`kind`/`tags`/`summary` 来自 frontmatter,正文走 Markdown 渲染器)。未来可能扩展其他格式(如结构化 JSON 表、图片、PDF):前端按条目 `format` 字段(缺省 `md`)选渲染器,后端 `GET /api/knowledge/:id` 统一返回 `{ format, raw, frontmatter }`——**先把 md 走通,其它格式各加一个渲染器即可,不改数据契约**。

实时更新走 chokidar watch + SSE(web §4.2):改完 `context.json`/知识页,下个会话的 `session-start` 即按新策略注入;图谱/列表也随文件变化局部刷新。

---

## 11. 与现有 `spec/` 的关系(迁移)

现状 `.tuteur/spec/*.md`(项目规范)与 `~/.tuteur/spec/*.md`(规范模板)是知识库的**前身**。统一后:

- `spec/` 内容并入知识库,成为 `knowledge/wiki/` 中 `kind: spec` 的页(策划级、`injectByDefault: true` 的项目约定)。
- 注入从「按路径引用 `.tuteur/spec/product.md`」改为「按知识 id 引用 `product`」(§7)。
- core.md §2 的 `spec/*.md` 行随之指向 `knowledge/`;旧 `spec/` 作为兼容别名可保留一段时间,新写一律进 `knowledge/`。

---

## 12. MVP 切分

| 阶段   | 范围                                                                                                                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | 目录布局落地(init 建 `knowledge/{sources,wiki}` + 空根 `index.md`/`log.md`;`wiki/` 默认平铺,多级子目录索引按需,§6.1);`tuteur-knowledge` skill 填实(含默认项目/全局显式规则);session-start 注入 `context.json.default` 引用的条目(注索引) |
| **P1** | 项目知识库 ingest/query/lint 跑通(skill 内);web 知识库管理页(全局+项目两区,**md 渲染展示**)+ 注入编排器(default/node 层);计划 vs 实际 diff                                                                                               |
| **P2** | 全局知识库(个人专属)+ 注入块实时预览;`ttur knowledge graph`(+ web 图谱视图三档)、`index`/`lint` 命令固化(`index` 重算各级目录);其它文档格式渲染器                                                                                        |

---

## 13. 关联文档

- 数据与 scope 模型、`context.json`、`resolvePlannedContext`:[core.md](./core.md)
- 注入解析与 hook 三阶段:[harness.md §4/§6](./harness.md)
- `tuteur-knowledge` skill 正文与发现:[harness.md §5](./harness.md)、[cli.md §8.6](./cli.md)
- 知识库管理 / 注入编排器 / 计划vs实际:[web.md](./web.md)
- 需求侧(上下文管理、事件):[../PRD.md §7.7/§7.9](../PRD.md)
