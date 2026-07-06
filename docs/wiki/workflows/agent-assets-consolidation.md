---
type: workflow
status: current
updated: 2026-06-03
sources:
  - ../../AGENTS.md
  - ../../agent-assets/README.md
  - ../../agent-assets/FEATURE.md
  - ../../agent-assets/claude-plugin-directory.config.json
  - ../../agent-assets/claude-plugin-directory/plugins/
  - ../../agent-assets/ui-ux-pro-max/SKILL.md
  - ../../agent-assets/code-reviewer/SKILL.md
  - ../../agent-assets/backend-patterns/SKILL.md
  - ../../agent-assets/backend/FEATURE.md
  - ../../agent-assets/backend/.codex-plugin/plugin.json
  - ../../agent-assets/code-review-graph/manifest.json
  - ../../agent-assets/code-review-graph/.mcp.json
  - ../../agent-assets/frontend/skills/design-system-steward/SKILL.md
  - ../../agent-assets/prompt-refiner/SKILL.md
  - ../../agent-assets/superpowers/FEATURE.md
  - ../../agent-assets/superpowers/.codex-plugin/plugin.json
  - ../../tools/install-agent-assets.ps1
  - ../../tools/test-install-agent-assets.ps1
  - ../../tools/verify-agent-assets.ps1
  - ../sources/claude-plugin-directory.md
  - ../sources/code-review-graph-plugin.md
  - ../sources/imported-agent-skills.md
  - ../sources/skillsmp-backend-skills.md
tags:
  - project-docs
  - wiki/workflow
  - agents
  - skills
---

# Agent Assets Consolidation

## Purpose

Local skill/plugin packages are now consolidated under `agent-assets/` so the
repository has one obvious home for skills, agent configs, and rule/reference
resources.

## Canonical Structure

- `agent-assets/prompt-refiner/`: mandatory prompt clarification skill used as
  the first step before planning, answering, tool use, or other skill routing.
- `agent-assets/claude-plugin-directory.config.json`: single-file catalog of
  public Claude directory plugins with plugin URLs, works-with targets,
  verification status, install counts, and MCP/skill capability hints.
- `agent-assets/claude-plugin-directory/plugins/`: physical package folder
  mirror for every public Claude plugin directory entry.
- `agent-assets/frontend/`: Codex-first frontend plugin with `frontend-agent`,
  `design-system-steward`, and `frontend-error-ux` skills.
- `agent-assets/project-documentation-wiki/`: documentation wiki skill,
  OpenAI agent metadata, init script, and LLM wiki reference.
- `agent-assets/superpowers/`: local Codex Superpowers plugin mirror with
  planning, TDD, debugging, review, verification, and delivery workflow skills.
- `agent-assets/react-19-frontend-agent/`: earlier React 19 agent plugin and
  React/routing/Next.js sub-skills.
- `agent-assets/frontend-design-plugin/`: local mirror of the frontend-design
  skill and project extension rules.
- `agent-assets/ui-ux-pro-max/`: imported UI/UX design intelligence skill with
  searchable data and scripts for accessibility, palettes, typography, product
  patterns, charts, and stack-specific UI guidance.
- `agent-assets/code-reviewer/`: imported code review skill and rule set for
  security, performance, correctness, maintainability, and testing review.
- `agent-assets/backend-patterns/`: imported backend architecture skill for API
  design, database optimization, caching, auth, rate limiting, jobs, logging,
  and server-side patterns.
- `agent-assets/backend/`: SkillsMP-derived backend plugin with architecture,
  API contract, data persistence, security/auth, reliability/observability,
  performance/scaling, Go/Golang, FastAPI, Django/DRF, framework pattern, and
  backend code review skills.
- `agent-assets/code-review-graph/`: local test bundle for the Code Review
  Graph MCP server, Python package, hooks, tests, docs, and seven review skills.
- `AGENTS.md`: remains at the repository root because Codex discovers
  project-level rules there.

## Maintenance Rules

- Add new local agent plugins under `agent-assets/`.
- Keep each package's `SKILL.md`, `agents/`, and `references/` resources
  together.
- Keep Superpowers mirrored under `agent-assets/superpowers/` so projects
  receive local workflow skills before falling back to global plugin installs.
- Keep the Claude plugin directory registry as catalog-only metadata: entries
  stay disabled by default, secrets stay outside the repository, and target
  environments verify each plugin after installation.
- Keep the folder mirror synchronized with the registry so every plugin entry
  has a package folder with manifest, README, template plugin manifest, and
  applicable capability files.
- Keep imported standalone skills bundled with local OpenAI metadata and any
  required data, scripts, or rule resources so target projects do not depend on
  live GitHub fetches.
- Keep `agent-assets/backend/` as the local source-of-truth synthesis for
  SkillsMP backend patterns. Source provenance and selection criteria live in
  `agent-assets/backend/references/skillsmp-sources.md`.
- Keep `agent-assets/code-review-graph/` as a source/test bundle with
  `.mcp.json`, local wrapper manifests, hooks, upstream tests, docs, and skills.
  Its MCP command is `uvx code-review-graph serve`; credentials and MCP client
  registration stay outside the repository.
- Use `tools/install-agent-assets.ps1 -TargetProject <project-path>` to install
  the complete local bundle into another project before starting frontend work
  there.
- Update `agent-assets/FEATURE.md`, affected package `FEATURE.md` files, and
  wiki links when paths change.
- Run `tools/verify-agent-assets.ps1` after moving or adding local agent assets.
- Run `tools/test-install-agent-assets.ps1` after changing bootstrap behavior.

## Target Project Bootstrap

The installer copies `agent-assets/`, creates or updates a managed block in the
target `AGENTS.md`, initializes `docs/wiki/` through the project-local
documentation skill, and copies starter `docs/frontend/` governance files
without overwriting existing frontend docs.

The managed target-project rules make Codex start frontend work through this
chain:

1. `agent-assets/prompt-refiner/SKILL.md`
2. `agent-assets/project-documentation-wiki/SKILL.md`
3. `agent-assets/superpowers/skills/using-superpowers/SKILL.md` and the
   applicable Superpowers workflow skill, especially TDD, debugging, and
   verification.
4. `agent-assets/frontend/skills/frontend-agent/SKILL.md`
5. `agent-assets/frontend/skills/frontend-error-ux/SKILL.md`
6. `agent-assets/frontend/skills/design-system-steward/SKILL.md` for
   detailed web/mobile `design.md` governance
7. `agent-assets/react-19-frontend-agent/skills/react-19-frontend-agent/SKILL.md`
   and sub-skills when React/routing/Next.js details are involved
8. `agent-assets/frontend-design-plugin/skills/frontend-design/SKILL.md` and
   `PROJECT_EXTENSION.md` for UI/design-system governance
9. `agent-assets/ui-ux-pro-max/SKILL.md`, `agent-assets/code-reviewer/SKILL.md`,
   `agent-assets/backend-patterns/SKILL.md`, and the specialized
   `agent-assets/backend/skills/` pack when UI/UX, review, or backend/API work
   matches those domains
10. `agent-assets/code-review-graph/skills/review-pr/SKILL.md` and related
   review-graph skills when testing Code Review Graph MCP/review workflows

## Verification

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-install-agent-assets.ps1
```

The checks confirm expected packages, parseable plugin manifests, absent old
root plugin folders, Superpowers local mirror coverage, the Claude plugin
directory registry and package folders, the Code Review Graph test bundle,
minimum counts for skill, agent, and reference/rule files, the
`prompt-refiner` first-step rule, and a working install into a temporary target
project.
