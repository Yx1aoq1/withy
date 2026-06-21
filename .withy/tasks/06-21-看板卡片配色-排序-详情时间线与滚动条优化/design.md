# Design: 看板卡片配色/排序/详情时间线/滚动条与产物快查优化

## Summary

五处改动,集中在 app 包(Board 视图 + 读取层 + 共享展示组件),core 仅新增一个只读读函数:

1. 配色:`PHASE_META.finish` teal → mustard(同 execute),绿色收敛为「仅已完成」。
2. 排序:`getBoard` 按 `createdAt` 倒序后入列。
3. 时间线:读取层新增事件视图模型挂 `BoardCard`,详情用可折叠面板渲染,替换被删的 ownerLine。
4. 滚动条:引入 OverlayScrollbars,封装主题感知 `Scroller` 替换详情/看板列原生滚动。
5. 产物快查:复用 core `listTaskArtifacts` + 新增 `readTaskArtifact`;app 加读取层与 API;新增只读 md 展示公共组件(渲染面 + 章节目录),知识库与任务弹窗共用;详情内列出产物、点开弹三栏只读窗。

## Architecture and Boundaries

- core `store/meta.ts`:新增 `readTaskArtifact(scope, id, name)`(只读、防越界),经 store/index + core index 导出。唯一 core 改动。
- app 读取层 `server/dashboard.ts`:排序、读事件映射、产物清单挂 `BoardCard`;新增 `server/tasks.ts`:`getTaskDocs`/`getTaskDoc`。继续只经 `@withy/core`,不碰 fs。
- 视图模型 `types/dashboard.ts`:`BoardCard` 增 `timeline` 字段;新增 `TimelineEventView`、`TaskDocView`(产物清单懒加载,不挂 `BoardCard`)。
- 配色 `phase.ts`、卡片 `TaskCard.tsx`:配色单点改。
- 详情 `ViewDetail.tsx` + 共享 `detail.tsx`:时间线、产物入口、删 ownerLine、套 `Scroller`。
- 共享展示组件 `components/markdown/`:`MarkdownView`(只读 Crepe 渲染面)、`DocOutline`(泛化版章节目录)。
- 共享滚动 `components/Scroller`(client,OverlayScrollbars)。
- 产物弹窗 `appTemplates/Board/components/TaskDocsModal.tsx`(client)。
- 知识库 `Knowledge/components/*`:改用共享 `DocOutline` + 统一滚动容器属性,编辑业务逻辑不动。
- API:`/api/tasks/[id]/docs`、`/api/tasks/[id]/doc`。
- i18n `messages/zh.json`/`en.json`。

边界:core 领域逻辑不变;事件读取/产物读取沿用容错降级;归档侧只读语义不变。

## Components

### 配色 / 排序(同前)
- `PHASE_META.finish` → mustard 五项。
- `getBoard`:遍历前 `listTasks(scope).slice().sort((a,b)=> b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))`(createdAt 相等时按 id 兜底,确定性)。

### 事件视图模型
- `TimelineEventView = { ts; type; node: string|null; ok: boolean|null; reason: string|null; by: string|null }`。
- `readTimelineView(scope,id)`:`readEvents`→map→按 ts 倒序;try/catch 降级 []。挂 `toCard`。

### 产物读取(core + app)
- core `readTaskArtifact(scope, id, name): string | null`:`name` 必须是安全 `.md` basename(`/^[^/\\]+\.md$/i`,排除 `.`/`..`),否则抛 `Error`;经 `taskReadPath(scope,id,name)` 解析(含归档回退),再**断言解析后绝对路径位于该任务目录(live 或归档桶)之内**(双重防越界),`readTextFileIfExists` 读;不存在返回 null。
- app `server/tasks.ts`:`getTaskDocs(scope,id): string[]`(= `listTaskArtifacts`);`getTaskDoc(scope,id,name): TaskDocView | null`(`{ name, body }`,name 非法/缺失 → null 或抛由 API 兜 400)。
- 产物清单**懒加载**:不挂 `BoardCard`;`ViewDetail` 选中任务时按需 `GET /api/tasks/[id]/docs`(对齐知识库「选中再取文件」模式),避免每卡 readdir。`toCard` 仅增 `timeline`,不增 `docs`。

