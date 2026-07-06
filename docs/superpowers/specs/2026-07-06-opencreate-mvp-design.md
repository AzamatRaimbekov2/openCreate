# openCreate MVP — Design Spec

Date: 2026-07-06 · Status: **approved by user** (architecture gate passed)
Related ADR: `docs/wiki/decisions/opencreate-mvp-architecture.md`

## 1. Product brief

AI image & video generation web platform — functional analogue of Higgsfield.ai with a unique, simple, beautiful design — built on the Runware API, plus a landing page positioned as "cheaper generation" (honest, scoped claims). UI languages: EN + RU (i18n from day one).

### MVP scope (user-approved)
- Text-to-image, text-to-video, image-to-video (first-frame upload).
- Model picker, aspect ratio (9:16 / 1:1 / 16:9), video duration.
- Generation gallery/history per account (Library).
- Auth: email+password and Google OAuth (cookie sessions). 200 free signup credits, deduction per generation, hold → settle/refund ledger.
- Landing page: hero, honest price comparison, how-it-works, CTA.
- Landing route prerendered at build for SEO; full meta/OG tags.

### Non-goals (v2+)
Payments (Stripe), preset/effects library, editing tools (inpaint/upscale/bg-removal UI), character consistency (Soul-ID analog via photoMaker), community feed, teams, admin panel, video-to-video, lipsync/face-swap.

## 2. Architecture

pnpm workspaces monorepo:

```
openCreate/
├── apps/
│   ├── web/            # React 19 + Vite 8 SPA
│   └── api/            # Node 22 + Fastify 5 + TypeScript
├── packages/
│   └── contracts/      # Zod schemas + shared API types (single source of truth)
└── docs/
```

### apps/web — per react-senior-standard (modular architecture)
```
src/
├── @types/
├── modules/
│   ├── Auth/         # login/register forms, session hook
│   ├── Generator/    # prompt box, mode switch, model picker, params, submit
│   ├── Gallery/      # history grid, generation card w/ status polling, detail
│   ├── Credits/      # balance widget, transactions list
│   └── Landing/      # hero, price table, how-it-works, CTA
├── routes/           # TanStack Router file-based: /, /create, /library, /pricing, /login
└── shared/           # ui kit, config (i18n, query client), libs, types
```
Stack: TypeScript 5 strict (zero `any`, `type` not `interface`), TanStack Router (file-based), TanStack Query v5 (all API data; polling via `refetchInterval`), Zustand (generator form state), Tailwind v4 (no CSS files), RHF+Zod, i18next EN/RU, Vitest/RTL/Playwright, pnpm, ESLint v9 + Prettier (no semicolons, single quotes, trailing commas).
Mandatory: 4 UI states (loading skeletons / empty / error+retry / data); frontend-error-ux set (404, blocking error modal, crash fallback, offline overlay); module public API via `index.ts`; no cross-module imports; aliases (`modules/`, `shared/`, `routes/`).

### apps/api — Fastify modular
```
src/
├── modules/
│   ├── auth/         # better-auth mount (email+password, Google, cookie sessions)
│   ├── users/        # GET /api/me (profile + balance)
│   ├── credits/      # ledger service: hold / settle / refund; transactions list
│   ├── generations/  # POST/GET/LIST/DELETE; Runware orchestration; asset download
│   └── catalog/      # curated model catalog (typed config, credit prices)
├── integrations/runware/  # REST client: imageInference, videoInference, getResponse
├── storage/          # StorageProvider abstraction: local disk (MVP) → S3/R2
├── db/               # Drizzle schema + migrations (SQLite MVP → Postgres)
└── app.ts
```

### Runware integration facts (verified against docs, mid-2026)
- REST `POST https://api.runware.ai/v1`, `Authorization: Bearer <key>`, body is always a JSON **array** of tasks; each task: `taskType`, `taskUUID` (client UUID v4), `model` (AIR id).
- `imageInference`: sync by default. Params: `positivePrompt`, `width`/`height`, `numberResults`, `outputFormat`, `includeCost: true`, `safety.checkContent: true`. Response: `imageURL`, `seed`, `NSFWContent`, `cost`.
- `videoInference`: **async only**. Params add `duration`, `inputs.frameImages` (i2v: `{image, frame: "first"}`), `safety.mode: "fast"`, `includeCost: true`. Poll via `getResponse {taskUUID}` → `status: processing|success|error` + `progress`. Exponential backoff from 1–2s.
- **Output URLs expire in 7 days** → API downloads finished assets to own storage immediately; DB stores local media URLs.
- Failed requests are not charged → refund credits on failure.
- API key server-side only. Rate behavior: retry 429/503/504 with backoff; 402 = insufficient Runware balance (alert, fail gracefully).

## 3. Data model (Drizzle)

