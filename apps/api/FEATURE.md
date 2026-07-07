# @opencreate/api — Feature doc

Fastify 5 API of the openCreate MVP: Runware-backed AI image/video generation with
better-auth sessions, a transactional credit ledger, a per-account generation library,
and local media storage. TypeScript strict, ESM, SQLite via drizzle-orm/better-sqlite3.

## What it does

- **Auth** — better-auth (email+password; Google when configured) mounted at
  `/api/auth/*` with a signup bonus (default 200 credits) granted through the ledger.
- **Credits** — append-only ledger (`signup_bonus` / `charge` / `refund`) with the
  denormalized `user.creditsBalance` mutated only inside the same SQLite transaction.
  Invariants: balance never below 0; refund at most once per generation.
- **Catalog** — curated model list (2 image + 5 video models) with honest provider
  labels, Runware AIR ids, aspect ratios and credit prices. Single source of truth for
  validation, pricing and resolution mapping.
- **Generations** — the core lifecycle: charge at submit → call Runware → store the
  asset in our own storage → poll-on-read for async video → refund on failure.
  Images are synchronous (201); video is async (202 + SPA polls `GET /:id` every 4s,
  each poll re-asks Runware `getResponse`). Finished assets are downloaded immediately
  because Runware URLs expire in 7 days. Money-path atomicity: charge+row-insert and
  fail-flip+refund are each ONE SQLite transaction (a crash between the halves can
  neither eat credits nor strand a failed row without its refund). Per-generation
  poll throttle (3s min between provider polls; in-window polls answer from DB) and
  a compound `(createdAt, id)` pagination cursor (same-ms rows are never skipped).
  Deleting a processing generation is refused with 409 `conflict`.
- **Media** — `@fastify/static` serves `STORAGE_DIR` at `/media/*` (UUID keys, public
  by design for the MVP). Asset downloads are SSRF-gated: `saveFromUrl` only fetches
  https URLs whose host is on `ASSET_HOST_ALLOWLIST` (default `runware.ai` + true
  subdomains), and never follows redirects (`redirect: 'manual'`, any 30x = error) —
  an open redirect on an allowlisted host cannot re-point the server-side fetch.
- **Errors** — every failure leaves as the shared envelope
  `{ error: { code, message } }` with stable codes from `@opencreate/contracts`.
  Unexpected 5xx are sanitized to `internal_error` / "Something went wrong" — the real
  message and stack go to the logs only; domain ApiErrors keep their messages.
- **Logging** — pino via fastify (`LOG_LEVEL`, default `info`, silent in tests),
  authorization/cookie/set-cookie redaction, reqId correlation; structured money-path
  events: `credits.signup_bonus|charge|refund`, `generation.settle|fail`, `provider.error`.
- **Rate limits** — `@fastify/rate-limit`: global 300/min per IP; strict buckets
  `/api/auth/*` 10/min and `POST /api/generations` 20/min; 429 = envelope `rate_limited`.
  Behind the documented reverse proxy set `TRUST_PROXY` (`true` or a trusted
  peer address/CIDR list) so buckets key on the real client from
  `X-Forwarded-For` — unset (default) the header is ignored and a forged one
  can neither reset nor pollute buckets.
- **Production single-origin** — with `NODE_ENV=production` and a built SPA at
  `WEB_DIST_PATH` (default `../web/dist`), the API serves it at `/` with an index.html
  fallback for non-`/api`, non-`/media` GETs (one origin, first-party cookies, no CORS).

## HTTP surface

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | – | `{ ok: true }` |
| * | `/api/auth/*` | – | better-auth handler (sign-up/sign-in/session…) |
| GET | `/api/me` | ✓ | `{ id, email, name, creditsBalance }` (ledger-accurate) |
| GET | `/api/credits/transactions` | ✓ | last 100 ledger rows, newest first |
| GET | `/api/catalog` | – | `{ models: CatalogModel[] }` |
| POST | `/api/generations` | ✓ | body `CreateGenerationInput`; 201 image / 202 video; 400/402/502 |
| GET | `/api/generations` | ✓ | `?limit` (≤50, default 24) `&cursor` (zod-validated, 400 on garbage); `{ items, nextCursor }` |
| GET | `/api/generations/:id` | ✓ | doubles as the Runware poll while processing (throttled to 1 provider call / 3s / generation) |
| DELETE | `/api/generations/:id` | ✓ | 204; removes media file + row; 409 `conflict` while processing |
| GET | `/media/:file` | – | stored generation assets |
| GET | `/*` | – | production only: built SPA + index.html fallback |

