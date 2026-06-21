# Implementation Plan

## A. 配色 / 排序 / 时间线(读取层 + 卡片)

- [x] 改 `phase.ts` 的 `PHASE_META.finish` 为 mustard 同 execute(pill/dot/strip/border/ring) — Verify: diff 五项均 mustard;`pnpm typecheck`
- [x] `getBoard`(dashboard.ts)遍历 `listTasks` 前按 `createdAt` 倒序(相等按 id 兜底) — Verify: `pnpm typecheck`;手动看同列新→旧
- [x] `types/dashboard.ts` 增 `TimelineEventView`、`TaskDocView`,`BoardCard` 增 `timeline`(产物清单懒加载,不挂 card) — Verify: `pnpm typecheck`
- [x] dashboard.ts 增 `readTimelineView`(`readEvents`→映射→按 ts 倒序,容错 []);`toCard` 挂 `timeline` — Verify: `pnpm typecheck`

## B. 产物读取(core + app server + API)

- [x] core `store/meta.ts` 增 `readTaskArtifact(scope,id,name)`:校验安全 `.md` basename(非法抛错)、`taskReadPath` 解析、断言解析路径落在任务目录内、`readTextFileIfExists` 读;经 `store/index.ts`、`core/src/index.ts` 具名导出 — Verify: `pnpm --filter @withy/core typecheck`;可加 name 校验单测
- [x] app `server/tasks.ts`:`getTaskDocs(scope,id)`、`getTaskDoc(scope,id,name)` 返回 `TaskDocView|null` — Verify: `pnpm typecheck`
- [x] API `GET /api/tasks/[id]/docs` 与 `GET /api/tasks/[id]/doc?name=`(scope 由 `?project=` 解析;name 缺失/非法 400) — Verify: `pnpm typecheck`;本地 curl 取 prd.md 正文

## C. 共享展示组件 + 知识库改造

- [x] 新增 `components/markdown/DocOutline.tsx`(泛化 `TableOfContents`,容器选择器 `[data-doc-scroll]`,入参 `docKey`) — Verify: `pnpm typecheck`
- [x] 新增 `components/markdown/MarkdownView.tsx`(client,`dynamic(ssr:false)` Crepe 只读渲染 `body`,滚动容器 `data-doc-scroll` + `.doc-scroll`,保持原生滚动) — Verify: `pnpm typecheck`
- [x] 知识库改用共享 `DocOutline`:`MarkdownEditor` 滚动属性 `data-knowledge-scroll`→`data-doc-scroll`,`KnowledgeWorkspace` 引共享 `DocOutline`,删本地 `TableOfContents.tsx` — Verify: `pnpm typecheck`;手动:知识库大纲与跳转正常

## D. 滚动条(OverlayScrollbars)

- [x] 装依赖 `overlayscrollbars overlayscrollbars-react` 到 `@withy/app` — Verify: `pnpm --filter @withy/app install` 成功;package.json 出现两依赖
- [x] 新增 `components/Scroller.tsx`(client,OverlayScrollbarsComponent + useTheme 主题),`globals.css`/`layout.tsx` 引其 CSS 一次,并在 `globals.css` 增 `.doc-scroll` 细滚动条工具类(细、track 透明、thumb 半透、hover 才明显) — Verify: `pnpm typecheck`

## E. 详情面板整合(时间线 + 产物入口 + 弹窗 + 滚动)

- [x] zh/en messages:移除 `viewDetail.ownerLine`;新增 `viewDetail.timeline*`、`viewDetail.event.*`、`viewDetail.docs*`、`taskDocs.*` 文案,两文件 key 对齐 — Verify: `pnpm typecheck`
- [x] `detail.tsx` 增时间线类型→语义色映射与 `TimelineRow` 子件 — Verify: `pnpm typecheck`
- [x] 新增 `TaskDocsModal.tsx`(三栏只读窗:左产物列表 / 中 `MarkdownView` / 右 `DocOutline`;关闭按钮+Esc+遮罩;按 name 取正文) — Verify: `pnpm typecheck`
- [x] `ViewDetail.tsx`:删 ownerLine,套 `Scroller`,加「执行时间线」折叠面板(默认折叠+空态),选中任务时 `GET /api/tasks/[id]/docs` 取产物清单加「任务产物」入口(清单空则不渲染、失败显示失败态),点击开 `TaskDocsModal` — Verify: `pnpm typecheck`
- [x] 看板列滚动(BoardView)与归档/空态 aside 视需要换 `Scroller` 消重排 — Verify: 手动切换可滚/不可滚无位移

## F. 全量校验与验收

- [x] 三件套:`pnpm typecheck` && `pnpm lint`(0 warning) && `pnpm --filter @withy/app build`;`pnpm --filter @withy/app test` 不回归 — Verify: 全绿
- [x] agent-browser 手动验收(视口 1440x900):配色、排序、时间线、滚动条、产物三栏弹窗(列表/只读渲染/章节跳转/空态/关闭)、知识库无回归 — Verify: 逐条对照 prd 验收项截图确认
