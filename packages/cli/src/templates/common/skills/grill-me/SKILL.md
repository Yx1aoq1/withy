---
name: { { SKILL_NAME } }
description: Review the active task's planning artifacts for missing boundaries and contradictions.
---

# Grill Me

Review the active task's `prd.md`, `design.md`, and `implement.md` rigorously before implementation. The purpose of this step is to find missing boundaries, hidden assumptions, contradictions, and untestable outcomes, then correct the existing artifacts.

Do not create a parallel plan and do not implement code. Update the existing artifacts in place.

## Review Process

1. Run `ttur task status --json` to identify the active task.
2. Read `.tuteur/tasks/<task-id>/prd.md`, `design.md`, and `implement.md` completely.
3. Inspect the repository evidence referenced by the artifacts and any relevant code, tests, configuration, documentation, and task history.
4. Build a review map that traces each requirement to its design treatment and implementation coverage.
5. Examine every relevant boundary category:
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
6. Resolve repository-answerable findings through inspection. Do not ask the user to confirm discoverable facts.
7. For each remaining product or scope ambiguity, ask one focused question at a time. State why it matters, give the recommended answer, and explain the trade-off of choosing differently.
8. After each answer, update all affected artifacts so they remain consistent.
9. Repeat the review map after revisions. Do not finish while a requirement lacks design treatment, a material design behavior lacks an implementation step, or the artifacts contradict one another.
10. Present the resolved boundaries and material changes to the user for approval.
11. After explicit approval, run `ttur next` and follow the command output.

## Review Rules

- Be persistent but relevant. Explore every plausible branch of the task, not hypothetical concerns unrelated to its scope.
- Treat vague words such as "fast," "secure," "simple," "graceful," and "supported" as unresolved until they have observable meaning.
- Challenge silent defaults, swallowed errors, unsupported fallbacks, and type assumptions that hide invalid states.
- Prefer the smallest behavior that satisfies the stated goal. Record excluded behavior explicitly instead of designing speculative flexibility.
- Do not accept an implementation item without a concrete verification command or observable check.
- If the artifacts disagree, surface the conflict and establish one authoritative decision across all three files.

## Completion Gate

Before requesting approval, verify that:

- every requirement has corresponding design coverage
- every acceptance criterion and material risk is covered by the implementation plan and its verification steps
- success, boundary, and failure behavior are explicit where relevant
- compatibility and migration impact are addressed or explicitly not applicable
- out-of-scope behavior is clear
- no material question, contradiction, `TBD`, or `TODO` remains

After approval, run `ttur next`. If the command reports a gate failure, report the exact blocker and remain on this step until it is resolved.
