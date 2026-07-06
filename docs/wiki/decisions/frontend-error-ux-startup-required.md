---
type: decision
status: current
updated: 2026-05-28
sources:
  - ../../AGENTS.md
  - ../../tools/install-agent-assets.ps1
  - ../../agent-assets/frontend/skills/frontend-error-ux/SKILL.md
  - ../../agent-assets/frontend/skills/frontend-agent/SKILL.md
tags:
  - project-docs
  - wiki/decision
  - frontend
  - error-ux
---

# Frontend Error UX Startup Required

## Decision

Every frontend project initialized or onboarded from this workspace must run the
project-local `frontend-error-ux` skill immediately during startup.

The startup audit must check for:

- A designed 404 / Not Found page wired into the router or framework.
- A reusable blocking error modal/dialog pattern for user-facing failures that
  need acknowledgement, retry, refresh, or navigation.
- A root-level crash fallback for white-screen and uncaught runtime failures.
- An offline screen-blocking overlay/modal that appears when internet
  connectivity is lost and tells the user there is no connection.

## Rationale

These surfaces are app-level trust and recovery behavior, not optional polish.
They should be present before feature work piles more routes and network flows
on top of the project.

## Consequences

- `tools/install-agent-assets.ps1` includes the local
  `agent-assets/frontend/skills/frontend-error-ux/SKILL.md` skill in target
  projects and writes the startup rule into the managed `AGENTS.md` block.
- `frontend-agent` reads `frontend-error-ux` during required startup, before
  ordinary implementation work.
- If a target app lacks any required surface, the agent should add tests first,
  implement the smallest project-fitting UI, and update `docs/wiki/`,
  `docs/frontend/`, and nearby `FEATURE.md` files.
- If source changes are out of scope, the gap should be documented as follow-up
  work instead of silently accepted.

## Verification

- Installer test asserts that target projects receive the `frontend-error-ux`
  skill and the managed startup rule.
- Agent asset verification asserts the bundled skill and agent metadata exist.
- Frontend audit docs include checks for unknown routes, error modals, crash
  fallbacks, and offline no-internet blockers.
