---
type: log
status: current
updated: 2026-06-03
sources: []
tags:
  - project-docs
  - wiki/log
---

# ai-tools Wiki Log

## [2026-05-28] bootstrap | Wiki initialized

- Created initial LLM Wiki structure in `docs/wiki`.

## [2026-05-28] update | Project documentation wiki skill configured

- Updated `project-documentation-wiki` in Codex skills and mirrored it to Claude/Agents skill folders.
- Added workspace rule in `AGENTS.md` requiring wiki checks at project task start and documentation updates after project-changing prompts.
- Created initial project wiki pages for this workspace.

## [2026-05-28] ingest | Notion modular architecture docs

- Read the Notion "Модульная архитектура" page, its linked Routing, Prettier, and ESLint pages, and the linked FigJam "Modular" board.
- Added [[notion-modular-architecture]] as the external source summary.
- Added [[modular-frontend-architecture]] as the durable architecture synthesis for future frontend/project structure work.

## [2026-05-28] update | Frontend architecture guardrails

- Updated [[modular-frontend-architecture]] with `shared` admission rules, dependency/public API boundaries, TanStack Router, TanStack Query, Zustand, single ESLint flat config, and measured `manualChunks` rules.
- Added [[frontend-architecture-guardrails]] as the decision record for these project-level frontend architecture rules.

## [2026-05-28] update | UI component sourcing rule

- Updated [[modular-frontend-architecture]] and [[frontend-architecture-guardrails]] to require project-owned or skill-provided UI components first.
- Documented shadcn/ui as the fallback component source when no suitable project/skill component exists.

## [2026-05-28] ingest | React patterns

- Preserved imported React pattern files under `docs/wiki/raw/react-patterns/`.
- Added [[react-patterns-source]] as the source summary for the imported React patterns and LobeHub layout/component conventions.
- Added [[react-patterns]] as the implementation-level React pattern guide and linked it from [[modular-frontend-architecture]] and [[frontend-architecture-guardrails]].

## [2026-05-28] ingest | Next.js skill files

- Preserved imported Next.js skill files and skill reports under `docs/wiki/raw/next-js/`.
- Added [[next-js-skill-sources]] as the source summary for Next.js App Router, Next.js 16 Launchpad, and Better Auth integration guidance.
- Added [[next-js-patterns]] as the framework-specific Next.js guidance page and linked it from [[modular-frontend-architecture]] and [[frontend-architecture-guardrails]].

## [2026-05-28] update | Frontend agent plugin

- Created the Codex-first `frontend` plugin with `.codex-plugin/plugin.json`, compatibility `.claude-plugin/plugin.json`, and `skills/frontend-agent/`.
- Bundled architecture, guardrail, React, Next.js, UI governance, audit, and source provenance references into the `frontend-agent` skill.
- Updated the existing `react-19-frontend-agent` to use the current TanStack Router, TanStack Query, Zustand, shadcn fallback, `shared`, and Next.js mode rules.
- Added local feature docs for `frontend/` and `react-19-frontend-agent/`.
- Added [[frontend-agent-plugin]] workflow documentation.

## [2026-05-28] update | Test-first development rule

- Added a workspace rule in `AGENTS.md` requiring test-first development for every new code-changing task.
- Documented [[test-first-development-required]] with the required order, frontend JS/TS testing rule, backend Python testing rule, E2E expectations, and explicit test case checklist requirement.
- Linked the rule from [[schema]] and [[index]] so future project startup reads surface it.

## [2026-05-28] update | Agent assets consolidated

- Created `agent-assets/` as the canonical folder for local skill/plugin packages, agent configs, and rule/reference files.
- Moved `frontend/`, `react-19-frontend-agent/`, and `frontend-design-plugin/` under `agent-assets/`.
- Kept root `AGENTS.md` in place for Codex project-rule discovery and updated its local frontend-design mirror paths.
- Added `tools/verify-agent-assets.ps1` to validate the consolidated structure and counts for skills, agents, and reference/rule files.
- Added [[agent-assets-consolidation]] and updated [[frontend-agent-plugin]], [[overview]], [[index]], and local feature docs to the new paths.

## [2026-05-28] update | Frontend project bootstrap

- Added `agent-assets/project-documentation-wiki/` so documentation wiki startup is bundled with the project-local agent assets.
- Added `tools/install-agent-assets.ps1` to install local skills, agents, `AGENTS.md`, `docs/wiki/`, and `docs/frontend/` into target frontend projects.
- Added `tools/test-install-agent-assets.ps1` to verify the installer against a temporary target project.
- Updated `AGENTS.md`, `frontend-agent`, and `react-19-frontend-agent` so frontend work starts through the project-local documentation wiki, frontend router skill, React sub-skills, and frontend-design governance.
- Added [[frontend-project-bootstrap]] and updated [[agent-assets-consolidation]], [[frontend-agent-plugin]], [[overview]], and [[index]].

