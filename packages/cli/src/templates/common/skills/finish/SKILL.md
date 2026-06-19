---
name: {{SKILL_NAME}}
description: Wrap up a {{PRODUCT_NAME}} workflow — reconcile the working tree, capture durable lessons into the knowledge base, then complete and archive the task. Produces no artifact of its own; runs on whatever is in the working tree.
---

# Finish

This is the wrap-up step: confirm the work is settled, capture what it taught for future work, and close the task out — completing the workflow and archiving it. It produces no artifact of its own and runs on whatever is actually in the working tree and the task directory, so it behaves the same whether the change went through full planning, skipped straight to implementation, or produced only research findings.

## Survey What Actually Happened

The verification step has already reviewed the diff and run the project's checks on the code routes; finish does not re-review or re-run them. It surveys the final state only to capture lessons and reconcile the tree — and on the research route, which reaches this step without a verification pass, this is the first and only look at whatever was produced.

Ground the wrap-up in the real state, not in memory of the plan:

1. Run `withy task status --json` to identify the active task. Read its `status`, `node`, and `artifacts` array — the artifacts a task carries vary by route, and the array may be empty. Treat whatever is there as the record; do not assume a fixed set of files.
2. Inspect the actual change:

```bash
git status
git diff HEAD
git log --oneline -10
```

Read what the diff actually does. The diff and the task's own documents — not your recollection of what you meant to do — are the source of truth for the consistency check below, the lessons you capture, and the recap you give.

## Confirm the Implementation Matches the Task's Documents

Before closing out, confirm the change that now exists matches what the task's own documents describe. Read the files named in the `artifacts` array from `withy task status --json` — typically `prd.md` (required behavior and acceptance criteria), `design.md` (the chosen approach), and `implement.md` (the planned steps) when the task produced them — and check the diff against each:

- Every required behavior and acceptance criterion the documents state is actually delivered by the code.
- The approach the code takes is the one `design.md` describes, not a silently different design.
- Each `implement.md` step is done, or its omission is intentional and explained.

When the implementation and the documents agree, say so and continue. When they diverge — a stated requirement the code does not meet, behavior the code adds that no document mentions, a design the code departed from, or planned steps left undone — do not close out silently. Tell the user the specific divergence and let them decide how to resolve it: bring the code in line, update the documents to match the real decision, or accept the gap as out of scope.

If `artifacts` is empty — a small or research route that produced no planning documents — there is nothing to compare against; note that and proceed.

## Reconcile the Working Tree

Decide what each uncommitted path is before closing out. Run `git status --porcelain` and classify every dirty path:

- **This task's work** — part of what the task set out to do. It belongs in version control before the task is closed; surface it and, unless you already have authorization to commit, ask the user how they want it handled rather than committing on your own.
- **Unrelated work** — another window's parallel work or pre-existing local edits. Report it once and leave it untouched.
- **Unsure** — ask the user once whether it is part of this task or something to leave alone. Do not guess.

Do not run destructive git commands and do not commit without authorization. Surfacing the state accurately is the job here.

## Capture Durable Knowledge

This is the workflow's single place for recording what it learned. If the work produced a lesson future work would otherwise rediscover — a non-obvious constraint, a decision and its rationale, a pitfall and its fix — write it into the knowledge base (`.withy/knowledge/` for this repository, or `~/.withy/knowledge/` when it holds across projects) instead of letting it dissolve into the conversation.

Follow the knowledge skill for how the base is organized and how to ingest a source, place an entry, and cross-link it — do not hand-edit the files by guessing the layout. Skip this entirely when nothing durable came out of the work; do not manufacture entries.

## Close Out the Workflow

Give the user a short, plain-language recap of the outcome — what was delivered (or, for a research task, what was concluded), how it was verified, and any known risk or follow-up left open. This is a spoken recap for the user, not a file; this step writes no summary artifact.

Then run `withy next` and follow the command output:

- This is the final node, so a successful advance returns `node: null` — the task is marked completed, its `completedAt` is recorded, and the active-task pointer is cleared. Report plainly that the workflow is complete.
- If it reports a gate failure, report the exact blocker from its output and remain on this step until it is resolved. Do not use `--skip` to get past a genuine failure.

## Archive the Task

Completing the workflow and archiving the task are separate steps: `withy next` marks the task completed but leaves it in the active list. Archiving moves the whole task directory into `tasks/archive/<YYYY-MM>/` — the right close-out once the work is wrapped up and nothing is left pending on it.

Ask the user whether to archive, then act on the answer:

- Archive — run `withy task archive <task-id>`.
- Keep — leave it in the active list; it can be archived at any time later.

Do not archive while task work from the reconcile step is still uncommitted or unresolved.
