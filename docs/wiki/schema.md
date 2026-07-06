---
type: schema
status: current
updated: 2026-05-28
sources: []
tags:
  - project-docs
  - wiki/schema
---

# ai-tools Wiki Schema

## Layers

- `raw/`: immutable imported sources and assets.
- Generated pages: LLM-maintained markdown summaries, concepts, entities, architecture notes, workflows, decisions, and synthesis.
- `index.md` and `log.md`: navigation and chronological audit trail.

## Page Rules

- Keep pages concise, cited, and cross-linked with `[[Wiki Links]]` where practical.
- Mark uncertain claims as hypotheses or `needs-review`.
- Update `index.md` and append `log.md` after every wiki change.
- Create or update local `FEATURE.md` files beside meaningful feature folders touched by a task.

## Startup and Update Rule

- At task start, read `index.md`, `schema.md`, recent `log.md`, and relevant local `FEATURE.md` files.
- For code-changing tasks, follow [[test-first-development-required]] after the startup read and before editing production code.
- If code, config, behavior, UI, APIs, data models, tests, or operations change, update affected wiki pages and local feature docs before finishing.
- Use `sources/jira/` and `sources/confluence/` for live MCP-backed summaries when those connectors are available.
