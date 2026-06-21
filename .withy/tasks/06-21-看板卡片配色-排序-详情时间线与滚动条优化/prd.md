# 看板卡片配色/排序/详情时间线/滚动条与产物快查优化

## Goal

修正并增强 Web 看板体验:收尾阶段卡片误显示完成色、卡片排序不符直觉、详情面板一句无效提示、详情滚动条占宽重排;并在详情中新增任务产物(prd/design/implement 等 md)的快速查看——点开弹窗以「文件列表 / 文档内容 / 章节目录」三栏只读审阅,且把知识库的 md 展示 UI 抽成公共组件复用。

## Confirmed Facts

- 阶段配色单一数据源 `packages/app/src/appTemplates/Board/components/phase.ts`;`finish` 阶段 `strip/border/ring` 均为 `teal`(绿),`execute` 为 `mustard`。
- `TaskCard.tsx` 非完成、非卡住时取 `PHASE_META[phase]` 配色,故收尾卡片(仍在 doing 列)边框/色条为绿。
- 看板数据由 `packages/app/src/server/dashboard.ts` 的 `getBoard` 构建;`listTasks` 默认按 `id` 升序(`packages/core/src/store/tasks.ts:66`)。`Task` 含 ISO `createdAt`。
- 「负责人 {owner} · 完整事件时间线见任务详情页」是 i18n key `viewDetail.ownerLine`(`ViewDetail.tsx:109`)。
- 任务事件可由 core 现成 `readEvents(scope, taskId)` 读取;事件类型见 `TaskEventSchema`(`complete_attempt`/`decision`/`rewind`/`skip`/`approval`/`session_start`),均带 ISO `ts`。
- 详情区滚动用原生 `overflow-y-auto`,滚动条出现/消失挤压布局;app 为 React 19 + Next 16,未引入 overlayscrollbars。
- 任务产物清单已有 core 能力 `listTaskArtifacts(scope, id)`(`packages/core/src/store/meta.ts:43`):返回任务目录下非空 `.md` 文件名(排序、含归档回退),但**无**读取单个产物正文的函数。
- 知识库三栏展示:中栏 `MarkdownEditor`(Milkdown Crepe,支持 `file.readonly` → `setReadonly(true)` 只读渲染)、右栏 `TableOfContents`(从 `.milkdown` 渲染出的 heading DOM 扫描,锚点用 Crepe heading id,容器选择器 `[data-knowledge-scroll]`)。
- 知识库读单文件经 `/api/knowledge/file`(`getKnowledgeFile`),scope 由 `?project=<path>` 解析(`knowledgeScope`);任务 API 已有 `/api/tasks/[id]/archive` 同款 scope 范式。

## Requirements

- 收尾(finish)阶段卡片在 doing 列时,边框/色条/阶段标识用与执行(execute)一致的 mustard;绿色仅用于 done 列。
- 看板每列卡片按 `createdAt` 倒序(最新在最上)。
- 移除详情面板 `viewDetail.ownerLine` 行。
- 详情新增「执行时间线」,可折叠面板(默认折叠)内按事件时间倒序展示该任务事件;无事件显示空态。
- 详情滚动条不占布局宽度、不重排,默认隐藏、hover/滚动才显示;用 OverlayScrollbars。
- 详情新增任务产物快查:展示该任务产物 md 列表(prd/design/implement 等),点击某项弹出三栏只读审阅窗——左:产物文件列表;中:该 md 只读渲染;右:章节目录(可点击跳转)。
- 知识库的 md 展示 UI(只读渲染面 + 章节目录)抽为公共组件,任务产物弹窗与知识库共用同一套展示 UI;数据加载/编辑等业务逻辑各自分开。
- 产物弹窗只读,不提供编辑/保存。
- 中英文案(zh/en)同步,新增 key 双语齐备。

## Acceptance Criteria

- [ ] phase=finish 且 column=doing 的卡片,边框/左侧色条/pill 与 execute 同为 mustard,无绿色;column=done 仍为 teal。
- [ ] 同列多卡按 createdAt 较新者在上。
- [ ] 详情不再出现「负责人 … · 完整事件时间线见任务详情页」。
- [ ] 详情出现「执行时间线」折叠面板,默认折叠;展开后逐条列出事件(时间/语义/节点),按时间倒序;无事件显示空态。
- [ ] 详情内容在可滚/不可滚切换时主体不横向位移;滚动条默认不可见,hover/滚动才显示且不占宽。
- [ ] 详情展示当前任务的产物 md 列表;点击任一产物弹出三栏窗:左列列出全部产物 md、中列只读渲染选中产物、右列为其章节目录;点右列标题中栏滚动到对应位置。
- [ ] 弹窗为只读(无编辑/保存控件);可经背景点击或 Esc 关闭。
- [ ] 任务无产物 md 时,详情不显示产物入口或显示空态,不报错。
- [ ] 知识库页与产物弹窗使用同一公共展示组件(章节目录 + 只读渲染面),知识库原有编辑能力不回归受损。
- [ ] `pnpm typecheck`、`pnpm lint`(0 warning)、`@withy/app` build 通过;知识库既有 `pnpm --filter @withy/app test` 不回归。

## Out of Scope

- 归档详情 `ArchivedDetail` 的 `archived.ownerLine`(文案不同),不在移除范围。
- 不改 core `listTasks` 排序(排序在 app 读取层完成)。
- 不新增任务详情独立页;时间线与产物入口均在右侧详情面板/弹窗内。
- 产物弹窗不支持编辑、新建、删除、重命名(只读审阅);不展示非 md 文件(task.json/state.json/events.jsonl)。
- 不改事件写入逻辑与事件 schema。

## Open Questions

- None.