## [2026-05-28] update | Frontend error UX startup audit

- Added the bundled `frontend-error-ux` skill under `agent-assets/frontend/skills/`.
- Updated frontend project initialization to immediately audit for a 404 page, blocking error modal/dialog, crash fallback, and offline no-internet screen blocker.
- Updated installer verification, frontend audit docs, feature docs, and [[frontend-error-ux-startup-required]].

## [2026-05-29] update | Codex global skill install verified

- Installed or refreshed project-created skills into `C:\Users\User\.codex\skills`: `project-documentation-wiki`, `frontend-agent`, `frontend-error-ux`, `frontend-design`, `react-19-frontend-agent`, `react-19-patterns`, `typescript-react-routing`, and `nextjs-app-router-practices`.
- Verified all eight installed `SKILL.md` files with `quick_validate.py` using UTF-8 mode.
- Confirmed `agent-assets/` still validates with 8 skills, 7 agent metadata files, and 22 reference/rule files.

## [2026-05-29] update | Template Project starter

- Created `Template Project/` as a ready-to-copy frontend project starter with local `agent-assets/`, `AGENTS.md`, `AgentMD.md`, `docs/wiki/`, and `docs/frontend/`.
- Added `tools/test-template-project.ps1` to verify template structure, skill paths, agent metadata counts, and startup-rule coverage.
- Added `Template Project/FEATURE.md` and [[template-project]] to document the template as a durable project artifact.
- Updated [[frontend-project-bootstrap]] and [[index]] to include the template workflow.

## [2026-05-29] update | Repository publication

- Created the private GitHub repository `AzamatRaimbekov/frontend-agents`.
- Added `origin` pointing to `https://github.com/AzamatRaimbekov/frontend-agents.git`.
- Published `master` with the initial project commit.
- Could not create the GitLab repository because no GitLab CLI, token, credential helper entry, `.config` entry, or `.netrc` credential is available locally.
- Added [[repository-publication]] to track remote publication status.

## [2026-06-02] update | Prompt refiner required

- Created the `prompt-refiner` skill under `agent-assets/prompt-refiner` and installed it globally to `C:\Users\User\.codex\skills\prompt-refiner`.
- Updated root `AGENTS.md`, the project-local installer, and `Template Project` startup chain so prompt refinement is the first agent step.
- Added verification coverage for bundle structure, installer output, template output, and global skill install.
- Added [[prompt-refinement-required]] to document the behavior and the limit that skills run after Codex receives a message, not before the model sees it.

## [2026-06-03] update | Superpowers local plugin mirror

- Added the Codex Superpowers plugin mirror under `agent-assets/superpowers/` with its `.codex-plugin` manifest, assets, all 14 skills, and OpenAI agent metadata.
- Updated root `AGENTS.md`, `tools/install-agent-assets.ps1`, and `Template Project` so target projects use local Superpowers workflows for planning, TDD, debugging, review, verification, and delivery.
- Updated verification scripts to require Superpowers in `agent-assets`, installer output, and `Template Project`, raising expected counts to 23 skills and 22 agent metadata files.
- Added [[superpowers-local-plugin]] and updated [[agent-assets-consolidation]], [[frontend-project-bootstrap]], [[template-project]], [[test-first-development-required]], [[overview]], and local feature docs.

## [2026-06-03] update | Design system steward skill

- Added `agent-assets/frontend/skills/design-system-steward/` with OpenAI agent metadata and a `design-md-template.md` reference.
- Added `docs/frontend/design.md` as the detailed design-system source of truth for palette intent, token usage, platform notes, accessibility, and governance.
- Updated the frontend plugin, installer managed AGENTS block, Template Project, verification scripts, frontend docs, feature docs, and [[design-system-steward]] workflow page.

## [2026-06-03] ingest | Claude plugin directory registry

- Imported the public Claude Plugins directory from `https://claude.com/plugins` into `agent-assets/claude-plugin-directory.config.json` as a single-file catalog registry with 100 entries.
- Copied the registry into `Template Project/agent-assets/claude-plugin-directory.config.json` so copied projects receive the same catalog metadata.
- Updated installer/template instructions to treat the registry as disabled-by-default catalog metadata with secrets stored outside the repository.
- Added verification coverage for the registry in `tools/verify-agent-assets.ps1`, `tools/test-install-agent-assets.ps1`, and `tools/test-template-project.ps1`.
- Added [[claude-plugin-directory]] and updated [[agent-assets-consolidation]], [[template-project]], [[overview]], and local feature docs.

