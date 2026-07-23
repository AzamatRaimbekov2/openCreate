# authConfig.ts — AI component doc

> AI-facing sidecar for `authConfig.ts`. Created 2026-07-22. Keep this in sync with the code on every change.

## Purpose
A TanStack Query hook that reads the server's public auth-provider flags (`GET /api/auth/config`) so the Auth UI renders optional sign-in buttons (Google) from the server's REAL config — no build-time flag, no drift (ADR google-oauth).

## What it does (for an AI reader)
- Responsibilities: fetch `/api/auth/config` once (cached for the session) and expose `{ googleEnabled }`.
- Public API / exports: `useAuthConfig()` → `UseQueryResult<AuthConfig>` (`data?.googleEnabled`).
- Inputs → Outputs: none → `AuthConfig` (`{ googleEnabled: boolean }`); `data` is `undefined` while loading.
- Side effects: one GET via `shared/libs/apiClient` `api()`.

## Dependencies
- Imports / depends on: `@tanstack/react-query` (`useQuery`), `shared/libs/apiClient` (`api`), `@opencreate/contracts` (`AuthConfig`).
- Used by: `modules/Auth/components/AuthForm.tsx` (gates the Google button).

## Diagram
```mermaid
flowchart LR
  useAuthConfig -->|api GET /api/auth/config| server
  server -->|{ googleEnabled }| AuthForm[Google button?]
```

## Key decisions / gotchas
- `staleTime: Infinity` — provider enablement changes only on redeploy, so no re-fetch/flicker on remount.
- `data` undefined (loading) ⇒ button hidden — never flash a button that might not be backed by a provider.
- Replaces the old `import.meta.env.VITE_GOOGLE_AUTH` build flag.

## Commits
- _no commit yet_
