# Design: 优化 markdown 暗色展示:滚动条/表格/代码

## Summary

集中在三处改动,不碰组件渲染/大纲逻辑:

- `packages/app/src/components/markdown/milkdown-tokens.css`:在 `.milkdown` 作用域内补映射缺失的 Crepe 变量,并对表格边框、内联 code、fenced 代码块加少量定向覆盖。
- `packages/app/src/app/globals.css` 的 `.doc-scroll`:重写 webkit/firefox thumb 规则,使其视觉对齐 `Scroller`(OverlayScrollbars)。
- `packages/app/src/appTemplates/Knowledge/components/MarkdownEditor.tsx`:给滚动容器补上漏挂的 `doc-scroll` 类(单类名增量),使知识库编辑器与只读弹窗的滚动条统一。

选这条路径的原因:markdown 渲染与滚动元素的架构约束(原生滚动支撑 `DocOutline`)已在代码注释中确立,改用 `Scroller` 需重写大纲的 observer/scroll 逻辑且风险高,收益仅为"视觉一致";而原生滚动条完全可以在 CSS 层做到与 OverlayScrollbars 同观感。其余三项本质都是 Crepe 默认变量未对齐项目 token,改 `milkdown-tokens.css` 这一单点即对只读与可编辑两个入口同时生效。

## Architecture and Boundaries

- 作用域边界:所有 markdown 视觉覆盖只写在 `.milkdown ...` 选择器下,不外溢到全局;滚动条改动只在 `.doc-scroll` 内。
- 单一数据源:颜色一律引用 `globals.css` 既有语义 token(`--line`/`--line-strong`/`--paper`/`--paper-sunken`/`--bg`/`--terracotta`/`--ink` 等);唯一例外是滚动条 thumb 的半透明黑/白,对齐 OverlayScrollbars 自带 `os-theme-*` 主题值,加注释说明。
- 主题切换:暗色覆盖通过 `[data-theme='dark'] ...` 前缀,与 globals.css 既有写法一致。

## Components

### milkdown-tokens.css —— 变量映射 + 定向覆盖

- 补 `--crepe-color-inline-area` 映射(驱动内联 code 与裸 `<pre>` 底色),消除浅灰 `#cacaca` 残留。
- 内联 code:`.milkdown .ProseMirror code` 显式底色 `--paper-sunken` + `1px solid --line` 细边 + 文字保持 `--terracotta`;不影响 `pre code`(Crepe 已有更高特异性规则置其透明)。
- fenced 代码块:`.milkdown .milkdown-code-block` 给整块单一沉底(暗色与正文 paper 拉开,候选 `--bg`/`--paper-sunken`)+ `1px solid --line-strong` 边框 + 圆角;内层 `.cm-editor`/`.cm-gutters` 背景置 `transparent` 继承块底,避免外层+内层双层同色发平,形成单层有边界的代码块。
- 表格:`.milkdown .milkdown-table-block :is(th,td)` 边框覆盖为 `1px solid var(--line)`(**全不透明度**,压过 Crepe 的 `color-mix(outline, transparent 80%)` 20% 透明;取 `--line` 对齐 `visual-design` §6.6"表格用 border-line 分隔"约定);表头 `th` 给 `--paper-sunken` 浅底以区分。截图若仍偏浅再升 `--line-strong`。

### globals.css `.doc-scroll` + MarkdownEditor 类名 —— 滚动条视觉对齐 Scroller

- `MarkdownEditor.tsx:93` 滚动容器 className 由 `min-h-0 flex-1 overflow-auto` 补为 `doc-scroll min-h-0 flex-1 overflow-auto`,与 `MarkdownView.tsx:25` 对齐(只读弹窗已有该类)。
- thumb:宽高 10px、`border-radius:10px`、`border:2px solid transparent` + `background-clip:padding-box` 形成 2px 内缩;默认 `background-color: transparent`(近隐形),hover/`focus-within` 显现。
- 主题色:亮主题 thumb `rgba(0,0,0,.44)`(hover `.55`),暗主题经 `[data-theme='dark']` 覆盖为 `rgba(255,255,255,.44)`(hover `.55`),与 `Scroller` 的 `os-theme-dark`/`os-theme-light` 取值一致。
- Firefox:`scrollbar-color` 同步按主题给 thumb 色 + 透明 track;`scrollbar-width: thin` 保留。

## Data Flow and Contracts

无运行时数据流变化。契约约束:

- `.doc-scroll` 元素仍是真实滚动容器,`data-doc-scroll` 不动 → `DocOutline` 的 `querySelector('[data-doc-scroll]')`、IntersectionObserver root、`scrollIntoView` 行为不变。
- 覆盖选择器特异性需高于或等于 Crepe 原规则(都在 `.milkdown .ProseMirror`/`.milkdown .milkdown-*` 前缀下,同级靠 import 顺序——`milkdown-tokens.css` 最后 import,后写覆盖生效)。

## Error Handling and Edge Cases

- 内联 code 覆盖误伤 fenced `pre code`:Crepe `.milkdown .ProseMirror pre code { background: transparent }` 特异性更高,保持透明,不受影响。
- 表格选中态(编辑器内 `:has(.ProseMirror-selectednode)`)有自己的 outline/背景规则,本次只覆盖静态 `th/td` 边框,不动选中态。
- 代码块内层底色若取 `--bg`,需确认在亮主题下不过暗;取 `--paper-sunken` 更稳妥,二者择一以截图为准。

## Compatibility and Migration

None —— 纯 CSS 视觉调整,无 API/数据/结构变更;只读与可编辑两入口共享同一 token 文件,自动一致。

## Testing Strategy

- 手动验收(agent-browser):准备含表格、内联 code、fenced 代码块的 markdown,在亮/暗两主题各截图,逐条核对 4 个验收点;并验证 `DocOutline` 点击跳转与滚动高亮正常。
- 静态校验:`pnpm --filter @withy/app typecheck`、`pnpm --filter @withy/app lint`(0 warning);改动文件 `prettier --write`。

## Risks and Rollback

- 风险:不同浏览器原生滚动条对 `background-clip:padding-box`+透明 border 的内缩表现略有差异(Chromium 正常,Firefox 用 `scrollbar-color` 退化为细条无内缩)——可接受,Firefox 仍得到细圆条观感。
- 回滚:改动集中在 2 个 CSS 文件、纯增量样式,`git checkout` 这两文件即可完全还原,无副作用。
