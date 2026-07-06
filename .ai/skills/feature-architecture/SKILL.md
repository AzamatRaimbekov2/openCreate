---
name: feature-architecture
description: Discuss and design the architecture BEFORE building a new feature, and draw it as diagrams. Use at the start of any new feature, epic, endpoint, module, integration, or significant change — to align on boundaries, components, data, and trade-offs, produce Mermaid diagrams (C4/sequence/ER), and record an ADR. Run this before implementation.
---

# Feature Architecture

Architecture-first harness: for every non-trivial feature, **align on the design and draw it** before writing code. This is a feedforward guide — it prevents rework by making structure, boundaries, and trade-offs explicit and visual up front.

Run after `prompt-refiner` and `project-documentation-wiki`, before the domain implementation skills and `test-driven-development`. For deep or parallel design work, dispatch the **`architect`** subagent.

## When to use
Any new feature/epic, new endpoint or service, new module or bounded context, a new integration, a data-model change, or a change that crosses component boundaries. Skip only for truly local edits (copy tweak, one-line fix) — say why if you skip.

## Workflow

### 1. Gather context
Read `docs/wiki/architecture/`, recent `docs/wiki/decisions/` (ADRs), the modular-architecture references (`.claude/skills/frontend-agent/references/`, `backend-engineering`), and the current code structure for the affected area. Don't design in a vacuum — reuse existing patterns and boundaries.

### 2. Discuss the design (collaborate)
Establish and write down:
- **Scope & actors** — what the feature does, who/what uses it.
- **Non-functional requirements** — performance/scale, security, availability, consistency, cost. These drive the design.
- **Affected boundaries** — which apps/services/modules/components change; what stays untouched.
- **Data & contracts** — new/changed entities, APIs, events, ownership.
- **Options & trade-offs** — present **2–3 viable approaches** with pros/cons, then recommend one. **Ask the user** when a decision is consequential and not derivable from the codebase (e.g. sync vs async, new service vs extend, storage choice). Don't silently pick on high-impact forks.

### 3. Draw the diagrams (Mermaid)
Produce the diagrams that fit the change, using `assets/diagrams.md` as the cookbook. Default set:
- **C4 Context** — the system, its actors, and external systems.
- **C4 Container** — apps/services/datastores and how they talk.
- **C4 Component** — inside the container being changed (when non-trivial).
- **Sequence** — the key flow(s) for this feature, including the failure path.
- **ER / data model** — when persistence changes.
- **State** — when something is stateful (status machines, workflows).

Keep diagrams in Mermaid fenced blocks so they render in GitHub/markdown with no tooling. (If the user wants polished visuals, the Figma MCP `generate_diagram` can render a richer version from the same model — offer it, don't require it.)

### 4. Record the decision (ADR)
Write an ADR using `assets/ADR.template.md` into `docs/wiki/decisions/NNNN-<slug>.md`: status, context, the decision, **the diagrams**, consequences, and the rejected alternatives with why. Update `docs/wiki/architecture/README.md` (the architecture overview + index) and link the ADR. Link both from the feature's nearest `FEATURE.md`.

### 5. Gate
For a non-trivial feature, implementation does not start until: the design is agreed, the relevant diagrams exist, and an ADR is recorded. Then hand off to the domain skills (`frontend-agent` / `backend-engineering`) and `test-driven-development`; pair with `behaviour-harness` so the agreed behaviour is also tested.

## Keep it living
When implementation diverges from the diagrams, update the diagrams + ADR (add a superseding ADR rather than silently editing a decided one). The diagrams are project memory, not throwaway sketches.
