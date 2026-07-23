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
  steel fields, zod validation, actionable localized server-error mapping (by
  better-auth code + HTTP status: wrong credentials, password-too-short, and a
  sign-up email conflict that offers an inline switch-to-login shortcut),
  and a Google OAuth button gated at RUNTIME by `useAuthConfig()` (GET
  `/api/auth/config` → `googleEnabled`) — shown only when the server actually has
  Google wired, so button and backend never drift (ADR google-oauth); the submit
  pill is red for log-in and green for sign-up (reference taxonomy).
- **Create (`/create`, guarded)** — the generator as a "commission sheet"
  (numbered hairline field groups: type → steel model tiles with provider labels,
  prices and an amber selection ring → prompt → aspect/duration → optional i2v
  upload; glow-green mono cost numeral beside the green Generate pill),
  next to a live gallery column: a submit prepends its card instantly;
  processing video cards poll `GET /api/generations/:id` every 4s until terminal,
  bounded by a 20-minute budget since `createdAt` — past it the card shows an
  amber "taking longer than usual" note with a one-shot Refresh pill, and a
  status poll that fails before delivering data shows an error state with retry
  (never a frozen "Generating N%"). The composer's prompt carries an AI
  **enhance** sparkle (`POST /api/prompt/enhance`): one click rewrites a rough
  draft into a detailed cinematic prompt in place, with one-click Undo, a calm
  "unavailable" notice when the key-gated feature is off, and an occasional
  once-per-session nudge — the same affordance rides the Cinema shot prompt.
  For image-capable models the composer takes a reference image three ways —
  the paperclip (click), a **drag-drop** onto the capsule, and a screenshot
  **paste** (Cmd/Ctrl+V) — all through the one shared `readImageFile` gate.
- **Library (`/library`, guarded)** — infinite gallery of figure cards
  (SQUARE abyss media tiles + mono prompt captions; 24/page, "Load more"),
  client-side type filter chips, per-card portal download + glow-red icon delete
  behind a blocking confirmation alertdialog (danger pill confirms, ghost pill
  cancels; only then optimistic with rollback), succeeded cards show a green "ready" chip, failed
  cards show the reason + "credits refunded" chip; status triad
  processing=amber / succeeded=green / failed=red.
