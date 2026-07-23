---
type: decision
status: accepted
updated: 2026-07-23
sources:
  - apps/api/src/modules/auth/auth.ts — better-auth Google provider (conditional)
  - apps/api/src/config.ts — GOOGLE_CLIENT_ID/SECRET parsing (nulled as a pair)
  - apps/web/src/modules/Auth/components/AuthForm.tsx — Google button
  - better-auth 1.6.x social providers + OAuth callback docs
tags:
  - project-docs
  - wiki/decision
  - auth
  - google-oauth
  - integration
---

# ADR: Complete Google OAuth (runtime-gated, no client/server drift)

## Status

**Accepted — 2026-07-23** (owner decisions taken interactively).

Owner decisions:
- **Provider:** Google via better-auth social providers (already the wired
  mechanism). No custom OAuth code.
- **Enablement:** the frontend learns whether Google is on at **runtime** from a
  new public endpoint `GET /api/auth/config` → `{ googleEnabled }`, NOT a
  build-time flag. Single source of truth; no drift.
- **Credentials:** created by the owner in Google Cloud Console; the code works
  the moment `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` land in `.env`.

## Context

The pieces were ~90% present but never "finished":

- **Backend** already parsed `GOOGLE_CLIENT_ID/SECRET` (`config.ts`, nulled as a
  pair) and enabled the better-auth Google provider only when both are set
  (`auth.ts`). better-auth serves `/api/auth/sign-in/social` and
  `/api/auth/callback/google` itself.
- **Frontend** already had `signIn.social({ provider:'google' })`
  (`authClient.ts`) and a Google button — but gated on a **build-time**
  `import.meta.env.VITE_GOOGLE_AUTH` flag, decoupled from the server's real
  config. That flag could drift: button with no server provider → 500; server
  provider with no flag → no button.

## Decision

1. **Public runtime flag.** New `GET /api/auth/config` (in `app.ts`, right after
   `registerAuth`, no `requireUser`) returns
   `{ googleEnabled: config.googleClientId !== null && config.googleClientSecret !== null }`
   — derived from the SAME creds pair that gates the provider. Contract:
   `authConfigSchema` in `@opencreate/contracts`. Registered as a static route so
   find-my-way matches it ahead of better-auth's `/api/auth/*` wildcard.
2. **Runtime-gated button.** `useAuthConfig()` (TanStack Query,
   `modules/Auth/model/authConfig.ts`, `staleTime: Infinity`) fetches the flag;
   `AuthForm` renders the Google button only when `data?.googleEnabled` (hidden
   while loading). The `VITE_GOOGLE_AUTH` build flag and its ambient type were
   removed.

## Dev cross-origin handling

Dev runs the SPA on `:5173` and the API on `:8787`; Vite proxies `/api` → `:8787`.
For OAuth the browser must land the Google callback back on the **SPA origin** so
the session cookie is set there. Therefore in **dev** set
`BETTER_AUTH_URL=http://localhost:5173` — better-auth then builds the Google
`redirect_uri` as `http://localhost:5173/api/auth/callback/google`, which the Vite
proxy forwards to the API; the cookie is set on `:5173` and the post-login
redirect (`callbackURL:'/create'`) resolves on the SPA. In **prod** (single
origin) `BETTER_AUTH_URL` is the public URL and the callback is
`{prod}/api/auth/callback/google`.

## Google Cloud Console setup (owner)

1. OAuth consent screen: External; add yourself as a Test user (until published).
2. Credentials → OAuth client ID → Web application. Authorized redirect URIs:
   - dev: `http://localhost:5173/api/auth/callback/google`
   - prod: `https://<domain>/api/auth/callback/google`
3. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the root `.env`. In dev also
   set `BETTER_AUTH_URL=http://localhost:5173`.

## Consequences

- **Positive:** button ⇄ provider can never disagree; zero new OAuth code;
  signup bonus already fires for social sign-ups (`auth.ts` databaseHook);
  enabling Google is now just two env vars + a redeploy.
- **Negative / notes:** `/api/auth/config` is one extra unauthenticated GET on the
  auth screen (cached `Infinity`). Dev OAuth requires the `BETTER_AUTH_URL=:5173`
  override — documented here and in `.env.example`.

## Verification (2026-07-23)

- `test/auth-config.test.ts` — 4 cases (false default, true on both creds, false
  on one cred, public/no-401). `AuthForm.test.tsx` — button hidden when disabled,
  hidden while loading, shown+wired when enabled.
- typecheck clean (contracts/api/web); live `GET /api/auth/config` returns
  `{ googleEnabled: false }` directly and through the Vite proxy.
- OAuth round-trip against Google pending the owner's Client ID/Secret.
