---
type: log
status: current
updated: 2026-07-07
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

## 2026-07-06 — openCreate MVP implemented (plan Tasks 1–22)

- Executed `docs/superpowers/plans/2026-07-06-opencreate-mvp.md` test-first across parallel agent chains: workspace scaffold → `packages/contracts` (shared Zod schemas) → `apps/api` (Fastify 5: better-auth + signup bonus, transactional credit ledger, curated catalog, Runware REST client, local media storage, generation lifecycle with charge/poll/refund) → `apps/web` (React 19 SPA: Paper & Ink design system, auth, generator, gallery with 4s polling, credits chip, app shell, EN/RU landing with verified price claims, pricing page) → Playwright e2e with fully mocked `/api` + `/media`.
- Verification: root `pnpm lint`, `pnpm typecheck`, `pnpm test` (116 tests: 6 contracts / 31 api / 79 web), `pnpm build` — all green; e2e 2/2 (happy path with balance 200→165, RU landing). Manual smoke: API boots on :8787, `/health` + `/api/catalog` + 401 envelope verified.
- Docs: `apps/api/FEATURE.md`, `apps/web/FEATURE.md`, [[opencreate-implementation]] (ADR → code map incl. recorded deltas: charge-at-submit collapses hold→settle; landing prerender deferred to stretch Task 23), sidecar `.md` docs for every source file.
- Chore: `.gitignore` now excludes agent-runtime state (`.claude-flow/`, `.swarm/`, `.rtk/`, `ruvector.db`, `memory.db`); previously tracked runtime files untracked.

## 2026-07-07 — openCreate web v2 "Light Editorial" redesign

- Replaced the rejected v1 "Paper & Ink" look with the v2 "Light Editorial" direction (premium print-magazine identity): cream/ink/vermillion/sand tokens in `theme.css` `@theme`, self-hosted Fraunces Variable (display serif, italic accent word) + Space Grotesk Variable via @fontsource, hairline rules, stamp badges, pill controls, no heavy shadows (`3305c12`).
- New `ShowcasePoster` shared component + `showcasePosterArt.ts`: six poster-grade SVG compositions (dusk/sea/botanical/mono/ultraviolet/koi) with feTurbulence grain replacing every placeholder gradient; honest EN/RU "sample style" figure captions, one `video · 5s` marker (`9d0106d`).
- Restyled all surfaces without touching behavior/routes/roles/i18n keys: landing hero + "The index" price table + 01/02/03 how-it-works + FAQ + colophon and /pricing (`2f56573`); app shell masthead, /login editorial split with sand manifesto, generator "commission sheet", gallery magazine figures (`cb228e3`); QA round 1 refinements incl. emoji→currentColor-SVG glyph rule (`59cf4f9`). Error surfaces (404/crash/offline/modal) share the editorial voice. The four approved claims keep exact meaning in both locales.
- Docs: `docs/frontend/design.md` rewritten as v2 (`9d0b1e5`), `apps/web/FEATURE.md` refreshed, sidecar `.md` docs kept current per file.
- Verification: root `pnpm lint` / `pnpm typecheck` / `pnpm test` (142 tests: 8 contracts / 39 api / 95 web) / `pnpm build` (landing prerender injected into `dist/index.html`) all green; Playwright e2e 2/2 (mocked API); fresh 1440px full-page landing screenshot reviewed against the brief's visual QA checklist.

## 2026-07-07 — openCreate api production ops hardening