### API
- `GET /api/tasks/[id]/docs?project=` → `{ ok, docs: string[] }`。
- `GET /api/tasks/[id]/doc?project=&name=` → `{ ok, doc: { name, body } | null }`;name 缺失/非法 → 400。scope 解析复用 `resolveProjectScope(?project)` 范式。

### 共享展示组件 `components/markdown/`
- `MarkdownView`(client,`dynamic(ssr:false)`):入参 `{ body, docKey }`;内部 Milkdown Crepe `defaultValue: body` + `setReadonly(true)`,滚动容器挂 `data-doc-scroll` 并加 `.doc-scroll`(细 CSS 滚动条);**保持原生滚动**(不套 OverlayScrollbars,以免换掉真实滚动元素破坏 TOC 的 `IntersectionObserver root`/`scrollIntoView`)。纯展示,无保存逻辑。
- `DocOutline`(client):泛化自 `TableOfContents`,容器选择器改 `[data-doc-scroll]`(全局查;同一时刻仅一个只读渲染实例 —— 看板页 `ViewDetail` 不挂 Crepe,只有弹窗挂;知识库为独立页),heading 选择器沿用 `.milkdown :is(h1,h2,h3,h4)`;入参 `docKey`(变更 → 重扫)。点击平滑滚动 + IntersectionObserver 高亮(逻辑不变)。
- 共用边界(对齐用户决策):公共组件只负责「展示 UI」;数据加载、编辑/保存、文件树增删改等业务逻辑各消费方自持。

### 滚动 `Scroller`(client)与滚动策略
- `Scroller` 封装 `OverlayScrollbarsComponent`,`options={{ scrollbars:{ autoHide:'leave', autoHideDelay:200, theme }, overflow:{ x:'hidden' } }}`,`defer`;`theme` 依 `useTheme` 取 `os-theme-light/dark`。CSS 在 `globals.css`/`layout.tsx` 引一次。
- 分层:`Scroller` 用于详情 aside、看板列、弹窗左/右窄栏(纯列表/大纲);markdown 正文区(`[data-doc-scroll]`)保持原生滚动 + `.doc-scroll` 细滚动条工具类(globals.css 定义:细、track 透明、thumb 半透、hover 才明显),不被 OverlayScrollbars 接管。

### 产物弹窗 `TaskDocsModal`(client)
- 入参 `{ taskId, project, docs, initialName, onClose }`;固定覆盖层(fixed,背景遮罩;关闭方式:右上关闭按钮 + Esc + 点遮罩;不做完整 focus-trap,后续可加)。
- 三栏:左 = 产物文件名只读列表(选中高亮,套 `Scroller`);中 = `MarkdownView`(按选中 name 经 `/api/tasks/[id]/doc` 取正文,原生 `.doc-scroll` 滚动);右 = `DocOutline`(docKey=当前 name,套 `Scroller`)。
- 选中切换只刷新中/右栏(按 name remount);加载态/失败态文案走 i18n。

### 详情入口(ViewDetail)
- 删 `ViewDetail.tsx:109` ownerLine。
- 新增「执行时间线」`<Layer>` + `<details>`(默认折叠,复用实施步骤样式);`TimelineRow` 渲染时间/语义色点/文案/reason。
- 新增「任务产物」`<Layer>`:选中任务时按需 `GET /api/tasks/[id]/docs` 取清单;加载中显示占位、清单为空则不渲染该 Layer(空态不报错);非空则列出产物 chips,点击 `setOpenDoc(name)` 打开 `TaskDocsModal`(docs=已取清单,initialName=name)。
- 详情滚动容器由 `aside overflow-y-auto` 改为 `Scroller`。
- 仅活跃 `ViewDetail` 增时间线与产物入口;归档 `ArchivedDetail` 不变。

