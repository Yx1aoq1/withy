# 优化 markdown 暗色展示:滚动条/表格/代码

## Goal

知识库与任务产物共用的只读 markdown 渲染面(Milkdown/Crepe)在暗色主题下可读性差:滚动条与项目其余区域不一致、表格分隔线几乎不可见、内联 code 与代码块底色违和。统一这套展示的视觉,使其在亮/暗两主题下都清晰、与 Ink-stone 设计 token 一致。

## Confirmed Facts

- markdown 渲染统一由 Crepe 承载:只读 `MarkdownView.tsx`(看板弹窗 `TaskDocsModal` 消费)与可编辑 `Knowledge/components/MarkdownEditor.tsx`,二者都 `import './milkdown-tokens.css'`(`packages/app/src/components/markdown/milkdown-tokens.css`)。样式集中改这一处即对两者生效。
- 滚动容器走原生滚动并挂 `data-doc-scroll`,`DocOutline.tsx` 用该元素作 IntersectionObserver root 与 scrollIntoView 目标。`MarkdownView.tsx:15` 注释明确:不可改用 `Scroller`(OverlayScrollbars 会替换真实滚动元素,破坏大纲联动)。
- 滚动条细样式类 `.doc-scroll` 定义在 `globals.css:154`。但只有 `MarkdownView.tsx:25` 的容器挂了该类;知识库 `MarkdownEditor.tsx:93` 的容器只挂 `data-doc-scroll`、**漏了 `doc-scroll` 类**,故现状用浏览器默认滚动条,未被统一。
- 表格 `th/td` 边框由 Crepe `table.css` 写死为 `1px solid color-mix(var(--crepe-color-outline), transparent 80%)`,即 `--line` 仅 20% 不透明度;`milkdown-tokens.css` 已将 `--crepe-color-outline` 映射到 `--line`。
- 内联 code(Crepe `reset.css` 的 `.ProseMirror code`)背景用 `--crepe-color-inline-area`,该变量未在 `milkdown-tokens.css` 映射,亮/暗两主题均停留在 frame 默认浅灰 `#cacaca`。
- fenced 代码块为 CodeMirror(`.milkdown-code-block`):外层 bg=`--crepe-color-surface-low`(=`--paper-sunken`)、内层 `.cm-editor` bg=`--crepe-color-surface`(=`--paper`)。暗色下 `--paper` 与正文所在底色相近,边界几乎消失。
- `Scroller`(OverlayScrollbars)的目标视觉:`--os-size:10px`、`--os-handle-border-radius:10px`、2px padding 内缩、亮底用深色条 `rgba(0,0,0,.44→.55)`、墨底用浅色条 `rgba(255,255,255,.44→.55)`、autoHide leave。

## Requirements

- markdown 的滚动条视觉与 `Scroller` 一致:细圆角条、内缩留白、默认近隐形、hover/聚焦显现;亮主题深色条、暗主题浅色条。仍保持原生滚动元素不变(不引入 OverlayScrollbars),不破坏 `DocOutline` 联动。
- 两个 markdown 入口(只读 `MarkdownView` 与知识库 `MarkdownEditor`)的滚动容器都应用上 `.doc-scroll`,观感一致;补齐 `MarkdownEditor` 漏挂的类。
- 表格 `th/td` 分隔线在亮/暗两主题下清晰可辨;表头行有可感知的区分。
- 内联 code 在两主题下底色、文字色对比清晰可读,且与暗色主题协调。
- fenced 代码块与正文有明确边界(底色区分 + 边框),在暗色主题下不与背景糊在一起。
- 所有配色取自现有 Ink-stone 语义 token,不新硬编码 hex(滚动条 thumb 的半透明黑/白为对齐 OverlayScrollbars 既有主题值,属例外且注明)。

## Acceptance Criteria

- [ ] 暗色主题下打开含表格的 markdown:`th/td` 边框肉眼可见,非"几乎透明";亮色主题同样清晰。
- [ ] 暗色主题下内联 `` `code` `` 的背景与文字对比清晰可读,不是浅灰底浅字。
- [ ] 暗色主题下 ``` ``` ``` fenced 代码块与周围正文存在可见边界(边框或底色差),不与页面背景同色。
- [ ] markdown 区域滚动条 hover 时呈现圆角细条、内缩留白,样式与详情 aside 等 `Scroller` 区域观感一致;亮主题深色条、暗主题浅色条。只读弹窗与知识库编辑器两处都生效。
- [ ] 切换文档后 `DocOutline` 大纲点击跳转、滚动高亮仍正常(滚动元素未被破坏)。
- [ ] `pnpm typecheck`、`pnpm lint`(0 warning)在 `@withy/app` 通过;改动文件经 prettier。

## Out of Scope

- 不改 `Scroller.tsx` / `DocOutline.tsx` 的逻辑结构,不把 markdown 接入 OverlayScrollbars。
- 不改 Crepe 的可编辑工具栏、双链 wikilink 等无关样式。
- 不调整亮/暗主题的全局 token 取值(只在 markdown 作用域内映射/覆盖)。

## Open Questions

- None.
