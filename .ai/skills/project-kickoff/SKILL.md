---
name: project-kickoff
description: MANDATORY first step whenever a NEW project, app, service, epic, major feature, or greenfield codebase begins. Runs the architecture approval gate BEFORE any code — activates superpowers (skills), clarifies intent, designs and gets the architecture explicitly APPROVED by the user, records an ADR, then routes to implementation. Use on "new project", "let's build", "start a", "create an app/service/system", empty/near-empty folders, or the first substantive request in a fresh codebase.
---

# Project Kickoff — Architecture Approval Gate

The problem this solves: on new work, implementation starts before superpowers (skills) engage and before the architecture is agreed. This skill forces a **hard gate**: no implementation code until the architecture is explicitly approved by the user.

## When this fires

ANY of:
- User says "new project", "let's build", "start", "create an app/service/system/dashboard", "I want to make…"
- The working folder is empty or near-empty (no real source yet)
- First substantive feature in a fresh codebase
- A change large enough to be its own epic/module/integration

If unsure whether something counts as "new" → run this skill. The gate is cheap; rework is not.

## The gate (run in order — do NOT skip ahead)

### 0. Activate superpowers
Read and follow `using-superpowers` first. Confirm the relevant domain router skills are loaded (e.g. `frontend-agent`, `backend-patterns`). Skills coordinate; do not improvise past them.

### 1. Refine the request
Invoke `prompt-refiner` to shape vague/short/mixed-language asks into a clear task. Do not proceed on a fuzzy brief.

### 2. Brainstorm intent & requirements
Invoke `brainstorming` to explore intent, constraints, users, scope, and non-goals BEFORE any design. Capture: problem, target users, must-haves, explicit non-goals, constraints (stack, deadlines, scale).

### 3. Design the architecture
Invoke `feature-architecture`. Produce:
- Component / boundary breakdown
- Data model + flows
- Stack decision (must honor the **Frontend Standard** in CLAUDE.md when frontend is involved)
- Mermaid diagrams (C4 / sequence / ER)
- Trade-offs and at least one rejected alternative
- An ADR recorded via `project-documentation-wiki`

### 4. APPROVAL CHECKPOINT — STOP
Present the architecture to the user as a concise summary + diagrams. Then **explicitly ask for approval** and WAIT.

> Do NOT write implementation code, scaffold the repo, or install dependencies until the user replies with clear approval ("approved", "go", "yes build it"). If they request changes, loop back to step 3.

### 5. Plan & route to implementation
Only after approval:
- Write the plan (`writing-plans`).
- Decide whether to swarm (CLAUDE.md "When to Swarm": YES for 3+ files / new features). If yes, spawn a named-agent pipeline per CLAUDE.md "Agent Comms".
- Route work through the correct domain router skill, and follow `test-driven-development` / `behaviour-harness`.

## Output of this skill
A short kickoff record: refined brief → chosen architecture (with diagrams) → ADR link → **user approval** → implementation plan. Implementation begins from step 5, never before.

## Hard rules
- The approval checkpoint (step 4) is non-negotiable. No code before "yes".
- Always activate superpowers (step 0) first — never go straight to editing files.
- Honor all binding standards in CLAUDE.md (Frontend Standard, file placement, no files in root).
