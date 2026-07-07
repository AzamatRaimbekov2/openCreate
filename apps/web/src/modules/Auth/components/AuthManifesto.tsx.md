# AuthManifesto.tsx — AI component doc

> AI-facing sidecar for `AuthManifesto.tsx`. Created 2026-07-07 (stage 3 editorial
> redesign). Keep this in sync with the code on every change.

## Purpose

The left panel of the `/login` split (v3 terminal: mono weight-400 quote on the
ABYSS surface step): brand quote, wordmark escape hatch to `/`, and the three
approved claims as white/10 hairline rows.

## What it does (for an AI reader)

- Responsibilities: render static, localized manifesto content; give the standalone
  login screen a way back to the landing (there is no AppShell on `/login`).
- Public API / exports / props / endpoints: `AuthManifesto` (no props).
- Inputs → Outputs: i18n strings only → presentational `<aside>`; no state, no effects.
- Side effects (I/O, network, state): none. Navigation only via the typed `<Link to="/">`.

## Dependencies

- Imports / depends on: `@tanstack/react-router` (Link), `react-i18next`.
- i18n keys: `auth.manifesto.quote`, `auth.manifesto.caption`, and REUSED
  `landing.kicker` + `landing.claims.*` — the approved claims wording has exactly one
  source of truth (spec copy rule; changing a claim updates both screens at once).
- Used by: `routes/login.tsx` via the `modules/Auth` index.

## Diagram

```mermaid
flowchart LR
  I18N[i18n auth.manifesto.* + landing.claims.*] --> M[AuthManifesto aside on abyss]
  M --> W[wordmark Link → /]
  M --> Q[mono weight-400 quote]
  M --> C[3 approved claims — hairline rows]
  R[routes/login.tsx split layout] -->|left column| M
```

## Key decisions / gotchas

- Claims reuse `landing.claims.*` deliberately — inventing login-only claim copy would
  create a second place where the four approved claims could drift.
- The portal-blue wordmark dot is `aria-hidden`, so the link's accessible name stays
  exactly "openCreate" (tests query it by that name).
- v3 intent: the panel sits on `bg-abyss` — the SUNKEN surface step — so the form
  column (on the plain void) and the manifesto read as two depths of one terminal;
  the quote obeys the 30px/weight-400 heading law (whisper-weight IS the gesture);
  kicker/caption dropped the uppercase treatment entirely (terminal voice).
- `lg:min-h-screen` + `lg:justify-between` pins wordmark/quote/claims into the tall
  column on desktop; on mobile the panel stacks above the form as a compact block.

## Commits

- cb228e3 2026-07-07 restyle(web): editorial app shell, auth, generator, gallery
- 252ab38 2026-07-07 restyle(web): terminal design system — cosmic void tokens, jetbrains mono, specimen pills + docs
