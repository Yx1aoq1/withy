---
id: scroll-readonly-markdown
title: '滚动条策略与只读 Markdown 展示组件'
scope: project
kind: spec
tags: [guide, frontend, scroll, markdown, overlayscrollbars, milkdown]
summary: 'OverlayScrollbars Scroller 悬浮滚动消重排;markdown 正文区刻意保留原生 .doc-scroll(否则破坏 TOC 的 IntersectionObserver root/scrollIntoView);只读渲染面 MarkdownView + 章节目录 DocOutline + milkdown-tokens.css 为共享展示三件套。'
inject: index
injectByDefault: false
updated: 2026-06-21
---

# 滚动条策略与只读 Markdown 展示组件

> 适用:`@withy/app` 看板详情/弹窗/知识库。关联实现层与编辑器陷阱见 [[milkdown-wikilink]]、页面/数据流见 [[web]]、视觉 token 见 [[visual-design]]。

## 滚动条:两套并存,刻意不统一

dashboard 有两类滚动区,**不要用同一种滚动条**:

- **容器/列表区**(详情 aside、看板三列、归档列表、弹窗窄栏):用 `components/Scroller.tsx` 封装的
  `OverlayScrollbarsComponent`。滚动条悬浮覆盖、**不占布局宽度**,可滚/不可滚切换不横向位移;
  `autoHide:'leave'` 默认隐藏、hover/滚动才显示;`overflow.x:'hidden'`;`defer`(SSR 边界,空闲再初始化)。
  主题依 `useTheme` 取 `os-theme-dark`(亮底深色条)/`os-theme-light`(墨底浅色条)。
  CSS 在 `layout.tsx` 引一次 `overlayscrollbars/overlayscrollbars.css`。
  用法:外层容器只管布局(宽/边框/底色,**不滚动**),内层 `<Scroller className="min-h-0 flex-1">` 作滚动视口。
- **Markdown 正文区**(只读渲染面 / 知识库编辑器):**保留原生 `overflow` + globals.css 的 `.doc-scroll` 细滚动条工具类**
  (细、track 透明、thumb 半透、hover 才明显),滚动容器挂 `data-doc-scroll`。

### 为什么 markdown 正文不能套 OverlayScrollbars(踩坑根因)

`DocOutline`(章节目录)用 `IntersectionObserver({ root: 滚动容器 })` 做滚动高亮、用 `scrollIntoView` 做点击跳转,
靠 `[data-doc-scroll]` 选中**真实滚动元素**。OverlayScrollbars 会把内容搬进它自建的 viewport 子元素并接管滚动,
真实滚动元素不再是挂 `data-doc-scroll` 的那个 → IntersectionObserver root 与 scrollIntoView 双双失效、大纲不再高亮/跳转。
故 markdown 正文区**必须保持原生滚动**。这与 [[milkdown-wikilink]] 记的「TOC 锚点用 Milkdown 自带 heading id」是同一处 TOC 的两条约束。

## 只读 Markdown 展示三件套(看板弹窗与知识库共用)

展示 UI 共享、数据/编辑各自持有(对齐用户决策:公共组件只负责展示):

- `components/markdown/MarkdownView.tsx`:Crepe `defaultValue + setReadonly(true)` 只读渲染面,无保存逻辑;
  滚动容器 `data-doc-scroll .doc-scroll`(原生滚动,见上)。Crepe 触碰 document,**消费方须 `dynamic(ssr:false)` 导入**。
- `components/markdown/DocOutline.tsx`:从渲染出的 `.milkdown :is(h1..h4)` DOM 扫标题成大纲,锚点用 Milkdown heading id;
  入参 `docKey`(变更即重扫);全局查 `[data-doc-scroll]`,**前提:同一时刻只有一个只读渲染实例**
  (看板 `ViewDetail` 不挂 Crepe、仅弹窗挂;知识库为独立页)。
- `components/markdown/milkdown-tokens.css`:Crepe 主题 → 砚墨 token 的映射,**所有 Crepe 实例共用一份**
  (知识库可编辑编辑器 + 任务产物只读渲染都 import 它),勿在各处重复。

切换文档时按 `name`/`relPath` 给渲染面 remount(React key),避免显示上一篇。

## 关联页

- [[milkdown-wikilink]] · [[web]] · [[visual-design]] · [[react-patterns]] · [[nextjs-architecture]]
