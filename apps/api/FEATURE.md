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
  because Runware URLs expire in 7 days.
- **Media** — `@fastify/static` serves `STORAGE_DIR` at `/media/*` (UUID keys, public
  by design for the MVP).
- **Errors** — every failure leaves as the shared envelope
  `{ error: { code, message } }` with stable codes from `@opencreate/contracts`.

## HTTP surface

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | – | `{ ok: true }` |
| * | `/api/auth/*` | – | better-auth handler (sign-up/sign-in/session…) |
| GET | `/api/me` | ✓ | `{ id, email, name, creditsBalance }` (ledger-accurate) |
| GET | `/api/credits/transactions` | ✓ | last 100 ledger rows, newest first |
| GET | `/api/catalog` | – | `{ models: CatalogModel[] }` |
| POST | `/api/generations` | ✓ | body `CreateGenerationInput`; 201 image / 202 video; 400/402/502 |
| GET | `/api/generations` | ✓ | `?limit` (≤50, default 24) `&cursor`; `{ items, nextCursor }` |
| GET | `/api/generations/:id` | ✓ | doubles as the Runware poll while processing |
| DELETE | `/api/generations/:id` | ✓ | 204; removes media file + row |
| GET | `/media/:file` | – | stored generation assets |

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
```

Every `.ts` has a `.ts.md` sidecar doc with responsibilities, diagrams and commit refs.

## Run / test

```bash
pnpm --filter @opencreate/api dev         # tsx watch, http://localhost:8787
pnpm --filter @opencreate/api db:migrate  # create SQLite + tables (also runs on boot)
pnpm --filter @opencreate/api test        # vitest — 31 tests, all HTTP-level or unit
pnpm --filter @opencreate/api lint        # eslint src test
pnpm --filter @opencreate/api typecheck   # tsc --noEmit
pnpm --filter @opencreate/api build       # tsc -p tsconfig.build.json → dist/
```

Env (see `.env.example`): `RUNWARE_API_KEY`, `BETTER_AUTH_SECRET` are required;
`DATABASE_PATH`, `STORAGE_DIR`, `SIGNUP_BONUS_CREDITS`, `GOOGLE_CLIENT_ID/SECRET`
optional. Tests never need env — they inject an in-memory config and a scripted
Runware fake (`test/helpers/build-test-app.ts`).

## Design references

- Spec: `docs/superpowers/specs/2026-07-06-opencreate-mvp-design.md`
- ADR: `docs/wiki/decisions/opencreate-mvp-architecture.md`
- Implementation note: `docs/wiki/architecture/opencreate-implementation.md`
