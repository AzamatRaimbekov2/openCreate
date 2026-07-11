---
type: index
status: current
updated: 2026-07-06
sources: []
tags:
  - project-docs
  - wiki/index
---

# ai-tools Wiki Index

## Start Here

- [[overview]] - High-level project overview.
- [[schema]] - Wiki conventions and maintenance rules.
- [[project-documentation-wiki-required]] - Decision requiring wiki checks and updates for project tasks.
- [[prompt-refinement-required]] - Decision requiring every task to start by refining the user's raw prompt into a clear working request.
- [[test-first-development-required]] - Decision requiring tests and test cases before production code changes.
- [[frontend-error-ux-startup-required]] - Decision requiring 404, error modal, crash fallback, and offline no-internet blocker startup audits.

## Architecture

- [[modular-frontend-architecture]] - Imported modular/FSD-like frontend architecture guidance from Notion and FigJam.
- [[opencreate-mvp-architecture]] - **Accepted ADR**: openCreate MVP — Runware-backed image/video generation platform (pnpm monorepo, Vite SPA + Fastify API, credit ledger, own asset storage). Spec: `docs/superpowers/specs/2026-07-06-opencreate-mvp-design.md`.
- [[opencreate-implementation]] - ADR → implementation map for the shipped openCreate MVP (decision-by-decision code locations, recorded deltas, verification results).
- [[wan-selfhost-video-provider]] - **Proposed ADR** (pending user approval + spike): self-hosted Wan 2.2 A14B as a second video provider on RunPod serverless, behind a `VideoProvider { submit; poll }` seam and the unchanged async lifecycle; Runware kept as the fast tier; presigned-PUT delivery into our own bucket; ~$0.01–0.04/clip vs the $0.13 Seedance baseline. Feasibility gated by [[wan-runpod-feasibility-spike]].
- [[seedance-direct-bytedance]] - **Accepted ADR** (2026-07-11): Seedance 2.0 straight from ByteDance ModelArk as a THIRD `VideoProvider` (`bytedance`, gated on `ARK_API_KEY`). **The cost case for it collapsed under verification and it was built anyway, deliberately** — the direct channel saves ~5%, not the ~72% the 2026-07-07 research claimed (that research used ByteDance's *video-input* token rate; our t2v/i2v flows pay $7.00/M, not $4.30/M). Built for the model itself (2.0 was absent from the catalog) and direct `generate_audio`/4k/15s control. **Key product constraint: Seedance 2.0 refuses any input image containing a real human face** — collides with the Entity Library's portrait premise; surfaced as a refundable `content_blocked`.
- [[cinema-studio]] - **Accepted ADR** (2026-07-09): CinemaStudio — a film-composition layer OVER the existing generation lifecycle. Structured prompt presets (style/camera/motion/quality, composed server-side); audio as `generation.type='audio'` behind an `AudioProvider` seam reusing the whole money path (Runware audioInference — TTS+music, zero new client); server-side ffmpeg render (`film_render` table, no ledger); script→storyboard via Claude (optional `ANTHROPIC_API_KEY`). Charge/refund/stale-sweep/VideoProvider seam UNCHANGED.

## Workflows

- **openCreate MVP build (2026-07-06)** - Plan-driven implementation of the full MVP (`docs/superpowers/plans/2026-07-06-opencreate-mvp.md`, Tasks 1–22): contracts → Fastify API (auth, ledger, catalog, Runware, storage, generations) → React SPA (design system, auth, generator, gallery, shell, landing, pricing) → Playwright e2e → verification. See [[opencreate-implementation]] and `apps/{api,web}/FEATURE.md`.
- [[agent-assets-consolidation]] - Canonical folder for local skills, agents, and rule/reference resources.
- [[backend-skill-pack]] - SkillsMP-derived local backend plugin with architecture, API, data, security, reliability, performance, framework, and review skills.
- [[frontend-agent-plugin]] - Local frontend plugin and agent packaging workflow.
- [[frontend-project-bootstrap]] - Installing project-local skills, agents, wiki startup, and frontend governance into new frontend projects.
- [[design-system-steward]] - Workflow for maintaining detailed `design.md` design-system docs for frontend and mobile projects.
- [[project-documentation-wiki-skill]] - How the living documentation skill is configured and used.
- [[repository-publication]] - Remote repository publication status for GitHub and GitLab.
- [[superpowers-local-plugin]] - Local Codex Superpowers plugin mirror for planning, TDD, debugging, review, verification, and delivery workflows.
- [[template-project]] - Ready-to-copy frontend project starter with local skills, agents, `AGENTS.md`, and `AgentMD.md`.

## Concepts

- [[next-js-patterns]] - Next.js App Router, Server/Client Component, Cache Components, auth, metadata, and verification guidance.
- [[react-patterns]] - Component, hook, state, composition, performance, error, TypeScript, and testing patterns for React work.

## Entities

## Decisions

- [[template-catalog]] - Pre-authored viral formats (Brainrot Studio) that instantiate into a whole film; server-side prompts, per-tier model pinning, zero-charge apply.

- [[frontend-architecture-guardrails]] - Project guardrails for shared ownership, dependency rules, UI component sourcing, TanStack Router/Query, Zustand, ESLint, and bundle splitting.
- [[frontend-error-ux-startup-required]] - Require frontend initialization to run `frontend-error-ux` and verify app-level failure/offline surfaces.
- [[prompt-refinement-required]] - Require `prompt-refiner` as the first agent step for rough or routine user prompts across this workspace and installed project-local bundles.
- [[project-documentation-wiki-required]] - Keep documentation checks tied to project work.
- [[test-first-development-required]] - Require frontend JS/TS tests, backend Python tests, E2E coverage, and explicit test cases before production code changes.

## Sources

- [[claude-plugin-directory]] - Source summary for the imported public Claude Plugins directory registry.
- [[code-review-graph-plugin]] - Source summary for the imported Code Review Graph MCP/test plugin bundle.
- [[imported-agent-skills]] - Source summary for imported UI/UX Pro Max, Code Reviewer, and Backend Patterns skills.
- [[skillsmp-backend-skills]] - Source summary for SkillsMP backend candidates used to synthesize the local backend skill pack.
- [[project-documentation-wiki-skill]] - Summary of the skill configuration and files.
- [[notion-modular-architecture]] - Source summary for the external Notion modular architecture docs and linked FigJam diagram.
- [[next-js-skill-sources]] - Source summary for imported Next.js App Router, Next.js 16, and Better Auth skill files.
- [[react-patterns-source]] - Source summary for imported React patterns and LobeHub layout/component conventions.

## Synthesis

## Local Feature Docs

- `apps/api/FEATURE.md` - openCreate Fastify API: auth, credit ledger, catalog, Runware integration, generation lifecycle, media storage.
- `apps/web/FEATURE.md` - openCreate React SPA: landing, auth, generator, gallery, credits, pricing, design system, e2e.
- `agent-assets/FEATURE.md` - Consolidated local skills, agents, and rule/reference resources.
- `agent-assets/backend/FEATURE.md` - SkillsMP-derived backend engineering skill pack.
- `agent-assets/claude-plugin-directory/FEATURE.md` - Folder-based mirror of the public Claude Plugins directory.
- `agent-assets/code-review-graph/FEATURE.md` - Local Code Review Graph MCP/test plugin bundle.
- `agent-assets/frontend/FEATURE.md` - Codex-first frontend plugin with `frontend-agent`, `design-system-steward`, and `frontend-error-ux` skills.
- `agent-assets/superpowers/FEATURE.md` - Local Codex Superpowers plugin mirror and workflow skill bundle.
- `agent-assets/react-19-frontend-agent/FEATURE.md` - Existing React 19 frontend agent updated to the current guardrails.
- `Template Project/FEATURE.md` - Ready-to-copy project starter wired to local skills and agents.
