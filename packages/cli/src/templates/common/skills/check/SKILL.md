---
name: { { SKILL_NAME } }
description: Verify recently written code before it advances — review the diff, run the project's checks, fix every failure, and capture durable lessons. Runs on whatever is in the working tree; needs no planning artifact.
---

# Check

This is the verification step: confirm the code that now exists is correct, complete, and clean before the workflow advances. It runs on whatever is actually in the working tree and does not depend on the output of any earlier step, so it behaves the same however the change was produced.

## Identify What Changed

Ground the review in the real diff, not in memory of what you intended to write:

```bash
git status
git diff HEAD
```

Read the changed files and note the modules, layers, and public surfaces they touch. Scope the rest of the review to what changed and what depends on it — do not audit untouched code.

## Run the Project's Checks

Run the project's linter, type checker, and test suite, using whatever commands this repository defines. Fix every failure before continuing — do not silence warnings, skip tests, or work around a red result.

`withy next` re-runs the workflow's configured checks as a gate at the end of this step, so anything failing here will block the advance regardless. Getting the suite green now is the work, not a formality.

## Review the Diff Against a Checklist

### Code Quality

- [ ] Linter passes with no new warnings.
- [ ] Type checker passes (if the project is typed).
- [ ] Tests pass.
- [ ] No debug logging, commented-out code, or scratch files left behind.
- [ ] No suppressed warnings or type-safety bypasses added to get past a check.

### Test Coverage

- [ ] New behavior has a test that would fail without the change.
- [ ] A bug fix has a regression test that reproduces the original bug.
- [ ] Changed behavior has its existing tests updated to match.

### Intent

- [ ] The diff does only what was asked — no unrelated edits, reformatting, or scope creep.
- [ ] The change actually delivers the behavior it set out to, judged from the code and its tests alone.

## Cross-Cutting Review

Skip this when the change is confined to a single file or layer. Apply each dimension that the diff actually touches:

- **Data flow** — when the change spans multiple layers, trace one path end to end (storage → service → API → UI and back). Confirm types, schemas, and errors are passed and propagated correctly across the boundaries.
- **Reuse** — before adding a constant, helper, or pattern, grep for an existing one and use it. If the same value now lives in two places, extract it.
- **Imports and dependencies** — new files use correct import paths and introduce no circular dependencies.
- **Consistency** — other code expressing the same concept still agrees with the changed code after a batch edit.

## Report and Fix

State plainly what you found, then fix it directly in the working tree. After fixing, re-run the project's checks. Keep fixing and re-running until the checklist is clean and every check passes — do not report "done" while anything is still red.

## Finish the Step

Run `withy next` and follow the command output. If it reports a gate failure, the configured checks are still failing — report the exact blocker from its output and remain on this step until it passes. Do not use `--skip` to get past a genuine failure.
