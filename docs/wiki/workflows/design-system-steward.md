---
type: workflow
status: current
updated: 2026-06-03
sources:
  - ../../agent-assets/frontend/skills/design-system-steward/SKILL.md
  - ../../agent-assets/frontend/skills/design-system-steward/references/design-md-template.md
  - ../../docs/frontend/design.md
  - ../../tools/install-agent-assets.ps1
tags:
  - project-docs
  - wiki/workflow
  - frontend
  - design-system
---

# Design System Steward

## Purpose

`design-system-steward` is the local frontend skill for creating, auditing, and
maintaining detailed design-system documentation for web frontends and mobile
apps. Its main durable artifact is `design.md`, which explains token values,
palette intent, platform coverage, accessibility, component usage, and
governance rules.

## Location

- Skill: `agent-assets/frontend/skills/design-system-steward/SKILL.md`
- Template reference:
  `agent-assets/frontend/skills/design-system-steward/references/design-md-template.md`
- Starter project design doc: `docs/frontend/design.md`

## Behavior

- Frontend projects prefer `docs/frontend/design.md`.
- Mobile-only projects prefer `docs/mobile/design.md`.
- Cross-platform projects can use `docs/design.md` and link platform-specific
  docs from it.
- Existing compact `design-system.md` files remain useful token ledgers, but
  `design.md` carries the deeper explanation: why palettes exist, when to use
  them, when not to use them, and how to extend the system safely.
- The installer now bundles this skill and includes it in target-project
  `AGENTS.md` startup guidance.

## Verification

The skill is validated with `quick_validate.py`; agent-asset, installer, and
template tests require the new skill path, OpenAI agent metadata, and starter
`docs/frontend/design.md`.
