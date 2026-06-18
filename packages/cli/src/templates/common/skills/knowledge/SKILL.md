---
name: { { SKILL_NAME } }
description: Maintain the {{PRODUCT_NAME}} knowledge base — ingest sources into a cross-linked wiki, answer questions from it, and keep it consistent. Invoked on demand to record a durable lesson or manage the base; you choose what goes in, the skill does the bookkeeping.
---

# Knowledge Base Maintenance

This skill maintains a durable, compounding wiki so that what a project and a user learn is written down once and reused, instead of being re-derived every session. The division of labor is fixed: you choose the sources, the direction, and what is worth keeping; the skill does the bookkeeping — summarizing, cross-linking, indexing, and flagging contradictions. It is invoked on demand — when another step hands over a durable lesson, or when you ask to ingest, query, or tidy the base.

## Pick the Base: Project or Global

There are two bases with identical layout, differing only in where they live and who they serve:

- **Project** — `.withy/knowledge/` in this repository: its architecture, domain model, conventions, and pitfalls. Committed and team-shared.
- **Global** — `~/.withy/knowledge/` on this machine: your cross-project knowledge — personal standards, preferences, general references. Never committed.

Default to the project base. Write to the global base only when the user explicitly says to record it globally or personally. The deciding question: would this knowledge still hold in a different project? If yes, it is global; if it only means something in this repository, it is project. Every command below operates on one base at a time — the project base by default, the global base with `--global`.

## Layout

Both bases share this shape under their `knowledge/` root:

```text
knowledge/
  sources/        # raw source material — read-only; never edit a source
  wiki/           # the maintained pages
    <id>.md       #   a page, with frontmatter (see below)
    <topic>/      #   a sub-directory, opened only when one area outgrows the flat root
      index.md    #     that directory's index
      <id>.md
  index.md        # the root catalog — the navigation entry point
  log.md          # an append-only timeline of ingest / query / lint actions
```

Keep `wiki/` flat by default. Open a `wiki/<topic>/` sub-directory only when one area has grown too large to scan from the root index — do not pre-partition.

## Page Frontmatter

Every `wiki/<id>.md` begins with frontmatter that drives navigation, the web list, and how the entry is injected into sessions:

```yaml
---
id: api-conventions          # stable identifier — injection and [[links]] resolve by id, so a rename or move never breaks references
title: API conventions
kind: summary                # summary | entity | concept | comparison | spec | overview | template
tags: [backend, convention]
summary: REST naming, error codes, pagination rules.   # one line; what the index and index-mode injection show
inject: index                # index (default) injects title + summary + path; full injects the whole body
injectByDefault: false       # whether it joins the default injection set
sources: [sources/rest-rfc.md]   # which raw sources this page synthesizes (traceable)
updated: 2026-06-19
---
```

Use `inject: full` only for short, must-read content — a terse convention, or a `kind: template` page whose body is an artifact skeleton other skills fill in. Long references stay `inject: index` so a session gets the pointer and drills in on demand.

## Ingest

When the user adds material to `sources/` and signals to process it:

1. Read the source in full, and read the existing `wiki/` pages it touches.
2. Confirm the key points with the user wherever the takeaway is ambiguous — do not invent a position the source does not support.
3. Write or update the affected pages: a summary page for the source, plus the entity, concept, or comparison pages it informs. One source commonly touches several pages.
4. Cross-link with `[[id]]`. When two pages relate, link them both ways; a link to an id that has no page yet is a valid marker that the page is worth writing.
5. Rebuild the indexes and record the action (see **After You Change the Base**).

## Query

When asked something the base should know:

1. Read the root `index.md` to locate the relevant area, then drill into the listed pages and any sub-directory `index.md`.
2. Follow `[[id]]` links one or two hops to neighbours. Use your own Grep/Glob inside `knowledge/` to fill gaps the index does not surface — reading the files directly is the retrieval mechanism, and there is no search command.
3. Answer with citations to the page ids you used.
4. When the answer is itself durable — a comparison, an analysis, a relationship you discovered — file it as a new page so the work compounds instead of dissolving into the conversation.

## Lint and Keep It Consistent

Run `withy knowledge lint` (add `--global` for the global base) for a mechanical health check: orphan pages with no inbound link, links pointing at a page that does not exist, and dangling injection references. Resolve what it surfaces — add the missing cross-link, fix or remove the broken link, create the absent page.

Beyond the mechanical check, watch for what the linter cannot see: a claim a newer source has overturned, two pages that now contradict each other, a concept mentioned everywhere but lacking its own page. Reconcile contradictions into one authoritative statement rather than leaving both standing.

To see how pages connect, run `withy knowledge graph` (`--global` for global, `--merged` for a combined global + project view) — useful for spotting hubs and isolated pages.

## After You Change the Base

Two deterministic chores close out any ingest or edit. Let the commands do them rather than editing by hand:

1. Run `withy knowledge index` (add `--global` to match the base you changed) to recompute every level's `index.md` from page frontmatter. Hand-maintaining multi-level indexes drops pages; the command does not.
2. Append one line to `log.md` recording what you did:

```text
## [2026-06-19] ingest | API conventions    (touched: api-conventions, error-codes)
## [2026-06-19] query  | pagination options  (filed: pagination-comparison)
## [2026-06-19] lint   | 3 orphans, 1 stale claim flagged
```

## Invariants

- The user picks the sources, sets the direction, and reviews; the skill does everything else — summaries, cross-references, indexing, consistency.
- Sources in `sources/` are immutable. Synthesize from them in `wiki/`; never edit a source.
- Identifiers are stable. Reference pages by `id`, never by path, so moving a page between directories never breaks a link or an injection.
- Indexes are generated, not authored. Recompute them with `withy knowledge index`; do not hand-edit `index.md`.
