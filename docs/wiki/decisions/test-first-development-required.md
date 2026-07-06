---
type: decision
status: current
updated: 2026-06-03
sources:
  - AGENTS.md
  - agent-assets/superpowers/skills/test-driven-development/SKILL.md
tags:
  - project-docs
  - wiki/decision
  - testing
---

# Test-First Development Required

## Decision

Every new task that changes source code or product behavior must follow a test-first workflow after the required project wiki startup check and before any production code edit.

## Required Order

1. Read the required project wiki context and relevant feature docs.
2. Invoke the local
   `agent-assets/superpowers/skills/test-driven-development/SKILL.md` skill for
   code-changing work.
3. Write or update tests and explicit test cases first.
4. Run the new targeted tests and confirm they fail for the expected reason.
5. Implement the minimal production code needed to pass.
6. Rerun targeted tests, then the relevant broader suite.
7. Update durable feature/wiki documentation when behavior or test coverage changes.

## Test Coverage Expectations

- Full automated tests for the changed behavior, including unit or integration coverage as appropriate.
- E2E tests for affected user journeys, API flows, or cross-system behavior.
- A concrete test case checklist covering happy paths, edge cases, validation and error states, permissions or security when relevant, and regression scenarios.
- Frontend tests must be written in JavaScript or TypeScript and reuse the project's existing JS test stack when available.
- Backend tests must be written in Python and reuse the project's existing Python test stack when available.

## Missing Harness Rule

If a repository lacks a suitable test harness, the first implementation step is to add the smallest appropriate test setup. If adding a harness is unsafe or out of scope, document the blocker and ask the user before changing production code.

## Rationale

The project treats tests as the executable specification for code changes. Writing tests first proves that the test can catch missing behavior, makes expected behavior explicit before implementation bias appears, and preserves repeatable coverage for future work.