## Module map

```
src/
├── index.ts                    # boot: config → db → storage → runware → listen
├── app.ts                      # buildApp(deps) DI composition root + error envelope
├── config.ts                   # zod-validated env → AppConfig
├── db/                         # drizzle schema, better-sqlite3 client, idempotent DDL
├── modules/
│   ├── auth/                   # better-auth instance + Fastify bridge + requireUser
│   ├── users/                  # GET /api/me
│   ├── credits/                # ledger (grant/charge/refund) + transactions route
│   ├── catalog/                # CATALOG + creditsFor/resolutionFor + route
│   └── generations/            # lifecycle service + thin routes (the core)
├── integrations/runware/       # REST client (fetch, no SDK): image/video/getResponse
├── storage/local.ts            # StorageProvider: save-from-url → /media/<key>.<ext>
└── scripts/verify-catalog.ts   # AIR id verification against Runware modelSearch
scripts/build.mjs               # esbuild bundle → runnable dist/index.js (contracts inlined)
```

Every `.ts` has a `.ts.md` sidecar doc with responsibilities, diagrams and commit refs.

## Run / test

```bash
pnpm --filter @opencreate/api dev         # tsx watch, http://localhost:8787
pnpm --filter @opencreate/api db:migrate  # create SQLite + tables (also runs on boot)
pnpm --filter @opencreate/api test        # vitest — 93 tests, all HTTP-level or unit
pnpm --filter @opencreate/api lint        # eslint src test
pnpm --filter @opencreate/api typecheck   # tsc --noEmit
pnpm --filter @opencreate/api build       # tsc type gate + esbuild → dist/index.js
pnpm --filter @opencreate/api start       # NODE_ENV=production node dist/index.js
pnpm start                                # same, from the repo root
```

Env (see `.env.example`): `RUNWARE_API_KEY`, `BETTER_AUTH_SECRET` are required;
`DATABASE_PATH`, `STORAGE_DIR`, `SIGNUP_BONUS_CREDITS`, `GOOGLE_CLIENT_ID/SECRET`,
`LOG_LEVEL`, `NODE_ENV`, `TRUSTED_ORIGINS`, `WEB_DIST_PATH`, `ASSET_HOST_ALLOWLIST`
(SSRF allowlist for asset downloads, default `runware.ai`), `TRUST_PROXY`
(reverse-proxy header trust for rate-limit attribution, default off), `ENV_FILE`
optional.
The nearest `.env` (repo root) is loaded natively at boot via Node 22
`process.loadEnvFile` — no manual sourcing; real env vars always win. In prod,
`BETTER_AUTH_URL` must be the public https origin. Tests never need env — they
inject an in-memory config and a scripted Runware fake
(`test/helpers/build-test-app.ts`).

## Ops (production packaging)

Deployed as ONE container built by the repo-root `Dockerfile` (multi-stage:
full-workspace build → prod-only pnpm install → `node:22-slim` runtime, non-root
`node` user) and run with the repo-root `docker-compose.yml` (port 8787,
`env_file: .env`, `./data:/app/data` volume, `restart: unless-stopped`,
`/health` healthcheck via node `fetch` — the slim image has no curl).

- **Boot = migrate**: `createDb()` runs the idempotent DDL + guarded
  micro-migrations on every start; a fresh volume needs no manual migrate step.
- **State**: SQLite db + WAL + downloaded media all under `/app/data` — backup
  is a copy of the host `./data` (quiesced) or `sqlite3 .backup` online.
- **Single instance only**: SQLite/WAL is single-process — never scale the
  service; the Postgres path is recorded in the architecture ADR.
- **Runtime contents**: `apps/api/dist/index.js` (esbuild bundle, contracts
  inlined, deps external), prod `node_modules` (better-sqlite3 linux prebuild),
  `apps/web/dist` (landing prerendered at build by a pure-Node SSR pass — no
  chromium/playwright in any image stage).
- **Health**: `GET /health` is dependency-free; container healthcheck and any
  external monitor should use it.

Runbook (env table, first run, TLS/reverse proxy, backup/restore): `PROD.md`.

## Design references

- Spec: `docs/superpowers/specs/2026-07-06-opencreate-mvp-design.md`
- ADR: `docs/wiki/decisions/opencreate-mvp-architecture.md`
- Implementation note: `docs/wiki/architecture/opencreate-implementation.md`