### 知识库改造(最小)
- `MarkdownEditor`:滚动容器属性 `data-knowledge-scroll` → `data-doc-scroll`;`KnowledgeWorkspace` 用共享 `DocOutline` 替换本地 `TableOfContents`;删除本地 `TableOfContents.tsx`。编辑/autosave 逻辑不动。

## Data Flow and Contracts

- 服务端:`getBoard`→`toCard`→`readTimelineView` → `BoardCard.timeline`(已倒序)。产物清单不在此层。
- 客户端详情:读 `card.timeline` 渲染时间线;选中任务时 `GET /api/tasks/[id]/docs` 取产物清单渲染入口;点开 → `TaskDocsModal` 经 `/api/tasks/[id]/doc` 取选中产物正文 → `MarkdownView` 渲染 → `DocOutline` 从渲染 DOM 扫标题。
- i18n 新增:`viewDetail.timelineLayer/timelineToggle/timelineEmpty`、`viewDetail.event.*`、`viewDetail.docsLayer/docsEmpty`、`taskDocs.title/empty/loadFailed/loading/readonly` 等;移除 `viewDetail.ownerLine`(zh+en),`archived.ownerLine` 保留。

## Error Handling and Edge Cases

- 事件/产物文件缺失或损坏:读取层降级空,详情显示空态或不渲染入口。
- `readTaskArtifact` name 非法 → 抛错,API 兜 400;路径越界由「basename 正则 + 解析后断言落在任务目录内」双重防护。
- 产物清单请求失败:详情产物 Layer 显示失败文案,不阻塞时间线与其余详情。
- `session_start` 无 node:node=null,文案不渲染节点片段。
- `reason` 已由 core 截断,前端再 1 行截断。
- Crepe 只读:`setReadonly(true)`,无 markdownUpdated 保存路径。
- 弹窗切文件:中/右栏按 docKey remount,避免显示上一篇。
- `DocOutline` 标题数 <2 时渲染占位空 aside(沿用现状),不报错。
- OverlayScrollbars 内容不足时不渲染滚动条、不占位;`overflow-x:hidden` 防横向溢出;markdown 正文区 `.doc-scroll` 内容不足时细滚动条隐藏。

## Compatibility and Migration

- 新增依赖 `overlayscrollbars` + `overlayscrollbars-react`(支持 React 19),仅 app 包。
- `BoardCard` 加 `timeline`/`docs` 为附加字段,旧消费点不受影响;归档侧不变。
- 知识库改用共享 `DocOutline`:选择器与锚点策略不变,仅容器属性更名,行为等价。
- core `readTaskArtifact` 为新增 API,不动既有签名。无数据迁移。

## Testing Strategy

- 静态:`pnpm typecheck`、`pnpm lint`(0 warning)、`@withy/app` build。
- 单测:`pnpm --filter @withy/app test`(知识库既有测试)不回归;如成本低,为 `readTaskArtifact` 的 name 校验加 core 单测。
- 手动(agent-browser,视口 1440x900):配色/排序/时间线/滚动条/产物三栏弹窗(列表、只读渲染、章节跳转、空态、Esc 关闭)、知识库展示无回归。

## Risks and Rollback

- 风险:OverlayScrollbars 与 RSC/SSR 边界 → client 组件 + `defer`;CSS 全局引一次。
- 风险:知识库换共享 TOC 引入回归 → 选择器/锚点保持等价,改动仅容器属性 + 引用路径,手动验证知识库大纲。
- 风险:Crepe 第二处实例(只读)在弹窗内的挂载/卸载 → 按 docKey key 化 remount,卸载清理。
- 回滚:五项独立,可逐项 revert;产物快查与共享组件为新增,移除即恢复原状。
