---
type: architecture
status: current
updated: 2026-07-06
sources:
  - ../decisions/opencreate-mvp-architecture.md
  - ../../superpowers/specs/2026-07-06-opencreate-mvp-design.md
  - ../../superpowers/plans/2026-07-06-opencreate-mvp.md
tags:
  - project-docs
  - wiki/architecture
  - opencreate
---

# openCreate MVP — ADR → implementation map

How the accepted ADR [[opencreate-mvp-architecture]] landed in code (plan
`docs/superpowers/plans/2026-07-06-opencreate-mvp.md`, Tasks 1–22, 2026-07-06).
Feature docs: `apps/api/FEATURE.md`, `apps/web/FEATURE.md`. Every source file has a
`.md` sidecar with responsibilities, a Mermaid diagram, and commit refs.

## Decision → code

| ADR decision | Implementation |
| --- | --- |
| 1. pnpm monorepo (SPA + API + contracts) | `pnpm-workspace.yaml`; `apps/web` (React 19 + Vite 8, TanStack Router/Query, Zustand, Tailwind v4, i18next EN/RU), `apps/api` (Fastify 5), `packages/contracts` (Zod v4 schemas both sides import) |
| 2. Runware key server-side only | `apps/api/src/integrations/runware/client.ts` — plain-fetch REST client; key lives in a closure, injected via `AppDeps`; the SPA only ever calls our API |
| 3. Credit ledger (hold→settle/refund) | `apps/api/src/modules/credits/ledger.ts` — hold+settle collapsed into **charge at submit**, refund once per generation, `signup_bonus` on registration; balance mutated only inside the same SQLite transaction as the ledger row |
| 4. Async video via client polling | SPA polls `GET /api/generations/:id` every 4s (`modules/Gallery/model/generationsApi.ts`); each API read re-polls Runware `getResponse` (`modules/generations/service.ts` — poll-on-read, no background workers) |
| 5. Own asset storage (7-day Runware TTL) | `apps/api/src/storage/local.ts` (`StorageProvider`; local disk MVP) — assets downloaded the moment a generation succeeds, served at `/media/*` via `@fastify/static` |
| 6. Drizzle on SQLite | `apps/api/src/db/{schema,client,ddl}.ts` — idempotent DDL bootstrap (works for `:memory:` tests), WAL, FK on |
| 7. better-auth | `apps/api/src/modules/auth/{auth,plugin}.ts` — email+password (+Google when configured), Fastify⇄web-Request bridge, `requireUser` decorator, signup-bonus databaseHook |
| 8. Curated model catalog | `apps/api/src/modules/catalog/catalog.ts` — 2 image + 5 video models with AIR ids, credits, aspect→resolution mapping; `scripts/verify-catalog.ts` checks AIR ids against Runware `modelSearch` |
| 9. Moderation on | Runware client sends `safety.checkContent` (images) and `safety: { checkContent, mode: 'fast' }` (video) |
| 10. Landing with verified claims only | `apps/web/src/modules/Landing/` — hero claims, price table marked "verified July 2026" (`model/pricingData.ts`); prerender deferred (plan Task 23, stretch) — `index.html` carries full meta/OG |

## Delta vs ADR (recorded deviations)

- **Hold→settle collapsed into charge-at-submit** (also noted in the plan): one
  ledger `charge` at submit + `refund` on failure gives the same user-visible
  semantics with one fewer state.
- **Prerendered landing** (decision 10) shipped as the stretch Task 23 — not done in
  MVP; static `index.html` meta/OG is the mitigation the ADR itself names.

## Verification (2026-07-06)

- `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` — all green at root
  (116 unit/HTTP tests: 6 contracts + 31 api + 79 web).
- Playwright e2e (`apps/web/e2e/`) — mocked-API happy path (landing → create →
  processing card → succeeded video, balance 200→165) + RU landing switch.
- Manual smoke: API boots against real `.env`; `/health`, `/api/catalog`, and the
  401 envelope verified over HTTP.
