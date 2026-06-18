---
name: { { SKILL_NAME } }
description: Produce the active task's requirements, design, and implementation plan.
---

# Brainstorm

Turn the user's request into evidence-backed requirements, a validated technical design, and an actionable implementation plan through focused collaborative dialogue.

The outputs of this step are `prd.md`, `design.md`, and `implement.md` in the active task directory. Do not implement code or modify production files during this step. Do not advance the workflow until the user has reviewed the proposed solution.

## Workflow

1. Run `ttur task status --json` to identify the active task.
2. Read the task metadata and any existing planning artifacts in `.tuteur/tasks/<task-id>/`.
3. Inspect the repository before asking questions. Check relevant code, tests, configuration, documentation, existing specifications, and task history.
4. Separate the current understanding into:
   - confirmed facts supported by repository evidence
   - user intent or preferences that still require a decision
   - scope and risk decisions that remain unresolved
   - likely out-of-scope work
5. Assess whether the request is small enough for one coherent implementation effort. If it contains multiple independent deliverables, explain the split and help the user select the first coherent scope before refining details.
6. Ask the single highest-value unresolved question. Continue one question at a time until no material ambiguity remains.
7. Update `prd.md` after each answer so it always reflects the latest shared understanding.
8. Once the requirements are stable, present two or three viable solution approaches with their trade-offs. Lead with the recommended approach and explain why it best fits the goal and constraints.
9. Develop the selected approach into `design.md`. Present the design in sections appropriate to its complexity and confirm each section with the user before continuing.
10. Derive `implement.md` from the approved requirements and design. Order the work by dependency, express every step as a Markdown checkbox, and include its verification.
11. Review all three artifacts for contradictions, placeholders, unsupported assumptions, and missing boundaries. Fix issues before presenting the complete plan.
12. After the user approves the complete plan, run `ttur next` and follow the command output.

## Question Rules

- Never ask the user for facts that can be discovered from the repository. Investigate them directly.
- Ask exactly one question per message.
- Prefer concise multiple-choice questions when the choices are known; use an open-ended question when discovery is needed.
- Each question must state:
  - the decision needed
  - why it matters
  - the recommended answer
  - the trade-off of choosing differently
- Ask only about product intent, user preference, scope boundaries, constraints, or risk tolerance that remain ambiguous after inspection.
- Do not ask permission to inspect files, continue brainstorming, or perform other routine evidence gathering.
- Challenge unnecessary scope and unsupported assumptions. Keep the smallest solution that satisfies the stated goal.
- If a new answer contradicts repository evidence or an earlier decision, point out the conflict and resolve it before continuing.

## Artifact Requirements

### `prd.md`

Write the file in `.tuteur/tasks/<task-id>/prd.md` with these sections:

```markdown
# <Task Title>

## Goal

<The problem to solve and the value it creates.>

## Confirmed Facts

- <Relevant facts supported by repository evidence.>

## Requirements

- <Required user-visible or system behavior.>

## Acceptance Criteria

- [ ] <Observable, testable outcome.>

## Out of Scope

- <Explicitly excluded behavior or follow-up work.>

## Open Questions

- None.
```

Adapt the amount of detail to the task, but keep every section. Cite repository paths when a confirmed fact depends on existing implementation or documentation.

Requirements describe behavior and constraints, not an implementation plan. Do not prescribe architecture, file changes, libraries, or step-by-step implementation unless the user has made one of them an explicit requirement.

Acceptance criteria must be independently verifiable and cover the main success path, important boundaries, and required failure behavior. Do not use vague criteria such as "works correctly," "is user-friendly," or "handles errors."

Keep unresolved blockers in `Open Questions`. The plan is not ready while that section contains a material open question.

### `design.md`

Write `design.md` only after the requirements are stable. Include:

```markdown
# Design: <Task Title>

## Summary

<The selected approach and why it was chosen.>

## Architecture and Boundaries

<Affected areas, responsibilities, interfaces, and explicit boundaries.>

## Components

<Each component's purpose, inputs, outputs, and dependencies.>

## Data Flow and Contracts

<Important state transitions, data shapes, APIs, and invariants.>

## Error Handling and Edge Cases

<Expected failures, boundary conditions, and required behavior.>

## Compatibility and Migration

<Compatibility constraints, migration needs, or "None" with a reason.>

## Testing Strategy

<How the behavior and important boundaries will be verified.>

## Risks and Rollback

<Material risks, mitigations, and rollback approach.>
```

Keep the design proportional to the task. A small change may need only a few sentences per relevant section, while a cross-module change requires explicit contracts and data flow.

Design units must have one clear responsibility and well-defined interfaces. For each unit, state what it does, how callers use it, and what it depends on. Follow existing repository patterns unless the task provides a concrete reason to change them.

Do not turn the design into a file-by-file implementation script. Include file paths only when they clarify an existing boundary or identify a known integration point.

### `implement.md`

Write `implement.md` as an ordered execution plan derived from the requirements and design:

```markdown
# Implementation Plan

- [ ] <Implementation step> — Verify: `<command or observable check>`
- [ ] <Implementation step> — Verify: `<command or observable check>`
```

Each item must describe one coherent implementation step and how to verify it. Order items so prerequisites come first, keep risky migration or rollback points explicit, and include the tests or manual checks required before the next dependent step begins.

Use checkbox bullets for every implementation item because progress is parsed from this file. Avoid other bullet-list syntax in `implement.md`; use paragraphs, headings, or fenced code blocks for supporting notes so non-checkbox bullets are not mistaken for malformed progress items.

Do not repeat acceptance criteria verbatim. `prd.md` defines the observable outcomes; `implement.md` describes the work required to achieve and verify them.

## Completion Gate

Before asking for approval, verify that:

- the goal and user value are explicit
- every confirmed fact is supported by inspected evidence
- requirements are unambiguous and internally consistent
- acceptance criteria are observable and testable
- scope exclusions are explicit
- no material product or scope question remains open
- the design covers architecture, boundaries, data flow, errors, compatibility, testing, and risks where relevant
- every implementation item traces to a requirement, design constraint, or identified risk
- the three artifacts do not contradict one another
- no artifact contains placeholders such as `TBD` or `TODO`

After the user approves, ensure all three artifacts contain the approved plan, then run `ttur next`. If the command reports a gate failure, report the exact blocker and remain on this step until it is resolved.
