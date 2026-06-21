---
id: milkdown-wikilink
title: 'Milkdown/Crepe 双链序列化陷阱与自研插件'
scope: project
kind: concept
tags: [frontend, knowledge, milkdown, crepe, editor, pitfall]
summary: '裸 Crepe 序列化会把双链转义破坏关系图;自研 remark+$node+$inputRule 三件套插件让双链往返逐字保真。'
inject: index
injectByDefault: false
updated: 2026-06-20
---

# Milkdown/Crepe 双链序列化陷阱与自研插件

> 适用:`@withy/app` 知识库工作台的 Milkdown/Crepe 编辑器(`appTemplates/Knowledge/`)。
> 关联实现层:[[knowledge-base]] 定义双链是关系图与 lint 的命脉;[[core]] 的 `extractLinks` 按双中括号抽链。
>
> 注:下文示例里的双链一律把第二个中括号转义(`[\[foo]]`)以免被 lint 当成真链接。

## 陷阱(必须知道)

裸 Crepe(Milkdown 内核为 ProseMirror)保存正文时,把文档序列化回 markdown 走的是
`mdast-util-to-markdown`,它**会对文本里的 `[` 转义**:`[\[foo]]` 会变成 `\[\[foo]]`(两个
`[` 之间被插入 `\`)。后果是静默的:

- 磁盘正文不再逐字等于原双链,违反 PRD「双链逐字保留」。
- core 的 `extractLinks` 正则需要两个**连续** `[`,被转义后中间夹了 `\` → 匹配不到
  → 关系图断链、lint 失真。

已在 `mdast-util-to-markdown@2`(Milkdown 7.21 所用版本)lib 层与浏览器端双重证实。
**任何「WYSIWYG markdown 编辑器经 AST 往返」的方案都要先验证双链/特殊语法的逐字保真**,
这是选型时的首要风险(对应 design R5)。

## 解法:自研 Milkdown 插件三件套

`appTemplates/Knowledge/components/wikilink.ts`,经 `crepe.editor.use(wikiLink)` 注入
(`crepe.editor` 暴露底层 Milkdown `Editor`,可在 `create()` 前 `.use()` 追加插件):

1. **remark 插件(`$remark`)**——两件事:
   - 解析期 transformer:递归把 `text` 节点里的双链切成自定义 `wikiLink` mdast 节点
     (`inlineCode`/`code` 非 text,天然跳过,不会误转代码里的双中括号)。
   - 注册 `toMarkdownExtensions` handler:序列化期把 `wikiLink` 节点**原样**写回双链字面量。
     关键点:handler 的输出**绕过** `mdast-util-to-markdown` 的转义逻辑,这才是逐字保真的根因。
2. **`$node` 内联原子节点 `wiki_link`**——`atom:true, inline:true`,attrs 携 `value`;
   `parseMarkdown` 匹配 mdast `wikiLink` → PM 节点,`toMarkdown` 反向 `state.addNode('wikiLink', …, value)`;
   `toDOM` 渲染成 `<span class="wikilink" data-wikilink>` 包住双链文本。
3. **`$inputRule`**——正则匹配以 `]]` 收尾的双链,打字到收尾时把整段替换为节点。
   **不可省**:否则当次会话**新输入**的双链仍是 text 节点,保存时照样被转义;只有
   载入时已存在的链接才被 remark transformer 转过。

## 为何不用现成库

- `mdast-util-wiki-link@0.1` 仅兼容 `mdast-util-to-markdown` v1,Milkdown 用 v2,handler 接不上。
- `@portaljs/remark-wiki-link` 产出标准 `link` 节点(`[text](href)`),序列化非双链,不满足逐字。
- 自研三件套约百行、零额外依赖、完全可控,且 toMarkdown handler 的逐字保真已 lib 层验证。

## 相关踩坑(同一编辑器)

- **TOC 锚点**:不要给 heading 自注入 `data-*` 属性——ProseMirror 重渲染会擦除。改用 Milkdown
  **自带的 heading `id`**(稳定、随重渲染保留)作锚点与 IntersectionObserver 目标。
- **动态挂载时序**:编辑器是 `next/dynamic` + `ssr:false`,异步挂载可能晚于消费它 DOM 的组件
  (如 TOC),需轮询等待 `[data-doc-scroll]` 出现再挂 MutationObserver。
- **app vitest**:`next build` 的 standalone 产物会复制 `src`(含 `*.test.ts`),需在
  `vitest.config.ts` 的 `exclude` 加 `**/.next/**`,否则跑到产物副本报 tsconfig 缺失。

## 关联页

- [[knowledge-base]] · [[web]] · [[nextjs-architecture]] · [[react-patterns]] · [[core]] · [[scroll-readonly-markdown]]
