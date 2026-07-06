---
type: workflow
status: current
updated: 2026-06-03
sources:
  - ../../Template Project/AGENTS.md
  - ../../Template Project/AgentMD.md
  - ../../Template Project/FEATURE.md
  - ../../Template Project/agent-assets/claude-plugin-directory.config.json
  - ../../Template Project/agent-assets/claude-plugin-directory/plugins/
  - ../../Template Project/agent-assets/ui-ux-pro-max/SKILL.md
  - ../../Template Project/agent-assets/code-reviewer/SKILL.md
  - ../../Template Project/agent-assets/backend-patterns/SKILL.md
  - ../../Template Project/agent-assets/backend/FEATURE.md
  - ../../Template Project/agent-assets/backend/.codex-plugin/plugin.json
  - ../../Template Project/agent-assets/code-review-graph/manifest.json
  - ../../Template Project/agent-assets/code-review-graph/.mcp.json
  - ../../Template Project/agent-assets/frontend/skills/design-system-steward/SKILL.md
  - ../../Template Project/agent-assets/superpowers/.codex-plugin/plugin.json
  - ../../tools/test-template-project.ps1
  - ../sources/claude-plugin-directory.md
tags:
  - project-docs
  - wiki/workflow
  - template
  - frontend
---

# Template Project

## Purpose

`Template Project/` is the ready-to-copy project starter for frontend work. It
contains the same local skills and agents as `agent-assets/`, plus a
Codex-readable `AGENTS.md`, a human-facing `AgentMD.md`, wiki scaffolding, and
frontend governance docs.

## Contents

- `AGENTS.md`: Codex startup rules and managed local skill chain.
- `AgentMD.md`: visible mirror of the same skill chain.
- `agent-assets/`: all bundled local skills, agents, references, and scripts.
- `agent-assets/frontend/skills/design-system-steward/SKILL.md`: bundled
  design-system workflow for detailed `design.md` docs.
- `agent-assets/claude-plugin-directory.config.json`: single-file Claude plugin
  directory registry for plugin, MCP, and skill capability hints.
- `agent-assets/claude-plugin-directory/plugins/`: one physical package folder
  per public Claude plugin directory entry.
- `agent-assets/superpowers/`: local Codex Superpowers plugin mirror for
  planning, TDD, debugging, review, verification, and delivery workflows.
- `agent-assets/ui-ux-pro-max/`, `agent-assets/code-reviewer/`, and
  `agent-assets/backend-patterns/`: imported standalone skills for UI/UX
  design intelligence, code review, and backend/API architecture patterns.
- `agent-assets/backend/`: SkillsMP-derived backend plugin with eleven skills
  for architecture, API contracts, persistence, security/auth,
  reliability/observability, performance/scaling, Go/Golang, FastAPI,
  Django/DRF, framework patterns, and backend code review.
- `agent-assets/code-review-graph/`: local Code Review Graph test bundle with
  MCP config, hooks, Python package, tests, docs, and review skills.
- `docs/wiki/`: initialized LLM wiki scaffold.
- `docs/frontend/`: UI governance docs.
- `FEATURE.md`: local feature documentation for the template itself.

## Skill Chain

Template projects route work through:

1. `project-documentation-wiki`
2. Local Superpowers via `using-superpowers` and the applicable planning, TDD,
   debugging, review, or verification skill.
3. `frontend-agent`
4. `frontend-error-ux`
5. `design-system-steward`
6. `react-19-frontend-agent`
7. React/routing/Next.js sub-skills as needed
8. `frontend-design` plus `PROJECT_EXTENSION.md` for UI work
9. `ui-ux-pro-max`, `code-reviewer`, `backend-patterns`, and the specialized
   `backend/skills/` pack when UI/UX, review, or backend/API work matches those
   domains
10. `code-review-graph` review skills when testing MCP-backed review-graph
   workflows

## Verification

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-template-project.ps1
```

The test verifies `Template Project/` exists, both agent instruction files
contain every bundled skill path, the wiki/frontend docs exist, Superpowers is
present locally, the Claude plugin directory registry and package folders are
included and mentioned, and the template contains local skills plus generated
plugin capability hints. It also verifies the Code Review Graph test bundle and
review skill paths.