## [2026-06-03] ingest | Imported UI/UX, review, and backend skills

- Imported `ui-ux-pro-max`, `code-reviewer`, and `backend-patterns` from the user-provided GitHub skill folders into `agent-assets/`.
- Adapted `ui-ux-pro-max` to store the real `data/` and `scripts/` resources locally and use `agent-assets/ui-ux-pro-max/scripts/search.py` paths.
- Added OpenAI metadata for imported skills that lacked it, updated root/project-local startup rules, and routed frontend UI work through `ui-ux-pro-max` alongside `frontend-design`.
- Updated installer, Template Project, verification scripts, wiki workflow pages, and local feature docs.
- Installed the three imported skills globally under `C:\Users\User\.codex\skills` and validated them there.
- Added [[imported-agent-skills]] as the source summary for these imports.

## [2026-06-03] update | Claude plugin directory folder mirror

- Generated `agent-assets/claude-plugin-directory/plugins/` with 100 physical package folders, one per public Claude Plugins directory entry.
- Added matching package folders under `Template Project/agent-assets/claude-plugin-directory/plugins/`.
- Added per-package `manifest.json`, `README.md`, `.claude-plugin/plugin.json`, and applicable plugin/MCP/skill capability files.
- Updated registry entries with `local_package_path` values and `schema_version: 2`.
- Updated verification scripts to require package folders for every registry entry and to verify installer/template propagation.
- Added local feature docs for the Claude plugin directory mirror and updated [[claude-plugin-directory]], [[agent-assets-consolidation]], [[frontend-project-bootstrap]], [[template-project]], and [[index]].

## [2026-06-03] ingest | Code Review Graph test plugin

- Imported `tirth8205/code-review-graph` at commit `0c9a5ff3371cf78f89032ff6936e3d3a5fedf0b8` into `agent-assets/code-review-graph/` and `Template Project/agent-assets/code-review-graph/`.
- Kept upstream source, tests, docs, hooks, `.mcp.json`, `uv.lock`, and all seven review-graph skills in the local bundle.
- Added local `manifest.json`, `.codex-plugin/plugin.json`, and `.claude-plugin/plugin.json` wrappers so verification and template copying can treat it as a project-local test plugin.
- Updated root/template agent rules, installer managed `AGENTS.md`, verification scripts, local feature docs, and wiki pages.
- Added [[code-review-graph-plugin]] as the source summary.

## [2026-06-03] ingest | SkillsMP backend skill pack

- Used SkillsMP backend/category search and selected high-signal backend sources for architecture, database engineering, API design, observability, FastAPI, Node/Express, and backend code review.
- Created `agent-assets/backend/` as a local backend plugin with eight skills: `backend-engineering`, `backend-api-contracts`, `backend-data-persistence`, `backend-security-auth`, `backend-reliability-observability`, `backend-performance-scaling`, `backend-framework-patterns`, and `backend-code-review`.
- Added shared provenance and quality references under `agent-assets/backend/references/`.
- Updated root/template agent rules, installer managed `AGENTS.md`, verification scripts, local feature docs, and wiki pages.
- Installed all eight backend skills globally under `C:/Users/User/.codex/skills/` and validated them with `quick_validate.py`.
- Verified the bundle with `tools/verify-agent-assets.ps1`, `tools/test-install-agent-assets.ps1`, and `tools/test-template-project.ps1`.
- Added [[skillsmp-backend-skills]] and [[backend-skill-pack]].

## [2026-06-03] update | Go FastAPI Django backend skills

- Added `backend-golang`, `backend-fastapi`, and `backend-django` to `agent-assets/backend/` with OpenAI agent metadata.
- Updated SkillsMP source provenance with Go/Golang, FastAPI, and Django/DRF marketplace sources.
- Updated root/template agent rules, installer managed `AGENTS.md`, verification scripts, local feature docs, and wiki pages.
- Installed all three new backend framework skills globally under `C:/Users/User/.codex/skills/` and validated them with `quick_validate.py`.

## 2026-07-06 — openCreate MVP kickoff

- Ran project-kickoff gate: prompt-refiner → brainstorming (user decisions: base generation scope, auth+credits no payments, Vite SPA + separate backend, i18n EN+RU) → feature-architecture → research workflow wf_9fc64756-311 (Higgsfield product map, Runware API, pricing).
- Recorded accepted ADR [[opencreate-mvp-architecture]] and spec `docs/superpowers/specs/2026-07-06-opencreate-mvp-design.md`. User approved architecture explicitly.
- Next: writing-plans → implementation (monorepo scaffold, contracts, API, SPA, landing).
