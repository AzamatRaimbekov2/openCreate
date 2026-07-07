# @opencreate/web — Feature doc

React 19 + Vite 8 SPA of the openCreate MVP: create AI images and videos, watch async
video progress live, browse a per-account library, and read an honest EN/RU landing
with verified price comparisons. TanStack Router (file-based) + Query v5, Zustand,
Tailwind v4 ("Light Editorial" design system v2 — cream/ink/vermillion tokens,
Fraunces + Space Grotesk variable fonts via @fontsource), react-hook-form + zod, i18next.

## What it does

- **Landing (`/`)** — editorial magazine page: giant Fraunces hero with one
  vermillion italic word + the three approved claims (images from $0.01, 5s videos
  from $0.35, credits never expire), "Selected works" poster spread (6 honest
  "sample style" figures, one video-marked), "The index" price comparison table
  ("verified July 2026"), numbered how-it-works rows, FAQ rows, colophon footer.
  Standalone hairline masthead with LangSwitch and a session-aware CTA (`/create`
  signed in, `/login` otherwise). EN/RU.
- **Auth (`/login`)** — editorial split: serif manifesto panel on sand (brand quote +
  the approved claims) beside the email+password sign-in/register form (better-auth
  client), zod validation, localized server-error mapping, optional Google button.
- **Create (`/create`, guarded)** — the generator as an editorial "commission sheet"
  (numbered hairline field groups: type → model cards with provider labels and
  prices → prompt → aspect/duration → optional i2v upload; serif cost numeral),
  next to a live gallery column: a submit prepends its card instantly;
  processing video cards poll `GET /api/generations/:id` every 4s until terminal.
- **Library (`/library`, guarded)** — infinite gallery of magazine-figure cards
  (dark media plates + serif-italic prompt captions; 24/page, "Load more"),
  client-side type filter chips, per-card download/delete (optimistic with rollback),
  failed cards show the reason + "credits refunded" stamp.
- **Pricing (`/pricing`, public)** — the same "index" treatment: comparison table +
  full per-model credit table from the catalog query, a "200 free credits" accent
  stamp by the title, and the visitor signup CTA as a sand block.
- **App shell** — hairline masthead: serif wordmark, uppercase grotesk nav
  (Create/Library/Pricing), stamp-style balance chip (opens the credit history
  ledger modal), LangSwitch, sign-out (clears personal query caches).
- **Error UX** — 404 page, crash boundary, offline blocking overlay, 4 UI states
  (loading skeletons / empty / error+retry / data) on every data surface.

## Module map (modular architecture — public API via index.ts, no cross-module imports)

```
src/
├── main.tsx  routeTree.gen.ts  test-setup.ts  @types/
├── routes/                     # composition-only file routes
│   ├── __root.tsx              # providers, crash boundary, offline overlay, 404
│   ├── index.tsx  login.tsx    # standalone (no shell)
│   └── _shell.tsx + _shell.{create,library,pricing}.tsx   # pathless layout
├── modules/
│   ├── Auth/                   # authClient, useAuthSession/useMe, AuthForm, AuthManifesto, requireSession
│   ├── Generator/              # generatorStore (draft), catalog query, create mutation,
│   │                           # commission-sheet panel (SheetField/PromptField/SubmitErrorBanner)
│   ├── Gallery/                # generations list/poll/delete hooks, cards, grid, detail
│   ├── Credits/                # balance chip + transactions modal (['me'] shared cache key)
│   └── Landing/                # hero, showcase spread, section heading, price tables,
│                               # how-it-works, FAQ, pricingData
└── shared/
    ├── config/                 # theme.css (v2 editorial tokens + font tokens), i18n (EN/RU), queryClient
    ├── libs/apiClient.ts       # fetch wrapper → ApiClientError with envelope codes
    └── ui/                     # Button, Input, Select, Modal, Skeleton, Badge, Progress,
                                # PillGroup, EmptyState, ErrorState, AppShell, LangSwitch,
                                # AppErrorBoundary, OfflineOverlay, NotFoundPage,
                                # ShowcasePoster (+ showcasePosterArt — 6 poster palettes)
```

Modules talk through the TanStack Query cache (`['me']`, `['generations']`,
`['catalog']`), never through imports. Design tokens & rules: `docs/frontend/design.md`.
Every `.ts/.tsx` has a `.md` sidecar doc with responsibilities, diagrams and commit refs.

## Run / test

```bash
pnpm --filter @opencreate/web dev        # vite, http://localhost:5173 (proxies /api,/media → :8787)
pnpm --filter @opencreate/web test       # vitest + RTL — 95 tests (jsdom)
pnpm --filter @opencreate/web e2e        # playwright — mocked-API happy path + RU landing
pnpm --filter @opencreate/web lint       # eslint src
pnpm --filter @opencreate/web typecheck  # tsc --noEmit
pnpm --filter @opencreate/web build      # tsc --noEmit && vite build → dist/
```

Unit tests mock `shared/libs/apiClient`; the e2e suite runs the real SPA against
`page.route`-scripted `/api` + `/media` (no backend process — see `e2e/mocks.ts`).

## Design references

- Design system: `docs/frontend/design.md`
- Spec: `docs/superpowers/specs/2026-07-06-opencreate-mvp-design.md`
- ADR: `docs/wiki/decisions/opencreate-mvp-architecture.md`
- Implementation note: `docs/wiki/architecture/opencreate-implementation.md`
