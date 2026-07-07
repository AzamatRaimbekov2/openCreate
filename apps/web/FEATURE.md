# @opencreate/web — Feature doc

React 19 + Vite 8 SPA of the openCreate MVP: create AI images and videos, watch async
video progress live, browse a per-account library, and read an honest EN/RU landing
with verified price comparisons. TanStack Router (file-based) + Query v5, Zustand,
Tailwind v4 ("Bioluminescent Terminal" design system v3 — cosmic-void surface ladder,
specimen pill triad, JetBrains Mono + DM Sans via @fontsource, NO gradients),
react-hook-form + zod, i18next.

## What it does

- **Landing (`/`)** — terminal page on the flat void: a FULL-VIEWPORT hero with the
  animated ASCII-sphere canvas behind the centered mono wordmark, whisper-weight
  headline (one portal-blue accent word) + the three approved claims (images from
  $0.01, 5s videos from $0.35, credits never expire) and two specimen-pill CTAs
  (green create + amber pricing); then the ~800px research column — "Selected
  works" specimen grid (8 duotone SVG plates, one video-marked, one honest
  "sample style" caption naming the real models), "The index" price comparison
  table ("verified July 2026", ours in glow-green, portal footnote), plain mono
  how-it-works prose rows, FAQ prose, minimal footer. Floating transparent
  masthead with LangSwitch and a session-aware CTA (`/create` signed in,
  `/login` otherwise). EN/RU.
- **Auth (`/login`)** — one centered steel card on the void under the mono
  wordmark home link: email+password sign-in/register form (better-auth client),
  steel fields, zod validation, localized server-error mapping, optional Google
  button; the submit pill is red for log-in and green for sign-up (reference
  taxonomy).
- **Create (`/create`, guarded)** — the generator as a "commission sheet"
  (numbered hairline field groups: type → steel model tiles with provider labels,
  prices and an amber selection ring → prompt → aspect/duration → optional i2v
  upload; glow-green mono cost numeral beside the green Generate pill),
  next to a live gallery column: a submit prepends its card instantly;
  processing video cards poll `GET /api/generations/:id` every 4s until terminal,
  bounded by a 20-minute budget since `createdAt` — past it the card shows an
  amber "taking longer than usual" note with a one-shot Refresh pill, and a
  status poll that fails before delivering data shows an error state with retry
  (never a frozen "Generating N%").
- **Library (`/library`, guarded)** — infinite gallery of figure cards
  (SQUARE abyss media tiles + mono prompt captions; 24/page, "Load more"),
  client-side type filter chips, per-card portal download + glow-red icon delete
  behind a blocking confirmation alertdialog (danger pill confirms, ghost pill
  cancels; only then optimistic with rollback), succeeded cards show a green "ready" chip, failed
  cards show the reason + "credits refunded" chip; status triad
  processing=amber / succeeded=green / failed=red.
- **Pricing (`/pricing`, public)** — the same "index" treatment: comparison table +
  full per-model credit table from the catalog query, a "200 free credits" amber
  chip by the title, and the visitor signup CTA as a steel card with a green pill.
  Both wide tables sit in `TableScrollRegion` — a keyboard-focusable overflow
  region with a dynamic mono "scroll →" hint (`common.scrollHint`, EN/RU) plus
  a solid right-edge overlay strip that retires at the far right, both shown
  only while columns overflow (the no-gradient scroll affordances).
- **App shell** — sticky steel bar: mono wordmark with the portal dot, lowercase
  mono nav (Create/Library/Pricing), amber specimen-pill balance chip (opens the
  credit history ledger modal on the steel sheet with triad-signed amounts),
  LangSwitch, red-pill Sign in / sign-out (clears personal caches).
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
│   ├── Auth/                   # authClient, useAuthSession/useMe, AuthForm, requireSession
│   ├── Generator/              # generatorStore (draft), catalog query, create mutation,
│   │                           # commission-sheet panel (SheetField/PromptField/SubmitErrorBanner)
│   ├── Gallery/                # generations list/poll/delete hooks, cards, grid, detail
│   ├── Credits/                # balance chip + transactions modal (['me'] shared cache key)
│   └── Landing/                # hero, showcase spread, section heading, price tables
│                               # (+ TableScrollRegion overflow wrapper), how-it-works,
│                               # FAQ, pricingData
└── shared/
    ├── config/                 # theme.css (v3 terminal tokens + font tokens), i18n (EN/RU), queryClient
    ├── libs/apiClient.ts       # fetch wrapper → ApiClientError with envelope codes
    └── ui/                     # Button, Input, Modal, Skeleton, Badge, Progress,
                                # PillGroup, EmptyState, ErrorState, AppShell, LangSwitch,
                                # AppErrorBoundary, OfflineOverlay, NotFoundPage,
                                # AsciiSphere (hero canvas), SpecimenTile (+ specimenTileArt
                                # — 8 duotone specimen plates)
```

Modules talk through the TanStack Query cache (`['me']`, `['generations']`,
`['catalog']`), never through imports. Design tokens & rules: `docs/frontend/design.md`.
Every `.ts/.tsx` has a `.md` sidecar doc with responsibilities, diagrams and commit refs.

## Hardening (QA rounds + final gate)

- **Blocking `Modal`** has a real focus trap (Tab/Shift+Tab cycle inside, focus restored
  to the trigger on close) plus a latent-bug fix found while adding it: `onClose` in the
  mount effect's deps re-ran the effect on parent re-renders and let focus escape to the
  trigger while the dialog stayed open.
- **No one-click delete**: the library's glow-red delete icon opens a blocking
  `role="alertdialog"` confirmation; only the danger pill starts the optimistic mutation
  (with rollback on failure).
- **`SubmitErrorBanner`** maps every contracts `apiErrorCode` to localized EN/RU copy via
  a closed Record (unknown/future codes → generic fallback); raw server text appears only
  as a secondary line and is fully suppressed for `content_blocked` (moderation strings
  are never user copy — recorded review decision).
- **Bounded polling**: processing cards poll every 4s within the 20-minute
  `GENERATION_STALL_MS` budget from `createdAt`; past it the amber "taking longer than
  usual" note with a manual Refresh pill replaces automatic polling, and a first-poll
  failure shows an error state with retry — never a frozen "Generating N%".
- **Wide tables** get overflow-measured scroll affordances (`TableScrollRegion`: mono
  "scroll →" hint + solid right-edge strip that retires at the far right — no gradients).
- **Final gate (2026-07-07)**: `lint` + `tsc --noEmit` + 135/135 vitest + production
  `build` (landing prerender guard injected `/` into `dist/index.html`) + Playwright e2e
  2/2 — all green. One e2e-only fix was needed: `e2e/mocks.ts` used a fixed pre-hardening
  `createdAt`, which put the mocked generation past the polling budget so the SPA
  (correctly) rendered the stalled card instead of the succeeded `<video>`; the mock now
  stamps `createdAt` fresh at POST time.

## Run / test

```bash
pnpm --filter @opencreate/web dev        # vite, http://localhost:5173 (proxies /api,/media → :8787)
pnpm --filter @opencreate/web test       # vitest + RTL — 135 tests (jsdom)
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
