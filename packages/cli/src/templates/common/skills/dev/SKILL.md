---
name: {{SKILL_NAME}}
description: Implement the active task's approved plan — consult the project and global knowledge bases first, reuse what they already settle, and verify each step.
---

# Dev

This is the execute step: turn the active task's approved plan into working code. Before writing anything, consult the knowledge base so you reuse what the project and the user already know instead of re-deriving it or contradicting it. This consultation is mandatory, not optional — the same way reading the plan is.

## Read the Approved Plan

1. Run `withy task status --json` to identify the active task and read its `artifacts` array, which lists the planning documents the task actually produced.
2. Read every file named in `artifacts` from `.withy/tasks/<task-id>/` — typically `prd.md` (required behavior), `design.md` (the chosen approach), and `implement.md` (the ordered, checkbox execution steps). These are the contract. Do not expand scope beyond them.

## Consult the Knowledge Base (before coding)

Session start has already injected the required knowledge index. Treat those injected entries and each root `index.md` as your entry point — the index is not the goal, it points you to the real pages. There are two scopes with the same layout:

- Project — `.withy/knowledge/`: this repository's architecture, domain model, conventions, and pitfalls (team-shared, committed).
- Global — `~/.withy/knowledge/`: your cross-project knowledge — personal standards, preferences, and general references.

Navigate by progressive disclosure, drilling down only into what the work touches:

1. Read the root `index.md` in each scope (`.withy/knowledge/index.md` and `~/.withy/knowledge/index.md`) to locate relevant areas.
2. Drill into the listed `wiki/<id>.md` pages, and into any `wiki/<topic>/index.md` sub-index, that match the packages you will modify and the kind of work (backend, frontend, data, etc.).
3. Open the matching pages and follow their `[[id]]` cross-links one or two hops to neighbours.
4. Use your own Grep/Glob inside each `knowledge/` tree to fill gaps the index does not surface.

When project and global define the same `id`, the project page wins — prefer the repository's convention over the global default.

## Reuse and Cite the Source

- Reuse what you find. Apply the existing conventions, patterns, error-handling rules, and prior decisions rather than inventing new ones. If a knowledge page already answers a design question, follow it.
- Cite the source whenever a choice rests on a knowledge entry. Name the entry `id` and its path — for example, "per `api-conventions` (`.withy/knowledge/wiki/api-conventions.md`)" — in your explanation to the user, the commit message, or a code comment where it clarifies intent. Do not present reused knowledge as if it were freshly invented.
- Surface conflicts. If the knowledge base contradicts the task plan or the current code, state the conflict, the choice you would make, and why; do not silently pick one side.

## Implement

- A previous session may have already implemented part of this. First run `git status` / `git diff` and reconcile the working tree against `implement.md` — the code is the source of truth for progress, not memory. Continue from the first step not yet reflected in the code; do not redo work that is already there.
- Work through `implement.md` in order. Each step carries its own verification — run that check before starting the next dependent step.
- Match the surrounding code's existing style, naming, and structure, and touch only what the plan requires.
- If you discover durable, reusable knowledge while implementing, hand it to the knowledge skill instead of burying it in the conversation. Keep this step focused on shipping the approved plan.

## Finish the Step

Run `withy next` and follow the command output. If it reports a gate failure, report the exact blocker from its output and remain on this step until it is resolved.
