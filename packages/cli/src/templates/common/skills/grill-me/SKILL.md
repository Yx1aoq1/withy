---
name: {{SKILL_NAME}}
description: Stress-test the active task's already-decided planning artifacts before building. Discovers whatever artifacts the task actually produced, then grills them relentlessly for missing boundaries, hidden assumptions, and contradictions.
---

# Grill Me

Pressure-test the content the active task has already tentatively decided, before any of it is built. The purpose of this step is to find missing boundaries, hidden assumptions, contradictions, vague language, and untestable outcomes in the existing artifacts, then correct them in place.

Work only from the task's own artifacts and the repository. Do not rely on any external description — from another skill, from earlier conversation, or from this document — of which artifacts the task is supposed to have. Read the task directory and grill whatever is actually there.

This is a reviewing-and-asking step, not a building step. Do not create a parallel plan and do not write or modify production code. Update the existing artifacts in place.

## Discover the Material

1. Run `withy task status --json` to identify the active task and read its `artifacts` array. That array lists the planning documents the task has actually produced, sourced from the task itself.
2. Read every file named in `artifacts` from `.withy/tasks/<task-id>/`. Treat exactly those documents as the material under test. Do not assume a fixed set of filenames; the artifacts a task carries vary by workflow.
3. If `artifacts` is empty, say so and stop. There is nothing to pressure-test yet, and the earlier planning step must run first.

## Grilling Process

1. Inspect the repository evidence the artifacts rely on, plus any relevant code, tests, configuration, documentation, and task history.
2. Build a review map that traces each stated requirement to its design treatment and its implementation coverage across the discovered artifacts.
3. Walk every plausible branch of the decision tree the artifacts imply, resolving dependencies between decisions one at a time. For each branch, examine the boundaries that apply:
   - actors, permissions, and ownership
   - inputs, outputs, validation, and defaults
   - state transitions, ordering, and lifecycle
   - empty, minimum, maximum, duplicate, and malformed cases
   - concurrency, retries, cancellation, and idempotency where applicable
   - partial failure, recovery, rollback, and observability
   - compatibility, migration, and existing consumer behavior
   - security, privacy, accessibility, and performance where applicable
   - testing strategy, implementation verification, and independently verifiable acceptance outcomes
   - explicit out-of-scope behavior and follow-up work
4. Resolve repository-answerable findings by inspection. Never ask the user to confirm a fact you can discover from the codebase.
5. For each remaining product or scope ambiguity, ask one focused question at a time, then stop and wait for the answer. State the decision needed, why it matters, your recommended answer, and the trade-off of choosing differently. Asking several questions at once is bewildering.
6. After each answer, update every affected artifact so they stay consistent with one another.
7. Rebuild the review map after revisions. Do not finish while a requirement lacks design treatment, a material design behavior lacks an implementation step, or the artifacts contradict one another.
8. Present the resolved boundaries and the material changes to the user for approval.

## Grilling Rules

- Be relentless but relevant. Walk every branch the task actually opens, not hypothetical concerns unrelated to its scope.
- Treat vague words such as "fast," "secure," "simple," "graceful," and "supported" as unresolved until they have an observable meaning.
- Challenge silent defaults, swallowed errors, unsupported fallbacks, and type assumptions that hide invalid states.
- Do not accept an implementation item without a concrete verification command or observable check.
- If the artifacts disagree, surface the conflict and establish one authoritative decision across every affected file.

## Completion Gate

Before requesting approval, verify that across the discovered artifacts:

- every requirement has corresponding design coverage
- every acceptance criterion and material risk is covered by an implementation step and its verification
- success, boundary, and failure behavior are explicit where relevant
- compatibility and migration impact are addressed or explicitly marked not applicable
- out-of-scope behavior is clear
- no material question, contradiction, `TBD`, or `TODO` remains

After the user approves, run `withy next` and follow the command output. If the command reports a gate failure, report the exact blocker from its `blocked` output and remain on this step until it is resolved.
