# login.tsx — AI component doc

> AI-facing sidecar for `login.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose

The `/login` file-based route in the v3 terminal treatment (stage 3): ONE centered
steel card (`#1d293d`, 8px radius, white/10 hairline) on the flat void with the mono
wordmark above it as the way home, plus the redirect of already-signed-in visitors
to `/create`. Replaces the earlier manifesto split (`AuthManifesto` was deleted with it).

## What it does (for an AI reader)

- Responsibilities: composition only (modular rule: no business logic in `routes/`) —
  session gate + layout.
- Public API / exports / props / endpoints: `Route` (TanStack `createFileRoute('/login')`).
- Inputs → Outputs: session state → pending/redirecting → card-shaped `Skeleton`
  inside the same `LoginFrame` (one silhouette across states); signed in →
  effect runs `navigate({ to: '/create', replace: true })`; signed out → `<AuthForm />`
  inside the steel card.
- Side effects (I/O, network, state): `useAuthSession` triggers better-auth's
  get-session fetch; replace-navigation on redirect.

## Dependencies

- Imports / depends on: `react` (useEffect, ReactNode), `@tanstack/react-router`
  (createFileRoute, Link, useNavigate), `modules/Auth` (AuthForm, useAuthSession),
  `shared/ui` (Skeleton).
- Used by: route tree (`routeTree.gen.ts`, auto-generated).

## Diagram

```mermaid
flowchart LR
  V[visit /login] --> FRAME[LoginFrame: wordmark link + centered steel card]
  FRAME --> S{session?}
  S -->|pending| SK[card-shaped Skeleton]
  S -->|signed in| NAV[effect: navigate to /create replace]
  S -->|signed out| AF[AuthForm in the card]
```

## Key decisions / gotchas

- Redirect uses TYPED `useNavigate()({ to: '/create', replace: true })` — the
  `/create` route exists since Task 16, so the temporary `router.history.replace`
  escape hatch (documented while the typed union lacked the route) was removed as promised.
- Post-login redirect also flows through here: AuthForm succeeds → session store
  updates → this component re-renders and the redirect effect fires.
- Skeleton during `isPending` prevents a form flash for already-authenticated users.
- Stage-3 restyle: the split (`grid lg:grid-cols-[5fr_7fr]` + `AuthManifesto`) was
  replaced by the brief-mandated CENTERED steel card on the void; `LoginFrame`
  keeps pending/form states on ONE silhouette. The wordmark link above the card
  preserves the manifesto's escape hatch back to `/` (same accessible name
  "openCreate", portal dot decorative). Elevation is the void→steel color step —
  no shadow, no gradient. The route stays composition-only — the form lives in
  `modules/Auth`.

## Commits

- 1ecb2f7 2026-07-06 feat(web): api client + auth module (email/password, optional google)
- 2b7dd54 2026-07-06 feat(web): generator module — prompt, model/aspect/duration, i2v upload, cost (typed /create redirect)
- cb228e3 2026-07-07 restyle(web): editorial app shell, auth, generator, gallery
- 252ab38 2026-07-07 restyle(web): terminal design system — cosmic void tokens, jetbrains mono, specimen pills + docs