- `apps/api` production hardening in three TDD commits: `5e8de3d` feat(api): native env loading + structured logging; `cdd94a3` feat(api): sanitized errors + rate limits; plus production single-origin serving (this entry's commit).
- **Env**: `loadEnvFromFile()` in `src/config.ts` wraps Node 22 `process.loadEnvFile` (ENV_FILE → nearest `.env` walking up from cwd; real env always wins; missing file = no-op) — `pnpm dev` / `db:migrate` need no manual sourcing.
- **Logging**: fastify pino logger (LOG_LEVEL, default info, silent in tests), authorization/cookie/set-cookie redaction, reqId on request-scoped lines; structured money-path events (`credits.signup_bonus|charge|refund`, `generation.settle|fail`, `provider.error`) logged after-commit and guard-gated so log line ⇔ ledger/state change.
- **Errors**: unexpected 5xx sanitized to `{ internal_error, 'Something went wrong' }` — real message + stack to logs only; domain ApiErrors keep messages.
- **Rate limits**: `@fastify/rate-limit` global 300/min per IP; strict buckets `/api/auth/*` 10/min and `POST /api/generations` 20/min; 429 = shared envelope with new contracts code `rate_limited` (additive enum change, web uses the type only).
- **Single-origin prod**: NODE_ENV=production + existing `WEB_DIST_PATH` (default `../web/dist`, package-root anchored) serves the SPA at `/` with index.html fallback for non-/api non-/media GETs; api-only deploys boot clean without a web build.
- **Sessions**: better-auth `trustedOrigins` from TRUSTED_ORIGINS (comma list, default WEB_ORIGIN); `advanced.disableOriginCheck: false` set explicitly because better-auth silently skips the CSRF origin wall under NODE_ENV=test; `.env.example` documents BETTER_AUTH_URL = public https origin in prod.
- **Runnable dist**: `pnpm --filter @opencreate/api build` = tsc type gate + esbuild bundle → single `dist/index.js` (contracts inlined — its `.ts` exports are unloadable by plain node; deps external); root + api `start` scripts run `NODE_ENV=production node --enable-source-maps`.
- Verification: api lint/typecheck green, 68 api tests green (39 pre-existing + 29 new across env-loading/logging/errors-sanitized/rate-limit/static-web/trusted-origins); manual smoke of the bundled dist: `/health` + SPA at `/` on :8891 with env from repo-root `.env`.

## 2026-07-07 — openCreate production packaging (Docker + runbook)

- Root `Dockerfile` (multi-stage, `e5c6fb2`): `node:22-slim` base + corepack pnpm (pinned via `packageManager`); **build** stage = full workspace install + `pnpm build` (contracts inlined into the api esbuild bundle; web dist with landing prerender); **prod-deps** stage = `pnpm install --prod --frozen-lockfile --filter @opencreate/api...` (lockfile-exact prod node_modules, better-sqlite3 linux prebuild via the `allowBuilds` allowlist); **runtime** stage = api dist + web dist + pruned node_modules under the non-root `node` user, `HEALTHCHECK` via node `fetch` (no curl in slim).
- **Decision — prerender needs no browser**: `apps/web/scripts/prerender.mjs` is a pure-Node SSR pass (`renderToString` over the vite SSR bundle), so NO playwright/chromium image stage and NO `SKIP_PRERENDER` flag were introduced; playwright stays a dev-only e2e dependency.
- `docker-compose.yml`: one service on 8787, `env_file: .env` (compose forces `NODE_ENV=production` over it), `./data:/app/data` volume (SQLite + media), `restart: unless-stopped`, `/health` healthcheck. Gotcha fixed during verification: compose interpolates `${…}` inside the healthcheck string — the node probe uses string concatenation instead of a template literal.
- `.dockerignore` keeps `.env*`, `.git`, agent-runtime state, `node_modules`, `dist`, and `data` out of the build context (secrets never reach the image).
- Docs: new `PROD.md` runbook (env table incl. `BETTER_AUTH_URL` = public https origin + `TRUSTED_ORIGINS`, first-run steps — migrations run automatically on boot via `createDb()`, Caddy/nginx TLS blocks, backup = copy `./data`, SQLite single-instance rule with the Postgres pointer to [[opencreate-mvp-architecture]]); README production section; `apps/api/FEATURE.md` ops section.
- Verification: `docker build` green; `docker run --rm` with dummy `RUNWARE_API_KEY` → `/health` `{"ok":true}`, prerendered landing served at `/`, `/api/catalog` 200, 401 envelope on `/api/me`, container `health=healthy`, db+WAL+media created in `/app/data` as uid 1000; `docker compose config` clean; api lint/typecheck/85 tests green (no api source changes needed — boot-time DDL bootstrap already existed).

## 2026-07-07 — openCreate web v4 "Bioluminescent Terminal" redesign

- Replaced the v2 "Light Editorial" look with the owner-chosen Midjourney-style reference direction (design law `docs/frontend/style-reference-v3.md`, §Adaptations binding — flat `#06051d` void everywhere, **NO gradients**): cosmic-void surface ladder (void → abyss → steel → ridge, elevation by color steps, the only shadow is `shadow-pill`), whisper-weight JetBrains Mono everywhere (headings 30px weight 400, weights >500 forbidden) with DM Sans as sparing secondary prose, closed specimen pill triad (green = create/submit, amber = explore/browse, red = auth-exit/destructive; same triad signs generation statuses), portal-blue as the only chromatic prose accent (`252ab38` tokens + shared UI restyle).
- Landing rebuilt as a full-viewport hero: dependency-free animated ASCII-sphere canvas (`AsciiSphere`, `prefers-reduced-motion` → static frame) behind the mono wordmark, claims, and two specimen-pill CTAs; then the ~800px research column — 8 duotone SVG "specimen" plates (one video-marked, honest EN/RU sample labeling kept), "The index" price table, mono how-it-works prose, FAQ, minimal footer; /pricing got the same index treatment (`3ce8dbf`).
- App screens restyled with all behavior/routes/i18n keys/claims/tests-by-role intact: steel app shell with amber balance chip, /login single steel card (red sign-in / green sign-up pills per reference taxonomy), commission-sheet generator with amber model-selection rings and a glow-green cost numeral, gallery figure cards on abyss media wells with the amber/green/red status triad, credits ledger modal (`e5888a4`).
- QA rounds: `e96d1d0` (round 1); `70fb5cc` (round 2) added `TableScrollRegion` — a keyboard-focusable overflow wrapper with a dynamic mono "scroll →" hint (`common.scrollHint`, EN/RU) around both wide tables, the no-gradient scroll affordance.
- frontend-error-ux re-audit under v4 passed: custom 404 (`NotFoundPage` as root `notFoundComponent`), blocking error-modal pattern (`Modal` with `role="alertdialog"` + `ErrorState`), root crash fallback (`AppErrorBoundary` outside the providers), offline screen-blocking overlay (`OfflineOverlay`, z-60 above modals, self-clearing) — all four surfaces wired in `routes/__root.tsx` with tests.
- Docs: `docs/frontend/design.md` rewritten as the terminal design-system source of truth; `apps/web/FEATURE.md` refreshed; per-file sidecar `.md` docs kept current (`85f3d52`, `a3b354f`, `93e59bd`, `2ecfe4a`, `fd738a2`).
- Verification: root `pnpm lint` / `pnpm typecheck` / `pnpm test` (193 tests: 8 contracts / 85 api / 100 web) / `pnpm build` (landing prerender injected into `dist/index.html`) all green; Playwright e2e 2/2 (mocked API); diff grepped for `gradient` (clean); fresh 1440px full-page landing + 1440×900 login screenshots reviewed.

## 2026-07-07 — openCreate api security review fixes (SSRF redirect, trustProxy)

- Two verified high-severity review findings fixed test-first in `apps/api`: `fc3a0f5` fix(api): ssrf redirect bypass; `eb17afd` fix(api): trust proxy for per-client rate limits.
- **SSRF redirect hop closed** (`src/storage/local.ts`): `assertAllowedAssetUrl` gated only the FIRST url while `fetch()`'s default `redirect: 'follow'` let any 30x on an allowlisted host (open redirect / hostile provider payload) re-point the server-side fetch at internal targets (169.254.169.254 metadata, localhost admin ports) and publish the bytes under public `/media/*`. Now `saveFromUrl` fetches with `redirect: 'manual'` and treats ANY 30x as `asset redirect not allowed: <status>` — provider asset URLs are direct links, redirects are hostile by definition. Hardening in the same pass: scheme is https-only (`asset url not allowed: https required` — plain http to an allowlisted host previously passed). Residual, documented not implemented: DNS-rebinding (resolver-level private-IP check) if the threat model grows.
- **Rate-limit attribution behind the reverse proxy** (`src/app.ts` + `src/config.ts`): Fastify was built without `trustProxy` while PROD.md documents Caddy/nginx forwarding everyone from loopback — `req.ip` (the `@fastify/rate-limit` bucket key) was ALWAYS the proxy's address, so all users shared single buckets: 10 cheap auth requests/min from one attacker locked ALL users out of sign-in (availability DoS + per-client attribution impossible). New `TRUST_PROXY` env (default-deny tri-state → `config.trustProxy: boolean | string` → Fastify `trustProxy`): unset/`false` = header-deaf (direct exposure), `true` = trust X-Forwarded-For (proxy must OVERWRITE the inbound header — nginx `$remote_addr`, not `$proxy_add_x_forwarded_for`; Caddy is safe by default), or an address/CIDR/keyword list (`loopback,uniquelocal` — safest, appended client junk never trusted).
- Docs: PROD.md (TRUST_PROXY env row + X-Forwarded-For hygiene section + fixed nginx sample), `.env.example`, `apps/api/FEATURE.md`, sidecar `.md` docs for local.ts/config.ts/app.ts/build-test-app.ts.
- Verification: TDD red→green per fix; api lint/typecheck green; 93 api tests green (85 pre-existing + 8 new: 2 storage SSRF, 4 TRUST_PROXY parsing, 2 rate-limit-behind-proxy behavior).

## 2026-07-07 — openCreate api money-path race + refund backstop + download limits

- Four confirmed review findings fixed test-first in `apps/api`: `ecb7c7f` fix(api): guard refund against succeeded race + atomic video submit failure; `de61e59` feat(api): db-level refund-once index + asset download limits; `5e8913c` docs(api): commit refs recorded in the six touched sidecars.
- **Refund-after-success race closed** (`src/modules/generations/service.ts`): `failGeneration` ran `refundCredits` UNCONDITIONALLY inside its transaction — only the failed-flip was status-guarded, so a row a concurrent settler had already flipped to `succeeded` stayed succeeded but was refunded anyway (user keeps asset + money). The check-and-set now guards the WHOLE settlement: only the processing → failed flip triggers the refund; any other status = no-op.
- **Atomic video submit-failure settlement**: `create()`'s video catch block ran refund and the failed flip as TWO transactions (refund first, flip unguarded) — a crash between them committed a refund while the row stayed processing. The block now reuses the guarded atomic `failGeneration` (one transaction, both or neither).
- **DB-level refund-once backstop** (`src/db/ddl.ts` + `client.ts`): new `REFUND_ONCE_INDEX_DDL` — UNIQUE index on `credit_transaction(generation_id, kind)` makes duplicate refund/charge rows physically impossible (NULL generation_ids, i.e. signup bonuses, stay unconstrained). Exec'd SEPARATELY from the main DDL inside try/catch + `console.warn`: legacy dupes must not brick the boot — the app-level transactional guard still holds and stays silently idempotent on top.
- **Asset download limits** (`src/storage/local.ts` + `config.ts` + `index.ts`): `saveFromUrl` gets one AbortController deadline spanning headers AND body streaming (`ASSET_FETCH_TIMEOUT_MS`, default 120s — undici resolves fetch() at headers, so a fetch-only timeout would not stop an endless body) and a byte cap counted by a Transform while streaming (`ASSET_MAX_BYTES`, default 512MB — Content-Length is never trusted); on violation the download aborts and the partial file is unlinked (a truncated asset is never served from `/media/*`).
- Docs: `apps/api/FEATURE.md` (credits invariants, media limits, env table, test count), sidecar `.md` docs for service.ts/ddl.ts/client.ts/local.ts/config.ts/index.ts/build-test-app.ts.
- Verification: TDD red→green per fix (2 + 1 + 3 + 3 + 2 new tests across generations-money-atomicity/ledger/storage/env-loading); api lint/typecheck green; 104 api tests green (93 pre-existing + 11 new).
- Post-fix gate (full pass, fresh run): `pnpm --filter @opencreate/api lint` clean, `typecheck` clean (run via `rtk proxy` = raw `tsc --noEmit` — the rtk tsc filter had emitted stray `.js` build artifacts next to sources during one earlier typecheck; the remaining gitignored strays incl. root `vitest.config.js`/`drizzle.config.js` were deleted, the `.gitignore` guard from the incident stays), 104/104 tests green, `build` green (tsc gate + esbuild `dist/index.js`). Production dist boot smoke: `NODE_ENV=production node dist/index.js` with a throwaway temp data dir (fresh SQLite + media) on a free port — `GET /health` 200 `{"ok":true}`, `GET /api/catalog` 200 full 7-model payload, structured pino request logs with reqIds, clean kill. `apps/api/FEATURE.md` + sidecars verified already current from `de61e59`/`5e8913c` (no doc drift found).

## 2026-07-07 — openCreate web final gate (lint/typecheck/test/build/e2e) + e2e polling-budget fix

- Full `@opencreate/web` gate run end-to-end: `lint` (eslint src) clean, `typecheck` (`tsc --noEmit`, run via `rtk proxy` to keep the rtk tsc filter from re-emitting `.js` strays — none found before or after) clean, vitest 135/135 across 26 files, production `build` green with the prerender guard injecting `/` into `dist/index.html`, Playwright e2e 2/2.
- One e2e red fixed test-first (`eee53b6` test(web): stamp fresh createdAt in e2e mocks to stay inside the polling budget): `e2e/mocks.ts` carried a FIXED `createdAt: 2026-07-06T10:00Z` from before the hardening round — `useLiveGeneration`'s 20-minute `GENERATION_STALL_MS` budget (QA finding 1) measured from that stale stamp, so the SPA (correctly) stopped polling after the first tick and rendered the amber "taking longer" card instead of flipping to the succeeded `<video>`. The mock now stamps `createdAt` fresh at POST time (and `completedAt` on success), keeping the mocked generation inside the budget for any future run. Product code untouched — the stall behavior itself is the desired hardening.
- frontend-error-ux audit re-verified before the gate: custom 404 (`NotFoundPage` as root `notFoundComponent`), blocking modal pattern (`Modal`, `role="alertdialog"` + focus trap), root crash fallback (`AppErrorBoundary` outside the providers), offline screen-blocking overlay (`OfflineOverlay`) — all wired in `routes/__root.tsx` with tests.
- Docs: `apps/web/FEATURE.md` gained a "Hardening (QA rounds + final gate)" section consolidating the round's outcomes (Modal focus trap + latent onClose-deps fix, confirm-before-delete alertdialog, `SubmitErrorBanner` closed per-code copy map, bounded polling with stalled/error states, `TableScrollRegion` overflow affordances) and the final-gate result; `e2e/mocks.ts.md` sidecar updated with the why.
- Verification: post-fix e2e 2/2 green (5.4s happy path + RU landing); `git status` clean for `apps/web` after the commits.

## [2026-07-08] design | ADR + spike for self-hosted Wan 2.2 video provider (Proposed)

- Added [[wan-selfhost-video-provider]] ADR (status Proposed — pending user approval + spike): a `VideoProvider { submit; poll }` seam behind the unchanged async lifecycle, RunPod-serverless-first for self-hosted Wan 2.2 A14B (only open Wan; 2.6/2.7 closed), Runware kept as the fast tier, presigned-PUT delivery into our own bucket (no SSRF widening), additive expand→backfill DB change, worker-side NSFW classifier as a hard prerequisite. Includes C4 container, happy-path + failure-path sequence, and generation state-machine Mermaid diagrams, plus the 4090-serverless-vs-$0.13 cost table.
- Added [[wan-runpod-feasibility-spike]] spike (< $5): measures cold-start C (delayTime) and warm gen G (executionTime) + real $/clip + quality vs Seedance, with explicit GO/ESCALATE/NO-GO gates and the exact user-provided prerequisites (RunPod account+key+$10, S3/R2 bucket, Seedance reference clip, region). Design-only; no implementation until the user approves and the spike passes.

## [2026-07-09] build | wan-runpod self-hosted video provider (ComfyUI-HTTP spike variant)

- Implemented the [[wan-selfhost-video-provider]] `VideoProvider { submit; poll }` seam and routed a second, self-hosted video provider (`wan-runpod`, Wan 2.2 on our RunPod GPU) through the UNCHANGED async generation lifecycle. Spike-grade decision: for this integration the provider talks to the pod's **ComfyUI HTTP API** (`POST /prompt`, `GET /history/<id>`, `/view`) — not the ADR's later serverless `/run` handler.
- New API surface: `integrations/video-provider.ts` (neutral `VideoSubmitInput` / `VideoPollResult` union `processing | success{assetUrl,costUsd,nsfw} | error`), `integrations/runware/video-adapter.ts` (wraps the UNCHANGED `RunwareClient` 1:1), `integrations/runpod/comfy-client.ts` + `integrations/runpod/wan22-t2v-workflow.ts` (embedded Wan 2.2 t2v graph, injected by node `_meta.title`: PROMPT_POSITIVE/NEGATIVE, LATENT_DIMS width/height/length = dur×16+1, SAMPLER_HIGH/LOW noise_seed, OUTPUT_VIDEO filename_prefix).
- Routing: `AppDeps.videoProviders` registry keyed by `runware`/`wan-runpod`; the generation service resolves the provider from the catalog model's `provider` at submit and from the row's persisted `provider` at poll. Image path stays Runware-only and unchanged. Every money-path invariant (charge-at-submit, refund-once, stale reaper, 4s poll, poll-throttle, submit-window race guard) preserved byte-for-byte — only the provider CALL is swapped behind the seam.
- Contracts: additive optional `provider: 'runware' | 'wan-runpod'` on `catalogVideoModelSchema` (absent = runware). DB: additive `generation.provider TEXT NOT NULL DEFAULT 'runware'` micro-migration; the neutral provider job id / cost REUSE the existing `runware_task_uuid` / `runware_cost_usd` columns (no rename, instant rollback).
- Catalog: `wan-2-2` ("Forge", provider `wan-runpod`, premium, 16:9/9:16/1:1, 5s → 60 credits, t2v only); `verify-catalog` skips non-runware models. Web: `wan-2-2` → Wan mark in `modelPresentation`, EN/RU descriptions added (auto-renders in the catalog-driven ModelSelect video group).
- Config: `COMFY_BASE_URL` (optional, unset-safe — model listed, submit returns a clean `provider_error`); its host is auto-folded into `ASSET_HOST_ALLOWLIST` so `saveFromUrl` can pull the finished mp4 from `/view`. `storage/local.ts` untouched (generic).
- **Known gap (carried from the ADR):** self-hosted ComfyUI has no provider-side NSFW check → wan-runpod always reports `nsfw:false`, so the §9.4 gate never fires for it until a worker-side classifier lands. Documented in FEATURE.md + the catalog entry + the service poll path.
- Verification (strict TDD, red→green per unit): `@opencreate/contracts` 11/11; `@opencreate/api` 136/136 (was 104: +7 runware-adapter, +11 comfy-client, +5 provider-routing, +3 config), lint + typecheck clean, production `build` (tsc gate + esbuild bundle) green; `@opencreate/web` ModelSelect 11/11 + typecheck clean. No live generation run (pod owner runs the real end-to-end once weights finish).

## [2026-07-11] build | Seedance 2.0 direct from ByteDance (ModelArk) as a third video provider

- **The cost case for this integration collapsed under verification, and it was built anyway — deliberately.** `docs/research/2026-07-07-seedance-direct-vs-runware.md` priced Seedance 2.0 direct at $0.46/5s 720p (vs Runware's $0.80) using ByteDance's **$4.30/M-token** rate. That rate applies only when the input contains a **video**. Our flows (t2v, image→video) carry **no video input** and bill at **$7.00/M** — so the real cost is **$0.756**, and the saving is **~5%, not 72%** (~$44/mo at 1 000 clips, not ~$336). Confirmed by ByteDance's own deduction ratio (4.30 × 1.6279 = 7.00) and the token formula validated against a live response (243 000 predicted vs 246 840 actual, 5s 1080p). A correction banner now heads the research doc; the "2 000–5 000 clips/mo" trigger in it is void. The user chose to build the direct channel with this on the table — for the model itself (2.0 was **absent** from the catalog) and for direct control of `generate_audio`/4k/15s, not for price. ADR: [[seedance-direct-bytedance]].
- **Product constraint, not a bug: Seedance 2.0 refuses real human faces on input** (`InputImageSensitiveContentDetected.PrivacyInformation`). The warning sits on the whole `content` array, so it covers i2v first-frames, not just reference mode. ByteDance trusts only its **own** recent outputs, preset digital characters, or identity-verified assets — a face from **our** Flux models is not on that list, which collides with the Entity Library's portrait premise ([[entity-library-reference-tagging]]). i2v ships **enabled** (it works for everything that is not a face) with the refusal mapped to a **refundable `content_blocked`** naming the real reason, and the model-picker description says so before a credit is spent. **Unverified inference:** that a photorealistic Flux portrait is actually refused — first live-key test must confirm.
- New API surface: `integrations/bytedance/ark-client.ts` — the third `VideoProvider` (`POST /api/v3/contents/generations/tasks` → `cgt-…` id; `GET …/tasks/{id}` → six-state status folded into the neutral union). Transport/content failure split mirrors the other two providers exactly, so every money-path invariant is untouched.
- Seam: `VideoPollResult`'s error variant gained `blocked?: boolean` — distinct from `nsfw` (a finished-but-unsafe **output**); `blocked` marks a provider that produced nothing because it refused the **input**. Both settle to `content_blocked` + refund. The submit path now persists `content_blocked` too when the thrown error carries that `apiCode`.
- `registerCatalogRoutes` now takes a `ReadonlySet<VideoProviderId>` of configured backends instead of a `comfyConfigured` boolean (a second optional provider would have made it two booleans, then three). `AppDeps.videoProviders` became `Partial<…>` and is **merged** over the derived registry, so a routing test stubs only the backends it asserts on.
- Catalog: `seedance-2-0` ("Auteur", provider `bytedance`, `air: bytedance:dreamina-seedance-2-0-260128`, premium, 16:9/1:1/9:16, 5s→130 / 10s→260 credits, i2v on). **Pinned `resolutionProfile: 'hd'`** — left to the tier ladder a `premium` model reads the fhd table and renders 1080p at **$1.87**/clip instead of $0.76 (~2.5× cost, silently). A catalog test asserts the price stays above wholesale; the 35-credit standard tier covers Seedance 2.0 at **no** provider.
- Config: `ARK_API_KEY` (optional, unset-safe — the model is **hidden** from `/api/catalog` and a submit returns a clean `provider_error`). `ARK_ASSET_HOST = tos-ap-southeast-1.volces.com` is auto-folded into `ASSET_HOST_ALLOWLIST` **only when the key is set**. Note: assets live on `*.volces.com`, **not** the API's `*.bytepluses.com` — allowlisting the API domain would pass the SSRF gate for zero real downloads and fail every actual one. ByteDance **hard-deletes** finished videos at 24h; the existing `saveFromUrl` copy-out already covers it.
- Pinned ModelArk facts (each breaks the integration silently): the `dreamina-` model-id prefix is **mandatory** on 2.0 and absent on 1.x; Seedance 2.0 **rejects** `seed`/`camera_fixed`/`frames`/`service_tier` (a caller seed is dropped on purpose); `generate_audio` **defaults true** → pinned false (it would collide with CinemaStudio's own audio tracks at render); `ratio` defaults to `adaptive` → always sent explicitly; `duration: -1` is legal and drives billing → never forwarded; Seedance is served from **ap-southeast-1 only**; `DELETE /tasks/{id}` **destroys** the record of a finished task → never called.
- Verification (TDD, test-first): `@opencreate/api` **264/264** (was 248: +21 ark-client, +4 provider-routing, +4 config/SSRF, +catalog gating & pricing floor), `@opencreate/web` **200/200**, lint + typecheck clean across the workspace. **No live generation run** — no ByteDance key exists yet; the open items (real-face refusal on a Flux portrait, PAYG rate, `generate_audio` product call) need one.

## [2026-07-11] build | Template Catalog — Brainrot Studio (3 templates)

- New module `Templates` (`/templates`): a gallery of pre-authored viral formats that instantiate
  into a whole film — prompts, presets, per-shot model, durations, titles and spoken lines already
  filled in. ADR: [[template-catalog]].
- Templates are **server-side code** (`apps/api/src/modules/templates/catalog/*.ts`, one file each);
  only a `TemplateSummary` (no prompt text) crosses the wire.
- Shipped: `fruit-drama` («Фруктовая измена»), `cat-drama` («Кошачья измена»), `talking-food`
  («Говорящие фрукты») — all researched against the real TikTok formats, 9:16, 8s beat grid.
- `POST /api/films/from-template` builds the film + all shots in one transaction and **charges
  nothing**; every shot lands as a draft. Credits are spent per-shot, by the user, later.
- Price/quality **tiers** pin `shot.modelId`: draft `pixverse-v6` (448cr) / standard `wan-2-7`
  (704cr) / premium `veo-3-1-fast` (1120cr, native spoken audio) for an 8-clip drama.
  `assertTemplatesValid()` runs at BOOT — a tier model that cannot do a clip's duration or the
  template's aspect ratio is a failed deploy, not a silently re-priced generation.
- Contracts: `shot.modelId` (also fixes the model choice never being persisted), `shot.voiceover`,
  `film.templateId`, `film_audio.shotId` (makes "voice this shot" a replace, not a duplicate charge).
  All nullable + additive; micro-migrations in `db/client.ts`.
- Cinema gained a per-shot voiceover action (TTS → a `film_audio` track at the shot's timeline
  offset) and pre-fills the music prompt from the film's template.
- Tests: 525 green (contracts 24, api 301, web 200), incl. `templates.test.ts` (data invariants:
  price ordering, placeholder/variable parity, free-text never in a visual prompt, voice ids valid)
  and `test/templates.test.ts` (behaviour: charges nothing, EN→prompt / RU→line, ownership).

## [2026-07-11] build | Nano Banana Pro as the reference/character model + the face-routing rule

- **Reference-image generation moved to Nano Banana Pro** (Gemini 3 Pro Image, AIR `google:4@2`) via the EXISTING Runware image path — no new provider, one catalog entry. Chosen over the cheaper Nano Banana 2 (`google:4@3`, ~$0.069/img) because a character reference is generated ONCE and reused for the life of the entity: identity fidelity across subjects is the product, and the per-image delta is noise against it. $0.138/img at 1K → **28 credits** (~2× margin, mirroring flux-kontext-pro). Flux models KEPT per the owner's call; Nano Banana becomes the reference model, not a replacement catalog.
- `resolutionProfile: 'nanobanana'` added (1024×1024 / 1376×768 / 768×1376 — its 1K tier). Load-bearing exactly as for Kontext: the model publishes its own dimension list and rejects anything outside it, so the default square1024 table's 1344×768 would earn a provider 400 on every 16:9 request.
- **Nano Banana does NOT unlock faces on Seedance 2.0, and saying so was the point.** ByteDance's trust list is closed: *"Only outputs generated by ModelArk are trusted, while outputs from other platforms are not supported."* Nano Banana is Google — its portraits are refused exactly as Flux's are. Changing the image model changes reference *quality*, not the *policy*.
- **The routing rule that follows, and it needed almost no new code** — the entity-library ADR already built the mechanism. `seedance-2-0` carries no `referenceMode`, therefore: `ModelSelect` filters it out of the picker the instant an entity is tagged, and `service.ts` re-validates server-side (*"a capability the client can lie about is not a capability"*). **Character shots route to Kling / Veo / PixVerse / MiniMax / Wan** (no real-face policy); **Seedance 2.0 keeps t2v and face-free i2v**. A portrait attached as a plain i2v first frame still reaches ByteDance and is refused there — that is what the `content_blocked` + refund path is for.
- Two tests pin the invariant so a future "helpful" edit cannot silently open a credit-burning path into ByteDance's moderation: `seedance-2-0` must never declare a `referenceMode`, and **no** reference-capable catalog model may be ByteDance-backed. Plus an end-to-end check that tagging a character at `seedance-2-0` is rejected by the API *before any money moves*, and that the same tag at `nano-banana-pro` composes the prompt, ships the reference image, and renders at 1376×768.
- Consequence: the 30-day trust window, the Seedream-5.0-Lite-only trust source, and the digital-character / authorized-asset paths are **all moot under this design** — we never feed a face into Seedance 2.0. They return only if the product later wants Seedance 2.0 to animate characters. Recorded in [[seedance-direct-bytedance]] with the routing diagram.
- Web: `nanobanana` provider mark (a monoline crescent — the literal read of the name is what users look for), EN/RU descriptions. Verification: `@opencreate/api` 308/308, `@opencreate/web` 200/200, `@opencreate/contracts` 24/24, lint + typecheck clean workspace-wide.

## [2026-07-11] research | Why the Seedream branch is a trap (post-decision hardening of [[seedance-direct-bytedance]])

Follow-up research on the rejected alternative — "generate references with Seedream so Seedance 2.0 accepts faces" — found it structurally worse than the ADR originally described. Recorded so nobody reopens it on a false premise:

- **No permanent identity exists for a synthetic character on ByteDance, at any price.** A permanent `asset://` id is issued ONLY to a real, consenting human who completes liveness verification via QR with their own BytePlus account, with a face-consistency check on every upload. An AI face has no live human to verify. A custom character under Seedance 2.0 is therefore *inherently* a **30-day-renewable object, never a permanent one** — a platform ceiling, not an implementation gap.
- **`seed` is not supported on Seedream 5.0 at all** (only legacy `seedream-3-0-t2i`, which itself disclaims reproducibility). There is no "re-mint the portrait from stored prompt+seed" refresh. The only renewal is a **trust chain** (portrait → Seedance 2.0 video with `return_last_frame` → that frame is trusted for a fresh 30 days), costing a video generation per refresh, drifting the face each hop, and **fatal if missed**: expired outputs are unusable and there is no seed to regenerate from → character unrecoverable. That chain is INFERRED from the trust table, never documented as supported.
- **Naming trap on the critical path:** `seedream-5-0-260128` **IS** the Lite model (`seedream-5-0` and `seedream-5-0-lite` are the same model), and **Lite text-to-image is the only trusted image source**. Choosing `dola-seedream-5-0-pro` "for quality" is NOT trusted → the video step breaks silently. Lite is also cheaper ($0.035 vs $0.045+), so compliance and cost agree — only the trap is real.
- Trust is **content-based, not URL-based** ("compressing or forwarding files may invalidate trust verification") → such a pipeline needs byte-exact preservation (no re-encode/resize/metadata-strip/CDN recompression). It is also **per-Ark-account** ("cross-account use is not supported") → no per-tenant account sharding.
- Seedream image API (for the record): `POST /api/v3/images/generations`, **synchronous** (no polling), both regions, `watermark` **defaults TRUE** (opposite of Seedance video), output URLs valid 24h.

**Net:** routing characters to Kling / Veo / PixVerse / MiniMax / Wan is not a workaround for the face policy — it is **the only branch in which a user's character is permanent**. The shipped design stands; no code change.