- `users` (better-auth tables) + `credits_balance int not null default 0`.
- `credit_transactions`: id, user_id, amount (+/-), kind (`signup_bonus|hold|settle|refund`), generation_id?, created_at. Balance mutations only through ledger service, transactional.
- `generations`: id, user_id, type (`image|video`), mode (`text|image`), status (`processing|succeeded|failed`), prompt, model_id, params json (aspect, duration, seed, resolution), cost_credits, runware_task_uuid, runware_cost_usd?, media json (local URLs), error_message?, created_at, completed_at.

## 4. API contract (all bodies Zod-validated via packages/contracts)

| Method | Path | Purpose |
|---|---|---|
| * | `/api/auth/*` | better-auth (register, login, Google, session, logout) |
| GET | `/api/me` | profile + credits balance |
| GET | `/api/catalog` | model catalog with credit prices & param options |
| POST | `/api/generations` | create; image → 201 with result; video → 202 processing |
| GET | `/api/generations/:id` | status/result (SPA polls every 4s while processing) |
| GET | `/api/generations?cursor=` | paginated history (Library) |
| DELETE | `/api/generations/:id` | remove from library |
| GET | `/api/credits/transactions` | ledger list |
| GET | `/media/*` | serve stored assets (local storage MVP) |

Key flows: credits **hold** at submit → **settle** on success / **refund** on failure (and on NSFW-block). Image flow synchronous end-to-end; video flow async with client polling.

## 5. Model catalog & credit economics (research-verified wholesale prices)

**1 credit = $0.01 retail. 200 signup credits. Credits never expire.**

| Tier | Model (AIR id) | Wholesale | Credits | Landing claim |
|---|---|---|---|---|
| Image Fast | FLUX schnell `runware:100@1` | ~$0.002 | 1 | «от $0.01 за изображение» |
| Image Quality | FLUX dev `runware:101@1` | ~$0.004 | 2 | ~7x дешевле Higgsfield NB Pro |
| Video Standard 5s | PixVerse V6 `pixverse:1@8` / MiniMax Fast `minimax:4@1` | $0.10–0.19 | 35 | «5s видео от $0.35» — 2.5x дешевле Higgsfield Seedance |
| Video Plus 5s | Wan 2.7 `alibaba:wan@2.7` 720p | ~$0.50 | 55 | паритет/ниже |
| Video Pro 5s | Kling 3.0 Pro `klingai:kling-video@3-pro` | ~$0.56 | 80 | без клейма (Higgsfield субсидирует) |
| Video Premium 8s | Veo 3.1 Fast `google:3@2` | ~$1.20 | 140 | «по себестоимости» |

Catalog is a typed config in `apps/api/src/modules/catalog/` — verify AIR ids against `modelSearch`/docs at implementation time; exclude Seedance from Standard tier until per-clip vs per-second pricing is verified in Playground.

Landing claims allowed: images from $0.01; 5s video from $0.35; credits never expire; no subscription required. Forbidden: blanket "cheaper than everyone" (Kling/Veo exceptions), hardcoded competitor numbers beyond the verified table (keep in one config file, re-verify quarterly).

## 6. Error handling & UX states

- Every screen: loading skeleton / empty / error+retry / data.
- Video card: processing state with progress %, honest queue messaging; on failure — error + «кредиты возвращены».
- Global: 404 page, blocking error modal, crash fallback (ErrorBoundary), offline overlay.
- API errors: typed error envelope `{code, message}`; insufficient credits → 402-style code with CTA; Runware safety block → clear message + refund.

## 7. Testing & verification

- Contract tests for API (Vitest + fastify.inject): auth, credits ledger invariants (hold/settle/refund never negative balance), generation lifecycle with mocked Runware client.
- Frontend: component tests (RTL) for the 4 states of Generator/Gallery/Credits; e2e happy path (Playwright) with mocked API.
- Behaviour acceptance criteria (behaviour-harness) per feature before code.
- `pnpm lint && pnpm typecheck && pnpm test` green before done; build must succeed.

## 8. Rejected alternatives

1. Next.js 16 single app — user chose SPA + separate API; SEO mitigated by prerendering landing route.
2. Supabase/BaaS — vendor lock, weaker control over ledger transactionality.
3. FastAPI/Go backend — second language; TS everywhere shares Zod contracts.
4. Browser-side Runware SDK — leaks API key.

## 9. Risks

1. Seedance pricing ambiguity (per-clip vs per-second) — excluded from Standard tier until verified.
2. Runware 7-day asset TTL — mitigated by immediate download to own storage.
3. Video latency (minutes) — honest progress UX + refund on failure.
4. Moderation liability — `safety.checkContent` + `safety.mode: fast` on from day one; `NSFWContent` flag respected.
5. Competitor prices drift (Higgsfield repriced twice in 2026) — single config file, marked "verified 2026-07".
