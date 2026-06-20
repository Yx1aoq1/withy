# Withy workflow guide

Withy is available as a task workflow tool. Before you write or edit any code for build work — a feature, a
behavior change, a refactor, or anything beyond a trivial one-line fix — stop and propose creating a task first; do not
start the work until the user agrees or declines. Pure questions, explanations, and read-only investigation need no
task. When unsure, ask rather than assume it is too small.

If the user agrees, follow the Next-Action injected below to start the task, then follow the injected workflow state.
The workflow — not you — decides whether the task is light or full; do not bypass it. If the user declines, continue
without one.

## Rules

- When an active task already covers the user's request, continue that task instead of asking to create another one.
- The flow advances only via `withy next`; on a skill node, run the node's skill first and let it advance once the step is genuinely done. An agent claiming "done" does not advance a step.
- Steps that declare artifacts / checks / approvals must pass their gate before moving on.
- When the next move is unclear, follow the injected Next-Action.

## Task commands

```bash
withy task start "<title>"   # create a task from a title, or focus an existing task id
withy task status            # show the current task's node and phase
withy task list --mine       # list your tasks (drop --mine to see everyone's)
withy next                   # advance the current node — the core flow primitive
withy approve                # record human approval for a gated node
```

## Discover more

The list above is just the essentials. For the full surface, ask the CLI — its help always matches the installed version:

```bash
withy -h            # all top-level commands (task, next, approve, rewind, knowledge, ...)
withy task -h       # task subcommands: status, list, start, archive
withy <command> -h  # flags and details for any single command
```
