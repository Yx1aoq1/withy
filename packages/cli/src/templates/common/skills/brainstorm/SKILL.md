---
name: {{SKILL_NAME}}
description: Required before any build work — a feature, component, behavior change, or refactor. Interviews the user one question at a time to turn a raw request into validated requirements, a technical design, and an implementation plan before any code is written.
---

# Brainstorm

Turn the user's request into evidence-backed requirements, a validated technical design, and an actionable implementation plan through focused, one-question-at-a-time dialogue. This is a thinking-and-asking step, not a building step.

The outputs are `prd.md`, `design.md`, and `implement.md` in the active task directory. Do not write or modify production code, scaffold files, or take any other implementation action during this step. Do not advance the workflow until the user has reviewed and approved the proposed solution.

## This Applies Even When the Task Looks Simple

Every request goes through this step — a one-line utility, a config tweak, a small bug fix included. "Too simple to design" is exactly where unexamined assumptions waste the most work. Scale the depth to the task: a trivial change may need only a few sentences per artifact, but you still produce the artifacts and still get the user's approval before building.

## Workflow

1. Run `withy task status --json` to identify the active task.
2. Read the task metadata and any existing planning artifacts in `.withy/tasks/<task-id>/`.
3. Inspect the repository before asking anything. Check relevant code, tests, configuration, documentation, existing specifications, and task history.
4. Separate your current understanding into:
   - confirmed facts supported by repository evidence
   - user intent or preferences that still require a decision
   - scope and risk decisions that remain unresolved
   - likely out-of-scope work
5. Assess scope. If the request bundles several independent deliverables, say so immediately and help the user pick the first coherent scope before refining details. Do not spend questions polishing a request that needs to be split first.
6. Ask the single highest-value unresolved question, then stop and wait for the answer. Continue one question at a time until no material ambiguity remains.
7. Update `prd.md` after each answer so it always reflects the latest shared understanding.
8. Once the requirements are stable, present two or three viable solution approaches with their trade-offs. Lead with the recommended approach and explain why it best fits the goal and constraints.
9. Develop the selected approach into `design.md`. Present the design in sections scaled to its complexity and confirm each section with the user before continuing.
10. Derive `implement.md` from the approved requirements and design. Order the work by dependency, express every step as a Markdown checkbox, and include its verification.
11. Self-review all three artifacts for contradictions, placeholders, unsupported assumptions, and missing boundaries. Fix issues before presenting the complete plan.
12. After the user approves the complete plan, run `withy next` and follow the command output.

## Question Rules

- Never ask the user for facts that can be discovered from the repository. Investigate them directly. Only ask about product intent, user preference, scope boundaries, constraints, or risk tolerance that remain ambiguous after inspection.
- Ask exactly one question per message, then wait for the answer. Do not batch questions, and do not answer your own questions to keep moving.
- Prefer a concise multiple-choice question when the choices are known; use an open-ended question only when discovery is needed.
- Each question must state:
  - the decision needed
  - why it matters
  - the recommended answer
  - the trade-off of choosing differently
- Do not ask permission to inspect files, continue brainstorming, or perform other routine evidence gathering. Just do it.
- Challenge unnecessary scope and unsupported assumptions. Keep the smallest solution that satisfies the stated goal, and record what you deliberately leave out.
- If a new answer contradicts repository evidence or an earlier decision, point out the conflict and resolve it before continuing.

## When Requirements Are Vague

If the request is fuzzy, or a proposed solution feels over-built, reason from first principles before asking:

1. Restate the underlying problem in one sentence, stripped of any assumed solution.
2. List what is actually true — hard constraints, business rules, real user needs — and separate fact from convention.
3. For each part of the assumed approach, ask whether one of those truths requires it or whether it is just habit. Drop anything nothing depends on.
4. Build the smallest mechanism that satisfies the truths, adding complexity only when a specific truth demands it.

Then ask the user only about the intent and trade-offs that remain genuinely undecided.

## Optional Visual Aid

Some questions are clearer shown than described — a screen layout, a wireframe, two designs side by side, an architecture diagram, or a data-flow sketch. Offer a visual aid only when such a question first comes up, never upfront, and only if you have some way to render one (for example a browser tab, an HTML canvas, an image, or a rendered diagram).

Make the offer its own message, containing nothing but the offer:

> "This next part might be easier if I show you rather than describe it. I can put together a quick mockup or diagram for us to look at as we go — it takes a little extra time. Want me to, or should we keep it in text?"

Then wait for the answer. If the user agrees, use the visual only for questions that are genuinely visual, and keep purely conceptual questions (requirements, trade-off lists, scope choices, lettered text options) in text. If the user declines, continue in text and do not offer again unless they raise it. If you have no way to render visuals, skip the offer and describe clearly in text.

## Exploring Approaches

- Propose two or three distinct approaches, not minor variations of one idea.
- Present them conversationally, lead with your recommendation, and explain the reasoning.
- Make the trade-offs explicit: what each approach optimizes for and what it gives up.

## Designing for Isolation and Clarity

- Break the system into units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently.
- For each unit, be able to answer: what does it do, how do callers use it, and what does it depend on?
- Follow existing repository patterns. In an existing codebase, explore the current structure before proposing changes, and include only targeted improvements that serve the current goal. Do not propose unrelated refactoring.

## Artifact Requirements

### `prd.md`

Write the file in `.withy/tasks/<task-id>/prd.md` with these sections:

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

After the user approves, ensure all three artifacts contain the approved plan, then run `withy next`. If the command reports a gate failure, report the exact blocker and remain on this step until it is resolved.
