# config.ts — AI component doc

> AI-facing sidecar for `config.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Single source of typed configuration for the API (plan Task 3). Validates `process.env` with Zod at boot (fail fast on misconfiguration) and maps it to a camelCase `AppConfig`; no other file reads `process.env`. Ops hardening added native `.env` loading: `loadEnvFromFile()` wraps Node 22's `process.loadEnvFile` so `pnpm dev` / `db:migrate` work without manually sourcing the repo-root `.env`.

## What it does (for an AI reader)
- Responsibilities: parse + default env vars; normalize empty Google OAuth creds to `null`; hydrate `process.env` from the nearest `.env` file on the default boot path; resolve `WEB_DIST_PATH` to an absolute path anchored at the api package root; parse `TRUSTED_ORIGINS` (comma list, default `[WEB_ORIGIN]`), `ASSET_HOST_ALLOWLIST` (comma list, default `['runware.ai']`), `ASSET_FETCH_TIMEOUT_MS`/`ASSET_MAX_BYTES` (positive ints, defaults 120000 / 536870912) and `TRUST_PROXY` (tri-state → `trustProxy: boolean | string`, default `false`).
- Public API / exports: `AppConfig` (type — includes `nodeEnv`, `webDistPath`, `trustedOrigins`, `assetHostAllowlist`, `assetFetchTimeoutMs`, `assetMaxBytes`, `trustProxy`), `LogLevel` (type), `loadConfig(env?): AppConfig`, `loadEnvFromFile(path?): void`.
- Inputs → Outputs: `NodeJS.ProcessEnv` → validated `AppConfig`; throws `ZodError` on invalid env. `loadEnvFromFile`: explicit path → `ENV_FILE` env var → nearest `.env` walking up from cwd (repo root in this workspace).
- Side effects: `loadConfig()` with NO argument calls `loadEnvFromFile()` (mutates `process.env` via Node's loader); `loadConfig(env)` with an explicit env object stays pure — tests rely on that.

## Dependencies
- Imports / depends on: `zod` (v4 — uses `z.url()`), `node:fs` (`existsSync`), `node:path`.
- Used by: `src/index.ts` (boot), `src/db/migrate.ts`; tests bypass it via `test/helpers/build-test-app.ts` which hand-builds an `AppConfig`. `test/env-loading.test.ts` covers the loader contract.

## Diagram
```mermaid
flowchart LR
  DOTENV[.env / ENV_FILE] -->|process.loadEnvFile, guarded| ENV[process.env]
  ENV --> LC[loadConfig / envSchema] --> CFG[AppConfig] --> APP[buildApp deps]
```

## Key decisions / gotchas
- `GOOGLE_CLIENT_ID || null` (not `??`): empty string in `.env.example` means "not configured" → Google provider stays disabled.
- `BETTER_AUTH_SECRET` must be ≥32 chars; `API_PORT`/`SIGNUP_BONUS_CREDITS` use `z.coerce.number()` since env values are strings.
- `process.loadEnvFile` NEVER overrides already-set real env vars (verified empirically) — platform-injected env always wins over the file; a missing file is a silent no-op (`try/catch`), so production needs no `.env` at all.
- `LOG_LEVEL` is an allowlisted pino level enum (default `info`); tests build their config with `silent` so suites stay quiet.
- `webDistPath`: relative values resolve against the PACKAGE root (`fileURLToPath(new URL('..', import.meta.url))` — apps/api from both `src/` and the bundled `dist/`), NOT cwd: `pnpm start` runs from the repo root while `pnpm dev` runs from apps/api, and `../web/dist` must mean apps/web/dist in both.
- `trustedOrigins`: `TRUSTED_ORIGINS` comma list (trimmed, empties dropped) or `[WEB_ORIGIN]` — the allowlist for better-auth's CSRF origin check; single-origin deploys need no extra var.
- `NODE_ENV` stays a free string (default `development`); only the exact value `production` flips prod behaviors in `app.ts`.
- `assetHostAllowlist` (SSRF, review finding): host suffixes `storage.saveFromUrl` may fetch — provider asset URLs arrive in PROVIDER RESPONSES, so downloads are default-deny-locked to Runware's domain; a provider/CDN change is an env edit (`ASSET_HOST_ALLOWLIST`), not code. Consumed by `index.ts` → `createLocalStorage(dir, allowlist, limits)`.
- `assetFetchTimeoutMs` / `assetMaxBytes` (download limits, review finding): hard deadline for the WHOLE asset download and max bytes counted while streaming — a stalled provider stream must not hang a settlement forever, and an oversized body must not fill the disk that also holds the SQLite db. Defaults (120s / 512MB) mirror `storage/local.ts`'s exported constants so an unset env keeps behavior identical. Consumed by `index.ts` → `createLocalStorage(..., { fetchTimeoutMs, maxBytes })`. Pinned by `test/env-loading.test.ts` + `test/storage.test.ts`.
- `trustProxy` (rate-limit attribution, review finding): `parseTrustProxy(TRUST_PROXY)` — unset/empty/`'false'` → `false` (default-deny: direct-exposure deploys must never honor a client-forged `X-Forwarded-For`), `'true'` → `true` (trust the header from any peer — the proxy MUST then overwrite the inbound header), anything else passes through verbatim as fastify/proxy-addr address/CIDR/keyword list (e.g. `127.0.0.1`, `loopback,uniquelocal` — the safer shape: proxy-addr walks from the socket peer and stops at the first untrusted hop, so appended inbound XFF chains still resolve to the real client). Without it, PROD.md's reverse proxy makes `req.ip` always loopback → ALL users share one rate-limit bucket (auth-lockout DoS). Consumed by `app.ts` → Fastify `trustProxy`. Pinned by `test/env-loading.test.ts` + `test/rate-limit.test.ts`.

## Commits
- eb91028 feat(api): fastify skeleton with typed config and health route
- 5e8de3d feat(api): native env loading + structured logging — loadEnvFromFile + LOG_LEVEL
- b21a116 feat(api): production single-origin serving — NODE_ENV/WEB_DIST_PATH/TRUSTED_ORIGINS added
- a7e4cd9 fix(api): ssrf allowlist, cursor tiebreaker, poll throttle — ASSET_HOST_ALLOWLIST → assetHostAllowlist
- eb17afd fix(api): trust proxy for per-client rate limits behind the documented reverse proxy — TRUST_PROXY → trustProxy (parseTrustProxy tri-state)
- de61e59 feat(api): db-level refund-once index + asset download limits — ASSET_FETCH_TIMEOUT_MS/ASSET_MAX_BYTES → assetFetchTimeoutMs/assetMaxBytes
