---
name: {{SKILL_NAME}}
description: Maintain the {{PRODUCT_NAME}} knowledge base — ingest sources, answer from the wiki, and keep it consistent.
---

# Knowledge Base Maintenance

TODO(占位): 本 skill 指导 agent 如何维护 `.tuteur/knowledge/`(项目)与 `~/.tuteur/knowledge/`(全局)知识库。
设计依据见 `docs/design/knowledge.md`(参考 karpathy「LLM Wiki」模式)。待填实的内容:

- **统一路径**: 全局/项目同构 `<scope-root>/knowledge/`(`sources/` 原始源 + `wiki/` LLM 维护页 + `index.md` 目录 + `log.md` 时间线)。
- **默认写项目库**(`.tuteur/knowledge/`);只有用户明说「记到全局/我的个人知识库」才动 `~/.tuteur/knowledge/`。判断:换个项目还成立 → 全局;只对本仓库有意义 → 项目。
- **Ingest**: 读入 `sources/` 新源 → 写/更新 `wiki/` 摘要与实体页 → 更新 `index.md` → 追加 `log.md`(`## [YYYY-MM-DD] ingest | 标题`)。
- **Query**: 先读 `index.md` 定位相关页再下钻;好的回答回填成新 wiki 页,使探索复利。
- **Lint**: 体检——矛盾、过期断言、孤儿页、缺失交叉引用、可补的空白。
- **约定**: 页用 frontmatter(`id/title/scope/kind/tags/summary/injectByDefault`);页间用 `[[id]]` 链接(关系图据此派生)。
- **不变量**: 人负责选源/提问/审阅;agent 负责一切 bookkeeping(摘要、交叉引用、归档、一致性)。
