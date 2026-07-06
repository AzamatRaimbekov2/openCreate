---
type: decision
status: current
updated: 2026-07-06
sources:
  - docs/superpowers/specs/2026-07-06-opencreate-mvp-design.md
tags:
  - project-docs
  - wiki/decision
  - architecture
---

# ADR: openCreate MVP Architecture (Runware-backed image/video generation platform)

## Status

Accepted — approved explicitly by the user on 2026-07-06 (project-kickoff gate).

## Context

Building an AI image & video generation platform (functional analogue of Higgsfield.ai, unique simple design) with a "cheaper generation" landing page. Provider: Runware API. MVP: txt2img, txt2vid, img2vid, model/aspect/duration options, per-account gallery, auth + free starter credits (no payments yet), i18n EN+RU. User explicitly chose Vite SPA + separate backend over Next.js.

Research (2026-07-06, workflow wf_9fc64756-311) established: Runware is a single REST endpoint (`POST https://api.runware.ai/v1`, array of tasks, AIR model ids); `imageInference` is sync, `videoInference` is async-only with `getResponse` polling; **output URLs expire after 7 days**; failed requests are not charged; wholesale prices support honest "cheaper" claims for images and standard-tier video but NOT for Kling/Veo tiers.

## Decision

1. **pnpm monorepo**: `apps/web` (React 19 + Vite 8 SPA, modular architecture per react-senior-standard: TanStack Router/Query, Zustand, Tailwind v4, RHF+Zod, i18next EN/RU), `apps/api` (Node 22 + Fastify 5 + TypeScript), `packages/contracts` (shared Zod schemas).
2. **Runware key server-side only**; API proxies all generation calls.
3. **Credit ledger**: `credit_transactions` (signup_bonus/hold/settle/refund) + `users.credits_balance`; hold at submit, settle on success, refund on failure. 1 credit = $0.01; 200 signup credits; credits never expire.
4. **Async video** via client polling (TanStack Query 4s interval) → API `getResponse`; webhooks deferred (no public URL in MVP dev).
5. **Own asset storage**: API downloads finished media immediately (7-day Runware TTL); `StorageProvider` abstraction — local disk MVP, S3/R2 later.
6. **DB**: Drizzle ORM on SQLite (MVP) with migration path to Postgres.
7. **Auth**: better-auth (email+password, Google OAuth, cookie sessions).
8. **Curated model catalog** as typed config: FLUX schnell/dev (1–2 cr), PixVerse V6 / MiniMax Fast (35 cr/5s), Wan 2.7 (55), Kling 3 Pro (80), Veo 3.1 Fast (140). Seedance excluded until pricing verified.
9. **Moderation on**: `safety.checkContent`, video `safety.mode: "fast"`, respect `NSFWContent`.
10. **Landing** = SPA route `/` prerendered at build; only verified claims (images from $0.01; 5s video from $0.35; credits never expire).

Diagrams (C4 container, video sequence, ER) live in the spec: `docs/superpowers/specs/2026-07-06-opencreate-mvp-design.md`.

## Consequences

- TS end-to-end; contracts shared via Zod — no API drift.
- SEO weaker than Next.js SSG — accepted trade-off (user choice), mitigated by prerender + meta/OG.
- Local storage requires disk space and a later migration job to S3/R2.
- Credit economics allow ~55–70% blended gross margin while headline claims stay honest.

## Rejected alternatives

- **Next.js 16 single app** — rejected by user choice (SPA + separate backend preferred).
- **Supabase/BaaS** — vendor lock; weaker transactional control over the ledger.
- **FastAPI/Go backend** — second language; loses shared Zod contracts.
- **Client-side Runware SDK** — exposes API key.
