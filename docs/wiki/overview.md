---
type: overview
status: current
updated: 2026-06-03
sources:
  - AGENTS.md
  - Template Project/AGENTS.md
  - tools/install-agent-assets.ps1
  - agent-assets/prompt-refiner/SKILL.md
  - agent-assets/superpowers/.codex-plugin/plugin.json
  - agent-assets/frontend/skills/frontend-error-ux/SKILL.md
  - agent-assets/frontend/skills/design-system-steward/SKILL.md
  - docs/frontend/design.md
  - agent-assets/frontend-design-plugin/skills/frontend-design/SKILL.md
  - agent-assets/ui-ux-pro-max/SKILL.md
  - agent-assets/code-reviewer/SKILL.md
  - agent-assets/backend-patterns/SKILL.md
  - agent-assets/backend/FEATURE.md
  - agent-assets/backend/.codex-plugin/plugin.json
  - agent-assets/code-review-graph/manifest.json
  - agent-assets/code-review-graph/.mcp.json
  - agent-assets/project-documentation-wiki/SKILL.md
  - agent-assets/react-19-frontend-agent/skills/react-19-frontend-agent/SKILL.md
tags:
  - project-docs
  - wiki/overview
---

# ai-tools Overview

## Purpose

`ai-tools` is a local workspace for Codex/Claude agent tooling, skills, and project governance. It contains project-level agent rules, frontend-design governance docs, demo assets, and a consolidated `agent-assets/` folder for local skill/plugin packages.

## Main Systems

- [[schema]] defines how this LLM Wiki is maintained.
- [[prompt-refinement-required]] records the new requirement to refine raw user prompts into clear internal working requests before any substantive action.
- [[project-documentation-wiki-skill]] records the new living documentation skill and its runtime expectations.
- [[project-documentation-wiki-required]] records the decision to require documentation checks for project tasks in this workspace.
- `agent-assets/` is the canonical folder for local skills, agent configs, and rule/reference files.
- `agent-assets/claude-plugin-directory.config.json` is the single-file
  template registry for the public Claude plugin directory, with plugin,
  MCP, and skill capability hints kept as catalog metadata.
- `agent-assets/claude-plugin-directory/plugins/` is the physical folder mirror
  with one package folder per public Claude plugin directory entry.
- `tools/install-agent-assets.ps1` installs the complete local agent bundle into another frontend project.
- `Template Project/` is a ready-to-copy frontend starter with local skills,
  agents, `AGENTS.md`, `AgentMD.md`, `docs/wiki/`, and `docs/frontend/`.
- `agent-assets/prompt-refiner/` contains the mandatory prompt refinement skill
  that is also installed globally under `C:/Users/User/.codex/skills`.
- `agent-assets/project-documentation-wiki/` contains the project-local documentation wiki skill for target projects.
- `agent-assets/superpowers/` mirrors the Codex Superpowers plugin locally so
  planning, TDD, debugging, review, verification, and delivery workflow skills
  are available inside every copied template project.
- `agent-assets/frontend-design-plugin/` mirrors the frontend-design skill and its local project extension.
- `agent-assets/ui-ux-pro-max/` stores an imported UI/UX design intelligence
  skill with searchable data/scripts for accessibility, palette, typography,
  product-type, chart, and stack-specific UI guidance.
- `agent-assets/code-reviewer/` stores an imported code review skill for
  security, performance, correctness, maintainability, and testing review.
- `agent-assets/backend-patterns/` stores an imported backend architecture skill
  for API design, database optimization, caching, auth, rate limiting, jobs,
  logging, and server-side patterns.
- `agent-assets/backend/` stores a SkillsMP-derived backend engineering plugin
  with eleven local skills for architecture, API contracts, data persistence,
  security/auth, reliability/observability, performance/scaling, Go/Golang,
  FastAPI, Django/DRF, framework patterns, and backend code review.
- `agent-assets/code-review-graph/` stores a local test bundle for the Code
  Review Graph MCP server, Python package, hooks, tests, docs, and review
  skills. Its `.mcp.json` runs `uvx code-review-graph serve`.
- `agent-assets/react-19-frontend-agent/` contains local React 19 frontend skills and plugin metadata.
- `agent-assets/frontend/` contains the Codex-first frontend plugin with the
  project `frontend-agent`, `design-system-steward`, and `frontend-error-ux`
  skills plus bundled architecture and UI governance references.
- `docs/frontend/` stores frontend UI governance memory, including the detailed
  `design.md` design-system document.

## Current Documentation Rule

Every project task should first apply `prompt-refiner`, then use `project-documentation-wiki` at startup, then route applicable work through local Superpowers workflows before implementation, debugging, review, or completion claims. Read this wiki before planning, and update central wiki pages plus local `FEATURE.md` docs after project-changing prompts.
