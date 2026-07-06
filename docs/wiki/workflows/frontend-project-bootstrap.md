---
type: workflow
status: current
updated: 2026-06-03
sources:
  - ../../AGENTS.md
  - ../../Template Project/AGENTS.md
  - ../../Template Project/AgentMD.md
  - ../../agent-assets/claude-plugin-directory.config.json
  - ../../agent-assets/claude-plugin-directory/plugins/
  - ../../agent-assets/ui-ux-pro-max/SKILL.md
  - ../../agent-assets/code-reviewer/SKILL.md
  - ../../agent-assets/backend-patterns/SKILL.md
  - ../../agent-assets/backend/FEATURE.md
  - ../../agent-assets/backend/.codex-plugin/plugin.json
  - ../../agent-assets/code-review-graph/manifest.json
  - ../../agent-assets/code-review-graph/.mcp.json
  - ../../agent-assets/prompt-refiner/SKILL.md
  - ../../agent-assets/superpowers/.codex-plugin/plugin.json
  - ../../agent-assets/superpowers/skills/using-superpowers/SKILL.md
  - ../../tools/install-agent-assets.ps1
  - ../../tools/test-install-agent-assets.ps1
  - ../../tools/test-template-project.ps1
  - ../../agent-assets/frontend/skills/frontend-agent/SKILL.md
  - ../../agent-assets/frontend/skills/design-system-steward/SKILL.md
  - ../../agent-assets/frontend/skills/frontend-error-ux/SKILL.md
tags:
  - project-docs
  - wiki/workflow
  - frontend
  - bootstrap
---

# Frontend Project Bootstrap

## Purpose

New or onboarded frontend projects should receive local copies of this
workspace's skills, agents, and governance docs so Codex can operate from
project-local instructions instead of only global skill installs.

## Command

Run from the source `ai-tools` workspace:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-agent-assets.ps1 -TargetProject <project-path>
```

## What It Creates

- `agent-assets/` with `prompt-refiner`, documentation wiki, local
  Superpowers, frontend agent, `design-system-steward`, frontend-design, and
  React 19 agent skills, including the `frontend-error-ux` startup audit and
  the single-file Claude plugin directory registry plus the folder-based Claude
  plugin package mirror.
- Imported standalone skills for UI/UX design intelligence
  (`ui-ux-pro-max`), code review (`code-reviewer`), and backend/API patterns
  (`backend-patterns`).
- `agent-assets/backend/` as the SkillsMP-derived backend plugin for
  architecture, API contracts, persistence, security/auth,
  reliability/observability, performance/scaling, Go/Golang, FastAPI,
  Django/DRF, framework patterns, and backend code review.
- `agent-assets/code-review-graph/` as the local Code Review Graph test bundle
  with MCP config, hooks, Python package, tests, docs, and review skills.
- `AGENTS.md` with a managed `PROJECT-LOCAL-AGENT-ASSETS` block.
- `docs/wiki/` initialized by the target project's own
  `agent-assets/project-documentation-wiki/scripts/init_project_wiki.py`.
- `docs/frontend/` starter UI governance docs, including `design.md`, copied
  without overwriting existing files.

## Template Folder

`Template Project/` is a prebuilt target project created from the same bundle.
It includes `AGENTS.md`, `AgentMD.md`, all project-local skills and agents,
local Superpowers, `agent-assets/claude-plugin-directory.config.json`,
`agent-assets/claude-plugin-directory/plugins/`,
`agent-assets/code-review-graph/`, `docs/wiki/`, and `docs/frontend/`. Copy it
when a new project should start from a ready folder instead of running the
installer against an existing path.

## Startup Chain In Target Projects

1. `agent-assets/prompt-refiner/SKILL.md` to turn the raw prompt into a clear
   internal working request.
2. `agent-assets/project-documentation-wiki/SKILL.md`
3. `agent-assets/superpowers/skills/using-superpowers/SKILL.md` and applicable
   Superpowers workflow skills for planning, TDD, debugging, review, and
   verification.
4. `agent-assets/claude-plugin-directory.config.json` when plugin, MCP, or
   skill catalog metadata is needed. Entries are disabled by default and do not
   store secrets.
5. `agent-assets/frontend/skills/frontend-agent/SKILL.md`
6. `agent-assets/frontend/skills/frontend-error-ux/SKILL.md` to verify the
   404 page, blocking error modal/dialog, crash fallback, and offline
   no-internet screen blocker.
7. `agent-assets/frontend/skills/design-system-steward/SKILL.md` for
   design-system docs, palette intent, tokens, themes, and mobile UI governance.
8. `agent-assets/react-19-frontend-agent/skills/react-19-frontend-agent/SKILL.md`
9. React/routing/Next.js sub-skills as needed.
10. `agent-assets/frontend-design-plugin/skills/frontend-design/SKILL.md` and
   `PROJECT_EXTENSION.md` for UI work.
11. `agent-assets/ui-ux-pro-max/SKILL.md`, `agent-assets/code-reviewer/SKILL.md`,
   `agent-assets/backend-patterns/SKILL.md`, and specialized
   `agent-assets/backend/skills/` files when UI/UX, review, or backend/API work
   matches those domains.
12. `agent-assets/code-review-graph/skills/review-pr/SKILL.md` and related
   Code Review Graph skills when testing MCP-backed review-graph workflows.

## Verification

`tools/test-install-agent-assets.ps1` creates a temporary target project, runs
the installer, and verifies local skill/agent counts plus `AGENTS.md`,
`docs/wiki/`, and `docs/frontend/` outputs. `tools/test-template-project.ps1`
verifies the checked-in `Template Project/` folder.
