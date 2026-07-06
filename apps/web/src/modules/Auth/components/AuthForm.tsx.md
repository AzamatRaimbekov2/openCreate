# AuthForm.tsx — AI component doc

> AI-facing sidecar for `AuthForm.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose

The login/registration card rendered on `/login`: one component for both modes with
RHF + zod validation and an optional env-gated Google button.

## What it does (for an AI reader)

- Responsibilities: collect email/password (+ name in register mode), validate via zod,
  call `signIn.email` / `signUp.email`, map server errors to localized alert copy,
  invalidate the shared `['me']` query on success.
- Public API / exports / props / endpoints: `AuthForm` (no props). Private `AuthFields`
  subcomponent remounted per mode via `key={mode}`.
- Inputs → Outputs: user keystrokes → better-auth calls → session cookie set by the API;
  UI states: idle form, submitting (button spinner), field errors (`role="alert"` per
  input), server error banner (`role="alert"`), success (session change → route redirects).
- Side effects (I/O, network, state): POST `/api/auth/sign-in/email` /
  `/api/auth/sign-up/email`; OAuth redirect via `signIn.social` (google);
  `queryClient.invalidateQueries(['me'])`.

## Dependencies

- Imports / depends on: `react-hook-form`, `@hookform/resolvers/zod`, `zod`,
  `react-i18next`, `@tanstack/react-query`, `shared/ui` (Button, Input),
  `../model/authClient`.
- Used by: `routes/login.tsx` via `modules/Auth` index.

## Diagram

```mermaid
flowchart LR
  U[user] --> F[AuthFields RHF+zod]
  F -->|valid login| SI[signIn.email]
  F -->|valid register| SU[signUp.email]
  SI & SU -->|error| AL[role=alert localized banner]
  SI & SU -->|success| INV[invalidate 'me'] --> RT[login route redirects]
  G[Google button VITE_GOOGLE_AUTH=1] --> SO[signIn.social]
```

## Key decisions / gotchas

- zod messages are i18n KEYS (`auth.errors.*`) translated at render — copy switches
  locale live without re-validating.
- Mode switch remounts the fields (`key={mode}`) instead of swapping the resolver on a
  live form — stale-resolver/stale-error bugs are impossible by construction.
- `noValidate` on the form: native `type=email` bubbles must not preempt zod messages.
- Server errors map through `serverErrorKeyFor` (INVALID_EMAIL_OR_PASSWORD,
  USER_ALREADY_EXISTS); raw server text is never rendered (design.md §8).
- login schema carries a no-op `name: z.string()` so both schemas infer one
  `AuthFormValues` type.

## Commits

- 1ecb2f7 2026-07-06 feat(web): api client + auth module (email/password, optional google)