- **CinemaStudio (`/cinema`, `/cinema/$filmId`, guarded)** — compose films on top
  of the generation lifecycle. The library lists film cards (canvas-shaped abyss
  plates, `Link` into the editor) with a green "New film" modal (title + aspect
  `PillGroup` + default-style `Select`). The editor (v7) is a real
  NLE WORKBENCH: one viewport-height column, no page scroll — the STAGE
  (header · transient render status strip · `PreviewPlayer`) scrolls inside
  itself, with the TRACKS panel pinned beneath; the composer is a
  position:fixed DOCK on the viewport's bottom edge — out of flow, chat
  posture, so its growth (drawers, prompt resize) overlays the workbench
  instead of squeezing it (auto-growing prompt with a TOP-edge resize grip,
  label-less model chip opening the big `ModelPickerModal` — a card gallery,
  three to a row, each card led by a muted looping demo clip of that model's
  own output from `/model-demos/<id>.mp4` (branded plate fallback when a model
  has no demo yet), stepped duration
  slider, generation-audio speaker toggle, icon-toggled drawers: cast · spoken
  line · expand; the FIRST shot is selected by default, so the composer is on
  screen the moment the editor opens — a tile click still moves the
  selection). The TRACKS panel wears no chrome row (no title, no size select —
  height via the drag/keyboard separator; the "+" trigger is a dashed
  icon+label tile riding the video lane after the last shot):
  a second-ruler that doubles as a SCRUB SLIDER, the VIDEO lane (shot tiles as
  wide as their duration, one `PX_PER_SEC` scale, live clip status from the shared
  `['generation', id]` cache, hover move/delete) and the AUDIO lane directly
  beneath (music beds as bars, voiceovers as chips at their exact startMs, hover
  delete). NLE Phase 1 (v8) added the PLAYHEAD SPINE: a singleton `useTimelineClock`
  (`playheadMs`/`isPlaying`) is the one source of truth for position — the ruler
  click/drag/arrows seek it, a thin portal playhead cursor rides the lanes at it, a
  shot-tile click seeks to that shot's start as well as selecting it, and the
  `PreviewPlayer` is now PLAYHEAD-DRIVEN (it shows the clip the playhead sits on,
  seeks `video.currentTime` frame-accurately, and plays via a leak-free rAF loop),
  fixing the two live bugs — clicking a tile now moves the preview, and scrubbing
  works at all. The clip math lives in the pure `timelineGeometry`
  (`clipAtMs`/`totalDurationMs`, unit-tested). NLE Phase 2 adds the 10-minute-film
  ergonomics: the scale is a store-owned `zoom` (px/sec) with a zoom-in/out/
  fit-to-window toolbar, the ruler shows m:ss timecodes at a zoom-chosen interval,
  the tile strip scrolls horizontally and AUTO-FOLLOWS the playhead during play,
  and the playing clip is now AUDIBLE (its own soundtrack — `video.muted =
  !isPlaying`, silent on pause/scrub). Fit-to-window measures the strip and the
  store computes the scale; the ruler/scroll math is pure in `timelineGeometry`
  (`rulerTicks`, `formatTimecode`, `followScroll`). NLE Phase 3 adds ON-TIMELINE
  EDITING through EXISTING endpoints: hover-revealed TRIM edges drag a shot's in/out
  points (→ shot PATCH `{trimStartMs, durationMs}`, honored by the render's ffmpeg
  trim) and a REORDER grip drags a tile to a new slot (→ the reorder POST), with a
  green drop indicator and SNAP to clip boundaries + the playhead; the drag session
  lives in the `useShotDrag` hook and every decision is pure in `timelineGeometry`.
  NLE Phase 4 completes the editing polish: a SPLIT-at-playhead scissors (in the
  timeline toolbar, enabled only when the playhead is strictly inside the selected
  shot → `useSplitShot` POST `/shots/:id/split {atMs}`) and editor-scoped KEYBOARD
  shortcuts (`useTimelineKeys`: Space play/pause · ←→ frame-step · Shift+←→
  shot-boundary jump · Home/End · S split), suppressed while typing in the composer.
  Audio-lane waveforms (heavy audio-decode) are the last deferred piece. Full
  film-audio-track mixing on the playhead is a documented Phase-2b seam. The editor
  has its OWN top bar (`CinemaEditorHeader`, 2026-07-23) that REPLACES the global
  AppShell on this route: openCreate·/back-to-films escape hatches, the title as an
  inline-editable h1, an aspect switch, a GREEN «Собрать mp4» export button (out of
  the old ⋯ menu — disabled, not hidden, while a render runs), a ⋯ overflow for the
  rare settings/delete, and the balance·lang·account chrome injected by the route.
  `RenderBar` stays a transient status strip (progress → green Download
  `/media/<id>.mp4` → calm retry, never raw ffmpeg text). CLIENT-SIDE EXPORT
  (ADR `client-side-export`, 2026-07-23) — the final assembly is moving INTO the
  browser (streaming WebCodecs, server ffmpeg retired from the path but kept
  dormant). The ENGINE is built + tested at the model layer: pure `exportPlan`
  (per-frame timeline mirroring render.ts — trim, crossfade overlap, fade alpha) +
  `audioMixPlan` (native + film tracks), an `exportCapabilities` gate (WebCodecs +
  File System Access), a port-injected `runFilmExport` orchestrator (progress +
  cancel-teardown), the `useFilmExport` state-machine hook, and the browser adapter
  (`filmExporter` via mediabunny + `filmFrameDrawer` seeked-video composite +
  `filmExportAudio` OfflineAudioContext mix, streamed to disk via File System Access
  with a blob fallback — in-browser-verified). WIRED (2026-07-23): the header's
  «Собрать mp4» runs the client pipeline via `useExportController` (replacing
  `useCreateRender`) — progress + a cancel, 4 states, a capability gate (calm
  message where unsupported). The valuable validation moved client-side —
  `computeExportBlock` refuses a not-ready film (a clip generating/failed, no shots)
  with the SAME named reasons the server gave, from the generation cache. The
  mediabunny/WebCodecs adapter is a LAZY chunk (`filmExporter`/`filmFrameDrawer`),
  off the main bundle. Dropped as server-only: reload-recovery, the 409 concurrency
  guard, `latestRender` polling — `render.ts` + the routes stay dormant. Remaining:
  an in-browser smoke test of the 3 adapter files (vitest can't run WebCodecs).
  The «+» dialog adds shot / title card /
  storyboard / music / voiceover (audio rows switch to a mini-form —
  one charged action generates the clip AND files the track; the «Звук» card is
  retired). The cast drawer holds TWO reference affordances sharing the budget of
  5: `ShotCastField` TAGS a known character, and below it `ShotReferenceImages`
  attaches ANY picture — click / drag-drop / paste (Cmd/Ctrl+V), each through the
  shared `readImageFile` gate → `useAddShotReference` → a `well` thumbnail grid
  (removable by id). It never blocks attaching on a model without `referenceMode`;
  it just shows honest "switch to Wan 2.7" copy. Shot generation composes a
  **structured** `promptPreset`, POSTs `/api/generations`, links the clip, then
  polls (stored references are re-sent by the server every generate).
  The module has NO cross-module imports: the catalog is read at the route (the
  seam) and decoupling from Gallery/Generator is through the shared query cache.
- **AI Soul Studio (`/soul`, `/soul/$entityId`, guarded)** — build a CHARACTER from a
  constructor instead of a text box, then mint photos of them. `/soul` is a 3-ZONE
  STUDIO (recomposed 2026-07-21, owner-approved): a viewport-height workbench mirroring
  an "AI Influencer Studio". A LEFT RAIL ("+ new character" reset + your characters as
  compact rows), a CENTER STAGE (the live draft — a "build your character" placeholder
  while untouched, else the picked axis/trait chips + the composed "what the model will
  see" prompt; no portrait, because a face is minted later on the card), a RIGHT BUILDER
  (the shared `SoulAxes` — archetype + style pills, eight optional axes as `Select`s, the
  trait chips capped at `MAX_TRAITS` = 6 that visibly DISABLE the 7th, a notes escape
  hatch — all FROM the contract tables, never a hardcoded list; plus a "start from a
  preset" modal reusing the prompt library, each entry a `Soul` literal so "open" is free
  structure not a string), and a fixed BOTTOM COMPOSER DOCK (the name field, a shuffle
  dice that randomizes the whole look via a pure `randomizeDraft`, and the ONE green
  "Create character" pill). It still OWNS the one draft the stage, the builder and the
  composer all read. Creating a character is FREE. Below `lg` the zones stack (rail →
  builder → stage). `/soul/$entityId` is the soul card: the four-view reference sheet,
  the readable list of characteristics (picked LABELS, not the prompt), the priced mint
  actions — "First portrait · 2 cr" with no photo, "Complete the sheet · 24 cr" once one
  exists (the later views self-reference the first on `flux-kontext-pro`, which is the
  only way four views stay the same person) — and "Оживить", a plain
  `POST /api/generations` with the portrait as `inputImage` (35–140 cr). Every paid
  action prints its price BEFORE the click and passes through an alertdialog that
  repeats it; a per-view failure shows a localized reason plus the "credits refunded"
  chip. No cross-module imports: the catalog (and therefore the prices) is read at the
  route — the seam — and the entity/generation caches are shared with Gallery/Entities.
- **Modular 3D Assets (`/assets`, `/assets/$assetId`, guarded)** — one concept image
  becomes named parts, each part becomes its own mesh, and the parts assemble into one
  exportable GLB. ADR: `docs/wiki/decisions/modular-3d-assets.md`. `/assets` is the
  library (4 states; square concept plates on `well` cards linking into the wizard; a
  green "New asset" modal whose picked file is read to a base64 data URI client-side —
  svg refused before it is decoded, since the API takes data URIs only and an svg is a
  script container). `/assets/$assetId` is the wizard, and it is **stage-shaped, not
  page-shaped**: ONE route, five acts (Concept → Parts → Extraction → Meshes →
  Assembly), and the asset's own part statuses decide which act is on screen
  (`deriveStage`). There is no `/assets/:id/mesh` URL on purpose — a stage is how far
  the work has got, not a place, and such a URL would render empty on reload and read
  as a bug. The rail offers the detours instead: any stage the asset has already
  reached is walkable-back (`stageOverride` in the module's Zustand UI store), stages
  ahead are visibly disabled. The three.js graph lives ONLY behind
  `React.lazy(() => import('./AssemblyStage'))`, which is what keeps it out of the main
  chunk. Prices come from the catalog read AT THE ROUTE (the seam) — an empty catalog
  is a first-class DISABLED state, never an error: `PriceTag` pulses and paid buttons
  stay off rather than quote a number nothing backs. Creating an asset is FREE.
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
  (loading skeletons / empty / error+retry / data) on every data surface. Plus a
  TOAST system (`shared/ui` Zustand store + `<Toaster>` portal, mounted once in
  `__root.tsx`) — the NON-blocking notification surface: per-item aria-live roles
  (error=alert, info/success=status), auto-dismiss that pauses on hover/focus, an
  async action button, a 3-deep cap, per-key dedupe. Cinema uses it to surface a
  shot's POLLED clip failure: one toast per generation, `content_blocked` carries
  a "смягчить и повторить" action (soften prompt via `/api/prompt/enhance` →
  regenerate, degrading to manual-edit if absent); the submit mutation retries
  transient codes 1–2× but never the actionable/terminal ones.
- **Surfaces (v4)** — every panel declares its depth through the shared `Card`
  primitive instead of a hand-rolled `rounded-lg border border-white/10` string:
  `glass` (frosted chrome that floats over content — the generator sheet), `well`
  (recessed plates media sits INSIDE — gallery tiles, entity covers, the detail
  modal's media box), `steel` (opaque, for text that must stay legible over a busy
  backdrop). Media thumbnails are wells, never glass: the media is the hero, and
  frost over a photo is chrome competing with content. Popup panels stay opaque —
  a translucent menu over moving media is unreadable. Still no gradients anywhere.

## Module map (modular architecture — public API via index.ts, no cross-module imports)

```
src/
├── main.tsx  routeTree.gen.ts  test-setup.ts  @types/
├── routes/                     # composition-only file routes
│   ├── __root.tsx              # providers, crash boundary, offline overlay, 404
│   ├── index.tsx  login.tsx    # standalone (no shell)
│   ├── cinema.$filmId.tsx      # standalone (no shell) — the editor has its OWN top bar
│   └── _shell.tsx + _shell.{create,library,cinema.index,entities,
│                              soul.index,soul.$entityId,assets.index,assets.$assetId,
│                              pricing}.tsx
├── modules/
│   ├── Auth/                   # authClient, useAuthSession/useMe, AuthForm, requireSession
│   ├── Generator/              # generatorStore (draft), catalog query, create mutation,
│   │                           # commission-sheet panel (SheetField/PromptField/SubmitErrorBanner)
│   ├── Gallery/                # generations list/poll/delete hooks, cards, grid, detail
│   ├── Cinema/                 # films/shots/audio/renders/storyboard hooks, timeline,
│   │                           # shot inspector (preset pickers), preview player, render bar
│   │                           # (public: CinemaLibrary, FilmEditor; catalog fed from route)
│   ├── Soul/                   # AI Soul Studio: soulApi (entity + portraits + animate
│   │                           # hooks), portraitSheet (the PRICE math — pure, tested),
│   │                           # soulPresentation (composed prompt + readable facts),
│   │                           # soulOptions/soulDraft (pickers from the contract tables,
│   │                           # the MAX_TRAITS cap, isDraftReady/Pristine), randomizeDraft
│   │                           # (pure shuffle); the 3-zone studio (SoulRail via
│   │                           # SoulCharacters · SoulStage · SoulBuilder+SoulAxes ·
│   │                           # SoulComposer dock), edit-modal constructor, prompt
│   │                           # library, reference sheet, "Оживить"
│   │                           # (public: SoulStudio, SoulCard; catalog fed from route)
│   ├── Assets3D/               # Modular 3D Assets: asset3dApi (aggregate + part CRUD,
│   │                           # analyze/extract/mesh), partGeneration (id-keyed live
│   │                           # poll over the shared ['generation', id] cache),
│   │                           # assetPricing + wizardStage (PURE, tested), wizardStore
│   │                           # (UI-only Zustand), library + the stage-shaped wizard;
│   │                           # stages: PartsStage (FREE analyze + manual checklist,
│   │                           # MAX_PARTS cap), ExtractStage (paid grid — single part
│   │                           # click-to-spend, extract-ALL behind SpendConfirmModal),
│   │                           # MeshStage (paid grid — per-part tier Select, EVERY mesh
│   │                           # behind SpendConfirmModal per owner decision 2026-07-20),
│   │                           # PartGenerationCard (shared plate, polls the CITED id)
│   │                           # (public: AssetLibrary, AssetWizard; catalog fed from route)
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
                                # Toaster + toast (toastStore) — non-blocking notifications,
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

## Templates (`/templates`)

The gallery of ready-made viral formats. ADR: `docs/wiki/decisions/template-catalog.md`.

- `TemplateCatalog` (4-states) → `TemplateCard` → `TemplateDetailModal` (knobs + `TierPicker`).
- Creating a film from a template is **free**; the tier is a model *pin*, not a purchase. The modal
  says so under the button, and `TierPicker` disables a tier the user cannot afford **before** the
  click rather than letting them build a film they can't generate.
- Cards are **typographic, not fake-media**: `previewUrl` is null until we render a real example, and
  `BeatStrip` draws the film's actual shape (free title cards read as hollow blocks).
- The module **imports nothing from Cinema**. It creates a film via the API and navigates to
  `/cinema/$filmId`; the film-editor route reads `useTemplates()` and hands the list down, the same
  seam `useCatalog()` already uses.

## Design references

- Design system: `docs/frontend/design.md`
- Spec: `docs/superpowers/specs/2026-07-06-opencreate-mvp-design.md`
- ADR: `docs/wiki/decisions/opencreate-mvp-architecture.md`
- Implementation note: `docs/wiki/architecture/opencreate-implementation.md`
