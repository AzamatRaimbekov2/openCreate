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
  once-per-session nudge — the same affordance rides the Cinema shot prompt and
  every Canvas node prompt (owner requirement 2026-07-30).
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
│   ├── canvas.$canvasId.tsx    # standalone (no shell) — the board owns the viewport
│   └── _shell.tsx + _shell.{create,library,cinema.index,canvas.index,entities,
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
│   ├── Canvas/                 # Canvas Mode: the node-graph board on @xyflow/react.
│   │                           # model/: edgeRules (PURE connection law, checked at
│   │                           # drag AND at write), canvasStore (the document —
│   │                           # singleton + init/reset per route param), useCanvasDoc
│   │                           # (the debounced full-document autosave), api (typed
│   │                           # /api/canvases + uploads), useNodeGeneration
│   │                           # (buildRunInput → POST /api/generations, then the
│   │                           # shared ['generation', id] poll), useRunBranch
│   │                           # (pure toposort + itemized price, then the
│   │                           # sequential submit/poll queue); components/:
│   │                           # CanvasEditor (React Flow shell — RF objects DERIVED
│   │                           # from the store, changes written back), NodePalette,
│   │                           # NodeShell + ImageNode/VideoNode/UploadNode/
│   │                           # EntityNode (character, output-only, never runs)/NoteNode,
│   │                           # VersionStrip, RunBranchDialog, CanvasLibrary
│   │                           # (public: CanvasEditor, CanvasLibrary; catalog AND
│   │                           # character library fed from the route, both memoized)
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
- **Shelves** are `template.category`, grouped in the server's first-seen order and headed by
  `t(`templates.category.${category}`)` — so a new shelf on the server needs the matching key in
  **both** `ru.json` and `en.json` or its heading renders as the raw key. Four shelves now:
  Форматы · **Брик-мульты** · Анимация · Брейнрот.
- **Брик-мульты** (owner request 2026-07-30) is the largest shelf and sits second: eight stop-motion
  brickfilm stories (ограбление, космос, гонка, замок, стройка, нуар, пираты, быт), 5–6 paid 8s
  clips plus 1–2 free title cards each, 280–840 credits depending on tier. Unlike the other shelves
  these are complete arcs — picked to be *watched*, where a format template is picked to be
  rewritten and a brainrot template to be posted. Three of the eight are 16:9 (space, race,
  pirates), so this is the first shelf where `BeatStrip` and the card render a landscape shape.

## Compare (`/compare`, hidden utility)

Side-by-side model evaluation: one prompt → three image models in parallel. ADR-less
utility (spec: `docs/superpowers/specs/2026-07-29-compare-generators-design.md`).

- **Hidden on purpose** — no nav link, direct URL only; an operator tool, not a product feature.
- Contenders: **FLUX dev** and **Nano Banana Pro** ride the production `POST /api/generations`
  pipeline (credits, Runware, refund-on-failure); **Qwen Image Max** goes direct via
  `POST /api/compare/generate` (synchronous DeepInfra proxy, bypasses the credit ledger, USD cost
  from the provider's own `inference_status.cost`).
- `modules/Compare`: zustand store (parallel fan-out, per-panel independent settle/retry,
  AbortSignal race guard), `CompareForm` + `GenerationPanel` (4 UI states each), panels are
  channel-blind (`costLabel` arrives pre-formatted: "2 cr" vs "$0.075").
- Leaving the page aborts in-flight renders (they spend money) without clearing settled results.

## Canvas (`/canvas`, `/canvas/$canvasId`)

The node-graph board: prompt → image → video, wired together instead of typed twice. ADR:
`docs/wiki/decisions/canvas-mode.md`. Ships ADR phases 1–3 (image/video/upload/character/note
nodes, wires, autosave, per-node runs and "run branch"); the operation nodes (upscale /
remove-bg) follow.

- **A canvas CITES generations, exactly like a film.** `canvas`/`canvas_node`/`canvas_edge`
  own the document; a node keeps an append-only `generationIds` history with no FK, so
  deleting a generation from the Library leaves an empty version instead of eating the board.
  Running a node is an ordinary `POST /api/generations` — **zero new money code**.
- **The chain edge is `inputGenerationId`**, not bytes: the client cites its own succeeded
  image, the server resolves its own stored file. Image models receive it through the
  server-only `referenceImages` channel (so it **counts against** `referenceMode` /
  `maxReferenceImages`); video models receive it as the provider's seed frame. It is
  mutually exclusive with `inputImage` at the contract level.
- **`modules/Canvas` on `@xyflow/react`.** Nodes are ordinary DOM. The Zustand store is the
  editing truth (singleton + `init()`/`reset()` per route param — the `wizardStore`
  discipline); React Flow objects are **derived per render, never stored**.
- **Autosave, not a save button** (the first in this codebase): edits mark the document dirty,
  1.5 s of quiet triggers a full-document PATCH, unmount flushes. Failure is a quiet amber
  "not saved · retry" in the header — never a toast storm.
- **`edgeRules` is a pure function** checked twice: during the drag (an illegal wire refuses to
  snap) and on write. Two slots per node (media + character), video is terminal, cycles are
  refused. The graph therefore cannot hold an edge the rules would reject.
- **"Run branch" is client-orchestrated, and it asks first.** The client topo-sorts what the
  clicked node actually needs, itemizes the credits, and shows one confirm dialog; only then
  does it submit the runs one at a time, polling each to a terminal state before the next.
  Two rules carry the money: a node whose LATEST run succeeded ends the walk — it and
  everything behind it are skipped, because re-running a grandparent whose child is already
  done charges for an image nobody reads — and a mid-branch failure STOPS the queue, so
  downstream never starts. Leaving the board or cancelling stops it before the next charge;
  an already-submitted generation finishes server-side as usual. Auto-cascade stays rejected
  (ADR D5): one edit must never trigger N unconfirmed charges.
- **Every node prompt field carries the enhance sparkle** (owner requirement
  2026-07-30) — the shared `EnhanceButton`, wired to `config.prompt` in both
  directions, so the enhanced text is what autosave persists and what the run
  submits (local state would have shown one prompt and paid for another).
- **A character wire carries a Soul entity, not a picture.** The character node only names an
  `entityId`; the consumer node sends `entityRefs: [{ placeholder: 'e1', entityId }]` and puts
  `[[e1]]` in the prompt (prepended when the user did not place it themselves), so the server
  substitutes the character's name + description AND attaches her photo. Without the token the
  photo would condition the render while the name never reached the encoder — half a wire, at
  full price. Wired-but-uncast disables Generate; a model without `referenceMode` is dropped
  from the picker (the API refuses it with a free 400 anyway).
- The module **imports nothing from Generator, Cinema or Entities**: the model catalog and the
  character library are both read in `routes/canvas.$canvasId.tsx` and handed down as node data
  — the seam `/cinema/$filmId` already uses. Both arrays are **memoized there**, because their
  identity is part of the editor's per-node React Flow cache key (a fresh array per render
  resurrects a v12 focus-loss bug). Node polling shares the `['generation', id]` cache with
  every other poller.

## openCreator (`/creator`)

The agent chat: describe a task in one message, and the agent writes the scenario, creates the
character, assembles the canvas and — after ONE budget confirmation — runs the generations
itself. ADR: `docs/wiki/decisions/opencreator-agent.md`. Server side is a detached tool-use
loop; the SPA is a poller, and `modules/Creator` is the whole frontend.

- **The transcript IS the state.** Every step the agent takes is a persisted message with
  structured content (`text` / `step` / `plan` / `result`), so the screen re-renders the whole
  story from one GET, needs no local progress state, and a reload loses nothing (ADR D4).
  Array order is the server's (`created_at`, `rowid`) and is never re-sorted client-side.
- **The poll runs at 2s while the session is `running` OR `awaiting_confirm`.** The second case
  is the subtle one and it is deliberate: the budget gate can be left WITHOUT this tab acting
  (a second tab confirms, a new user message resets the `confirmed` flag server-side, the
  10-minute stale reaper fails the turn). A poll that stopped at the gate would leave a live
  «Подтвердить» button hanging over a plan the server has already retired.
- **The plan card is the only place money is spent, and it does not decide for itself.**
  `planStateFor(messages, index, status)` classifies each plan over the WHOLE transcript —
  `live` (the session is at the gate and this is the newest message), `answered` (something
  followed it), `stale` (the gate is gone and nothing followed). A card reasoning from its own
  content could confirm a budget a newer plan had already replaced. The frontend cannot tell
  «confirmed» from «superseded» (a plan message carries no outcome field), so in `answered` it
  claims neither and lets the messages below explain.
- **Mutations absorb, they never invalidate.** Every POST answers `202` with the transcript so
  far, so `absorbSessionDetail` writes it into `['creator-session', id]` and upserts the rail
  row from it — new sessions prepend, known ones update in place so the list does not reshuffle
  under the reader mid-turn. A `409` is an expected state race (the poll had not caught up when
  the click landed), so it becomes a deduped info toast plus a reconciling refetch, never an
  error screen.
- **A sanitized SERVER failure is translated, not shown.** A dead turn lands one of three fixed
  English sentences in the transcript; `model/agentCopy.ts` maps that closed set to localized
  copy (exact match only — a model quoting the phrase mid-answer is prose, not a failure) and
  renders it as a calm amber `role="status"` notice. Amber, not red: nothing the user did is
  wrong, the agent's provider is simply off.
- **The composer carries the enhance sparkle** (owner law) on a wrapper div inside its own
  `relative` field box, `pr-10` on the textarea. It keeps the user's words when a send fails
  (the draft clears only when the mutation RESOLVES) and, while closed, always names the next
  action — «агент работает…» vs «подтвердите бюджет выше» are different situations and a bare
  greyed box communicates neither. The draft is local state, not a store: nothing outside the
  component reads it.
- **The screen auto-opens the newest conversation**, which is what makes a reload land where the
  user was without a URL parameter; `Selection` is a three-case union (`auto | session | new`)
  so «New task» is not bounced straight back out by the auto-resolve. Known limitation: the
  selection is not deep-linkable — a `?session=` search param is the upgrade path.
- The module exports **exactly one** symbol (`CreatorWorkbench`) and imports no other module.

## Styles (`/styles`)

The Style Studio — a style is a user-built CONSTRUCTOR (a name plus two prompt
fragments) that resolves at generation time the way a model resolves against the
catalog. ADR `docs/wiki/decisions/style-studio.md`.

- **One registry, two sources.** `GET /api/styles` answers with the seven builtin
  styles (still code — `STYLE_PRESETS`) and the caller's own rows, unioned, in one
  shape; `builtin: true` is the only thing that distinguishes them, and it is the
  server's answer, never a client inference. `modules/Styles/model/api.ts` holds it
  under `['styles']`; every write ABSORBS its answer into that cache instead of
  refetching, and an unloaded cache is left alone rather than fabricated from a
  single write.
- **The page** (`StyleLibrary`) is two sections over that one list: MY STYLES leads
  (the reason to be here), BUILT-IN follows as a reference shelf whose fragments are
  readable on purpose — reading one is how you learn to write a better one. A builtin
  carries a badge and NO action menu at all: there is nothing a user may do to code
  that ships with the app, and the API refuses an update or delete on one with a 400.
  The empty state is scoped to "none of your own", because the list is never
  literally empty. Deleting is confirmed — the style vanishes from every picker in
  the app, and films/shots already citing it ask for a style again at their next run.
- **The constructor** (`StyleEditor`) is one modal for create and edit: name, the
  positive fragment with the MANDATORY sparkle (`EnhanceButton`), the negative, and
  an advisory `recommendedModelId` from the catalog — which arrives as a PROP from
  the route, because `modules/Styles` must not import `modules/Generator`.
- **Preview** is an ordinary paid generation (the registry itself never charges):
  `POST /api/generations` with `promptPreset.styleId` so the server resolves the
  style exactly as a real run does, poll `['generation', id]`, then CITE the
  succeeded run via `previewGenerationId`. Three rules: the run is owned by the
  LIBRARY (a poll owned by the modal would die on close and strand a charged
  generation); the button SAVES first (the server resolves the style out of the
  database, so previewing before the PATCH would render stale fragments); and the
  poll sets `refetchIntervalInBackground: true` (TanStack pauses interval refetches
  on a hidden tab and this app disables `refetchOnWindowFocus` globally).
  `STYLE_PREVIEW_PROMPT` is deliberately styleless so the only difference between two
  previews is the style's own fragment.
- **Every style picker reads the registry** (`styleOptions(styles, t)`): the Cinema
  shot inspector, the film's default style (create + edit) and the storyboard. The
  list is read at the ROUTE (`_shell.styles`, `_shell.cinema.index`,
  `cinema.$filmId`) and threaded down as props — Cinema must not import Styles.
  Soul stays on the BUILTIN table by decision: `soulPresentation` indexes
  `STYLE_PRESETS` by that value, so a user style would have no label to render.
- **An empty list means "not loaded", never "no styles"** — the registry always
  carries the builtins, so `styleRegistry()` falls back to the bundled table. The
  picker is therefore never empty and never disabled while the request is in flight;
  only the user's OWN styles are briefly absent. For the same window the composed
  prompt hint UNDER-reports (a user style's fragment is missing) rather than
  mis-reporting — the server composes it either way.
- A builtin is still spelled by i18n (`cinema.preset.style.<id>`) because the
  server sends its hardcoded Russian `label` as `name`; a user style renders its own
  name verbatim; an id with no SPA copy falls back to the server's name instead of
  painting a raw key.
- **The style is a PACKAGE, not either/or** (ADR amendment A1/A4): the constructor
  also carries up to `STYLE_MAX_REFERENCES` (3) reference images through
  `StyleReferenceImages` — click, drop and paste, all via the shared
  `readImageFile` gate, thumbs with a per-thumb remove, an `N / 3` counter, and the
  add tile GONE (not disabled) at the cap. Edit mode only: an image attaches to a
  style by id. Both writes answer with the whole updated `Style`, so the strip
  re-renders from the server's own row and nothing is merged client-side.
- **The reference copy is deliberately non-committal.** The server applies style
  images through the same channel as entity photos and shot references, WITH the
  model's gates: dropped silently on a model that takes no references, and trimmed
  FIRST when the budget is full (entity tags outrank a style — a style is ambient).
  So the UI says "applied where the model can use them" rather than promising they
  arrive; a test pins that wording. Fragments always apply; only pictures are
  conditional.

## Design references

- Design system: `docs/frontend/design.md`
- Spec: `docs/superpowers/specs/2026-07-06-opencreate-mvp-design.md`
- ADR: `docs/wiki/decisions/opencreate-mvp-architecture.md`
- Implementation note: `docs/wiki/architecture/opencreate-implementation.md`
