---
type: workflow
status: current
updated: 2026-06-03
sources:
  - ../../agent-assets/frontend/FEATURE.md
  - ../../agent-assets/frontend/skills/frontend-agent/SKILL.md
  - ../../agent-assets/frontend/skills/design-system-steward/SKILL.md
  - ../../agent-assets/frontend/skills/frontend-error-ux/SKILL.md
  - ../../agent-assets/ui-ux-pro-max/SKILL.md
  - ../../agent-assets/project-documentation-wiki/SKILL.md
  - ../../agent-assets/react-19-frontend-agent/FEATURE.md
  - ../../agent-assets/react-19-frontend-agent/skills/react-19-frontend-agent/SKILL.md
  - ../../tools/install-agent-assets.ps1
tags:
  - project-docs
  - wiki/workflow
  - frontend
  - plugin
---

# Frontend Agent Plugin

## Purpose

The project now has a Codex-first `frontend` plugin that packages the accumulated frontend architecture and implementation rules into a reusable `frontend-agent` skill. The older `react-19-frontend-agent` has been updated to point at the same standards so existing use remains consistent. Both packages now live under the consolidated `agent-assets/` folder.

## New Plugin

- Plugin root: `agent-assets/frontend/`
- Manifest: `agent-assets/frontend/.codex-plugin/plugin.json`
- Compatibility manifest: `agent-assets/frontend/.claude-plugin/plugin.json`
- Skills: `agent-assets/frontend/skills/frontend-agent/SKILL.md`,
  `agent-assets/frontend/skills/design-system-steward/SKILL.md`, and
  `agent-assets/frontend/skills/frontend-error-ux/SKILL.md`
- References: `agent-assets/frontend/skills/frontend-agent/references/`

The plugin includes references for:

- Modular frontend architecture.
- Frontend architecture guardrails.
- React implementation patterns.
- Next.js App Router/Next.js 16/Better Auth patterns.
- UI component sourcing and shadcn fallback.
- Detailed `design.md` creation and auditing for web/mobile design systems.
- Startup error UX audits for 404 pages, blocking error modals, crash
  fallbacks, and offline no-internet blockers.
- Frontend design-system, screen, component, and audit governance.
- Imported UI/UX Pro Max guidance for accessibility, interaction quality,
  charts, product-specific visual direction, and stack-specific UI rules.
- Source provenance summaries for the imported Notion, React, and Next.js docs.

## Existing Agent Update

The existing `react-19-frontend-agent` now includes project references and updated rules for:

- TanStack Router as the default for new SPA routing.
- TanStack Query for client-side server state.
- Zustand as the maximum global client-only state manager.
- Project/skill UI components before shadcn fallback.
- `shared` admission rules and public module APIs.
- Next.js App Router as explicit framework mode.

## Usage

Use `$frontend-agent` for frontend architecture, implementation, review, or planning. In a project-local bundle, it starts through `agent-assets/project-documentation-wiki/SKILL.md`, then routes frontend decisions through `agent-assets/frontend/skills/frontend-agent/SKILL.md`, uses `agent-assets/frontend/skills/design-system-steward/SKILL.md` for design-system docs, immediately audits failure/offline surfaces through `agent-assets/frontend/skills/frontend-error-ux/SKILL.md`, routes React-specific work through `agent-assets/react-19-frontend-agent/skills/react-19-frontend-agent/SKILL.md`, applies visual/UI governance through `agent-assets/frontend-design-plugin/skills/frontend-design/PROJECT_EXTENSION.md`, and uses `agent-assets/ui-ux-pro-max/SKILL.md` for deeper UX, accessibility, chart, responsive, and product-style guidance.

## Target Project Setup

Before starting work in a new or onboarded frontend project from this workspace, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-agent-assets.ps1 -TargetProject <project-path>
```

This creates the target project's `agent-assets/`, `AGENTS.md` managed startup
block, `docs/wiki/` scaffold, and starter `docs/frontend/` governance files so
future Codex work happens through project-local skills and agents.

## Verification

Validate with:

```powershell
python C:\Users\User\.codex\skills\.system\skill-creator\scripts\quick_validate.py agent-assets\frontend\skills\frontend-agent
python C:\Users\User\.codex\skills\.system\skill-creator\scripts\quick_validate.py agent-assets\frontend\skills\design-system-steward
python C:\Users\User\.codex\skills\.system\skill-creator\scripts\quick_validate.py agent-assets\frontend\skills\frontend-error-ux
python C:\Users\User\.codex\skills\.system\skill-creator\scripts\quick_validate.py agent-assets\ui-ux-pro-max
python C:\Users\User\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py agent-assets\frontend
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-install-agent-assets.ps1
```

## Follow-Up

The plugin files exist locally. Installing or exposing it in a marketplace is a separate step if the user wants it available through Codex plugin installation UI.
