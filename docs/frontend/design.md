# openCreate — Design System v4 ("Bioluminescent Terminal, frosted")

> Canonical design source of truth for `apps/web`. Every screen, component, and token
> decision starts here. v3 created 2026-07-07 from the owner-chosen Midjourney-style
> reference (`docs/frontend/style-reference-v3.md` — its §Adaptations are binding),
> superseding v2 "Light Editorial". **v4 (2026-07-09)** keeps all of v3 except the
> depth model: cards and sheets became iOS-18-style frosted glass (§3.5) at the
> owner's request. The no-gradient law, the surface ladder, the mono typography and
> the specimen-pill triad are unchanged. Keep in sync with
> `apps/web/src/shared/config/theme.css` and `apps/web/src/shared/ui/`.

## 1. Intent & identity

openCreate is an honest, cheaper AI image/video generation product. The UI reads like
a **bioluminescent research terminal**: a near-black cosmic void, whisper-weight
JetBrains Mono everywhere, elevation by surface color steps, and a closed triad of
translucent specimen pills — never a dashboard template, never a light theme.

- Direction: **"Bioluminescent Terminal"** — flat `#06051d` void, mono typography at
  weight 400, steel-navy surfaces, portal-blue prose links, three glowing pill tints.
- Audience: creators comparing generation prices; EN + RU locales, desktop-first,
  fully responsive (390px must wrap cleanly).
- Voice: honest copy — short verbs, sentence case, no exclamation marks, no blame.
  All strings via i18next keys present in BOTH `en.json` and `ru.json`. The four
  approved claims ($0.01 images / $0.35 5s video / credits never expire / no
  subscription) keep their exact meaning everywhere.
- **NO GRADIENTS — hard owner rule.** No background gradients, no gradient shimmer,
  no gradient fills in art or chrome. Flat colors only, everywhere. Grep every diff
  for `gradient` before committing. **This rule survives v4 untouched.**
- Depth (**v4, 2026-07-09**): **frosted glass.** Cards and sheets are translucent,
  backdrop-blurred and lifted with `shadow-glass`. This SUPERSEDES the v3 rule
  ("depth = surface color steps, the only shadow is `shadow-pill`"), which the owner
  retired when asking for iOS-18-style glass cards. Surface color steps still order
  the ladder (§2); glass is how a card sits ON it. See §3.5.

## 2. Color tokens

Defined once in `apps/web/src/shared/config/theme.css` via Tailwind v4 `@theme`.
Use utility classes (`bg-void`, `text-mist`, `bg-specimen-green/20`, …) — never raw
hex in components (single exception: `specimenTileArt.tsx` art data, §5; the
`AsciiSphere` canvas resolves the mist token via `getComputedStyle` with the
token-mirroring fallback — canvas `fillStyle` cannot consume `var()`).

### Surface ladder (elevation = color step)

| Token | Value | Step | Use when | Avoid when |
|---|---|---|---|---|
| `--color-void` | `#06051d` | 0 — the page | html/body, standalone screens, prose background (body text sits ON the void, not in cards) | Never pure `#000`; never a gradient |
| `--color-abyss` | `#0f1c36` | −1 — recessed | Media wells (generated images/video plates), the login manifesto panel, sunken panels | General cards (that is steel) |
| `--color-steel` | `#1d293d` | +1 — working surface | Sticky nav bar, cards, inputs/textareas/selects, modal sheets, calm banner blocks | Whole-page fills |
| `--color-ridge` | `#314062` | +2 — elevated/hover | Hovered rows/triggers, menu panels, active LangSwitch segment, Progress track | Resting card fills |

### Text & prose accent

| Token | Value | Role |
|---|---|---|
| (white) | `#ffffff` | Headings, numerals, model names, active nav — presence color |
| `--color-mist` | `#cad5e2` | Body text |
| `--color-mist-dim` | `#90a1b9` | Secondary text, captions, labels, inactive nav |
| `--color-portal` | `#63b3ed` | Links, the wordmark "·", decorative ordinals — **the only chromatic accent in prose**; also the focus-ring color |

### Specimen pill triad (closed system — max three button tints)

Pills are ALWAYS translucent: `bg-specimen-*/20` (hover `/35`) + `border-white/10` +
bright matching text + `shadow-pill`. **No solid opaque fills.**

| Tint | Base (bg at /20) | Text | Icon/status glow | Semantics |
|---|---|---|---|---|
| Green | `--color-specimen-green` `#004f3b` | `--color-glow-green` `#00bc7d` | `#00bc7d` | Create/submit/positive: «Начать создавать», Generate, Sign up, go-home, empty-state CTAs |
| Amber | `--color-specimen-amber` `#733e0a` | `--color-lumen-amber` `#fefce8` | `--color-glow-amber` `#f0b100` | Explore/browse/secondary: ghost buttons, Pricing, model-picker & toggle selection, credits chip |
| Red | `--color-specimen-red` `#8b0836` | `--color-lumen-red` `#fff1f2` | `--color-glow-red` `#ff2056` | Auth-exit + destructive: Sign in/Log in (reference taxonomy), Delete; failure status |

### Status mapping (same closed triad)

| Status | Color |
|---|---|
| processing | amber — `text-glow-amber` percent, amber selection family |
| succeeded / positive amounts / refunds | green — `text-glow-green` |
| failed / negative amounts / validation errors | red — `text-glow-red` text, `border-glow-red` rules/wells |

Hairlines and washes are `white/N` opacity modifiers — `border-white/10` (the standard
hairline), `border-white/15`–`/25` (interactive borders), `bg-white/5` (chip wash).
Do not add gray tokens. Decorative glyphs (bolts, play marks, chevrons) are inline SVG
in `currentColor` or plain text characters — **never OS color emoji** (they paint
their own palette and break the closed triad).

### Contrast notes (against void `#06051d` / steel `#1d293d`)

- white ~19:1, mist ~14:1, mist-dim ~8:1 — all text sizes AA+.
- portal ~9:1 — safe at all sizes (links, captions).
- glow-green ~8:1, glow-amber ~11:1 — safe at caption size.
- glow-red ~5.5:1 — safe for small status text; prefer ≥12px.
- lumen-amber / lumen-red ≈ near-white — safe everywhere (pill text).

## 3. Typography

Two self-hosted static families (imported in `main.tsx` via @fontsource, declared as
`@theme` font tokens; only 400 + 500 weights ship — heavier files would be dead bytes):

| Token | Family | Role |
|---|---|---|
| `--font-mono` | **JetBrains Mono** (latin + cyrillic, 400/500), fallback ui-monospace | **THE typeface** — body default, headings, nav, buttons, links, numerals, captions |
| `--font-sans` | **DM Sans** (latin only, 400/500), fallback system-ui | Sparing secondary body prose only; RU in sans contexts falls back to system sans (no Cyrillic subset exists) |

### Type rules (binding)

- **Weight ceiling: 500.** Nothing renders `font-semibold` or bolder — verify with
  `grep -r 'font-(semibold|bold)'`. Headings are `font-normal` (400): whisper-weight
  display is the signature.
- **Headings: 30px, weight 400, no uppercase transform.** `text-3xl font-normal
  text-white` is the page/section heading; no `md:` size escalation — hierarchy comes
  from white-vs-mist color and spacing. Sub-headings may drop to `text-2xl`/`text-xl`
  at the same weight.
- Body 16px/1.5 `text-mist`; captions/labels `text-xs`/`text-sm` `text-mist-dim`,
  always lowercase (v2's uppercase-tracked micro-labels are retired).
- Large display (hero) stays weight 400: `clamp(1.875rem,5vw,3.75rem)` — mono runs
  wide, so the scale tops out lower than a serif would.
- Numerals (prices, credits, percents, ordinals) are mono weight 400; white for
  neutral, triad glow only when the number IS a status, portal for decorative
  sequence marks.
- `font-medium` (500) is reserved for interactive labels (buttons, links, nav
  wordmark, model names).

## 3.5 Glass surfaces (v4 — the depth model)

Authored ONCE in `apps/web/src/shared/ui/surfaces.ts` and normally consumed through
the `Card` primitive (`Modal`'s sheet reads the same constants). **Never hand-write a
frosted class string.** Before v4 the recipe had been copy-pasted into three
components and the third copy (the composer capsule) had already drifted — a fainter
fill, a `bg-ridge` baseline, a bespoke shadow. That drift is the whole argument for a
single source.

| Surface | Constant | Use when | Never |
|---|---|---|---|
| **glass** | `GLASS_SURFACE` | The default card, at rest. Panels and modal sheets. | Popup/menu panels; anything that must stay legible over moving media |
| **glass, floating** | `GLASS_FLOATING` | The same material with a longer shadow throw: chrome hovering OVER scrolling content (the composer capsule) | A resting panel — the lift would read as a bug |
| **steel** | `STEEL_SURFACE` | Opaque working surface: text dialogs, dropdown panels, inputs | As a generic card (that is glass now) |
| **well** | `WELL_SURFACE` | Recessed plate the content sits INSIDE: media wells, the shot rail | Anything that should look raised |

There are exactly **two elevations**, not a shadow per call site: Tailwind resolves
competing shadow utilities by stylesheet order, not by class order, so "`GLASS_SURFACE`
plus my own shadow" is not something a consumer can express. Need a new elevation? Add
a named one here. `Select`'s trigger keeps its own translucent fill — a trigger is a
control, not a surface, and its popup PANEL is deliberately opaque.

Three properties of the glass recipe are load-bearing, and each exists for a reason:

1. **`bg-steel` is the baseline, not a fallback afterthought.** Every frosted utility
   is layered behind `supports-[backdrop-filter]:`. A browser without
   `backdrop-filter` therefore renders an opaque steel card — a translucent card over
   unblurred content is unreadable, not stylish.
2. **`backdrop-blur` only does visible work where there is TEXTURE behind the card.**
   Blurring a uniform fill returns the same fill, so over the flat `--color-void` the
   blur is a mathematical no-op. Glass reads over media (previews, thumbnails, the
   gallery grid) and over the dimmed page under a modal; elsewhere the translucent
   wash, the hairline and `shadow-glass` carry the look. Do not "fix" this with a
   background gradient — see the no-gradient rule.
3. **The specular edge is a brighter TOP BORDER** (`border-t-white/25`), never a
   gradient sheen. This is how the iOS-glass highlight is reproduced under the
   no-gradient law.

Media is still the hero (owner's standing feedback): a frosted card wrapping a
photograph adds chrome and buries it. Media plates take `surface="well"` +
`padding="none"` and let the image be the brightest thing on screen.

## 4. Structure, spacing, radius, motion

- **Surface elevation table (§2) is the layout law**: prose on the void, cards and
  inputs on steel, hovers/menus on ridge, media on abyss. The sticky steel nav needs
  no border — the color step separates it.
- **Radii: three.** Pills = `rounded-full` (buttons, chips, toggles, LangSwitch);
  **cards/modals = `rounded-2xl` (16px, v4 — the glass silhouette)**; inputs/media
  = `rounded-lg` (8px). Square ends for rules/progress meters.
- **Spacing**: 4px scale. `gap-1` inside controls, `gap-4` between fields, `p-6`–`p-8`
  framed blocks; landing sections keep ≥96px vertical rhythm on desktop (`md:gap-28`).
  Landing/prose column stays narrow; app screens (create/library) use the wider grid.
- **Shadows (v4)**: `shadow-pill` on specimen pills; `shadow-glass` on glass cards and
  sheets (it ships inside `GLASS_SURFACE`). Popup/menu panels: still none — they are
  opaque steel by design. Never author a bespoke shadow.
- **Motion**: opacity/translate/color only, 150–250ms (`duration-200` default).
  Hover = one surface step up (`hover:bg-ridge`) or one tint step (`/20 → /35`).
  `animate-skeleton` (stepped background-color walk abyss→steel→ridge→steel,
  `steps(1,end)`) is the loading pulse — a stepped SOLID pulse, never a gradient
  shimmer. Media plates may lift ≤2px on hover, `motion-safe` only.

## 5. Showcase art direction (`SpecimenTile`) + hero visual (`AsciiSphere`)

Stage 2 (2026-07-07) REPLACED the v2 editorial posters (`ShowcasePoster` +
`showcasePosterArt` are deleted): the showcase is now eight blue-violet DUOTONE
SVG "specimens" — `eye / brain / hand / arch / moon / koi / cell / orbit`
(the reference symbolism family + three same-language lab plates) — drawn with
FLAT fills, hairline strokes and SVG `<pattern>` textures ONLY (dots, 45°
hatch, scanlines; no gradients, no filters, no text). Square tiles in a 4-col
grid (2-col mobile), 8px gap + radius, `border-white/10` fog border. Chrome is
minimal: NO per-tile captions — ONE small mono caption under the grid carries
the honest "sample style" chip (`landing.showcase.sampleLabel`) and names the
REAL catalog models (`landing.showcase.caption`); exactly one tile (the moon)
is video-marked. The duotone (`SPECIMEN_GROUND #161233`, `SPECIMEN_INK
#8fa3f2` in `specimenTileArt.tsx`) is the only sanctioned raw-hex art site.

The hero visual also landed: `AsciiSphere` — a dependency-free animated ASCII
ellipsoid canvas (2d context, no WebGL) in the mist token at low opacity,
~30fps frame-capped rAF with full cleanup, `prefers-reduced-motion` → one
static frame, aria-hidden, transparent background.

## 6. Component inventory (`apps/web/src/shared/ui/`)

Import from `'shared/ui'` only (public API via `index.ts`). Reuse these before creating
anything new; new shared components must be added to this table in the same task.

| Component | Variants / props | v3 treatment & states |
|---|---|---|
| `Button` | `variant: primary \| ghost \| danger`, `size: sm \| md \| lg`, `isLoading` | Specimen pills: primary = green tint, ghost = amber tint, danger = red tint — always `bg-specimen-*/20 border-white/10` + bright text + `shadow-pill`, hover `/35`. Focus = portal ring; disabled 50%; loading spinner + `aria-busy`. `sm` (32px, `text-xs`, v3.1 compact scale) is for dense pointer-first tool chrome (editor toolbars) only — `md` stays the floor for page CTAs |
| `Input` | `label`, `error`; native props incl. `ref` (RHF-ready) | Steel filled field: `bg-steel rounded-lg border-white/10`, mono caption label (`text-xs text-mist-dim`); focus = `border-portal`; error = `border-glow-red` + `role="alert"` glow-red message |
| `Skeleton` | `className` for shape | `animate-skeleton bg-steel rounded-lg` — stepped solid pulse through the surface ladder (no gradient shimmer) |
| `Card` **(v4)** | `surface: glass \| steel \| well`, `title?`, `action?`, `padding: none \| md \| lg`, `className` (layout only) | THE panel primitive — replaces every hand-rolled `rounded-lg border border-white/10 p-4`. `rounded-2xl`, surface from `surfaces.ts`. With `title` it renders the heading and becomes a `<section>` landmark named by it (`aria-labelledby`), so an editor screen is navigable by region. `padding="none"` for edge-to-edge media. `className` is for grid spans / sticky positioning — NEVER for surface styling |
| `Modal` | `isOpen`, `onClose`, `title`, `role: dialog \| alertdialog`, `size: md \| lg`, `surface: steel \| glass`, `hideHeader` | `rounded-2xl` sheet over `bg-void/70`; `steel` = opaque (text dialogs), `glass` = frosted (media detail, where the content is the hero). Both surfaces come from `surfaces.ts`. Mono 400 title, white/10 hairline close circle (hover → ridge); portal, Escape + overlay close, scroll lock, dependency-free focus TRAP (Tab/Shift+Tab wrap inside), focus restore to the trigger |
| `EmptyState` | `icon?`, `title`, `description?`, `action?` | White/10 hairline `rounded-lg` frame on the void, mono 400 30px white title |
| `ErrorState` | `message`, `onRetry?` | Calm hairline frame + amber ghost retry, `role="alert"` — never red-primary |
| `Badge` | `variant: neutral \| accent \| success \| danger` | Mono caption CHIP: `rounded-full border-white/10 bg-white/5 text-xs`, lowercase; text color = mist-dim / glow-amber / glow-green / glow-red |
| `Progress` | `value: 0–100`, `label?` | Flat `bg-glow-green` fill on the `bg-ridge` track, square ends, full ARIA |
| `PillGroup<T>` | `label`, `options`, `value`, `onChange` | Mono caption; selected = amber specimen tint, unselected = white/10 hairline → `hover:bg-ridge`; `aria-pressed` |
| `LangSwitch` | none | White/10 hairline pill group; active locale = `bg-ridge text-white` lit segment |
| `AppShell` | `user`, `isSessionPending?`, `onSignOut`, `balanceSlot?`, `children` | STICKY `bg-steel` bar, v3.1 COMPACT (44px: `py-1.5`, controls `min-h-8`, labels `text-xs`, wordmark `text-base` — chrome pixels go to the editor canvas); mono wordmark "openCreate·" (portal dot, aria-hidden); lowercase mono nav (active = white); Sign in = RED specimen pill; user menu = `bg-ridge` panel (menu items keep 40px hit area — overlay, not chrome) |
| `AsciiSphere` | `className?` | Decorative aria-hidden `<canvas>`: animated ASCII ellipsoid in mist at 0.34 alpha on transparent bg; ~30fps rAF cap, cleanup on unmount, reduced-motion → static frame; caller sizes it (`absolute inset-0`) |
| `SpecimenTile` | `kind: 8 specimens (§5)`, `className?` | Decorative duotone SVG specimen plate (flat fills + patterns, no gradients); consumer owns the grid cell, fog border and caption |
| `AppErrorBoundary` | wraps the app | Crash → mono 400 30px headline on the void, one line, green pill reload |
| `OfflineOverlay` | none (self-managed) | Full-screen `role="alertdialog"` on the void; mono 400 headline; auto-clears on reconnect |
| `NotFoundPage` | none | Portal "404" status line, mono 400 30px headline, one green pill home link |

Buttons: primary/green = the single main create/submit action per view; ghost/amber =
secondary/quiet/retry/explore; danger/red = destructive + auth-entry per the reference
taxonomy. Size `lg` only for landing/hero CTAs. Links styled as the primary action
mirror Button primary classes (green specimen pill). Quiet text links are portal blue:
`text-portal underline decoration-portal/40 underline-offset-4 hover:decoration-portal`.

## 7. The 4-states rule (mandatory)

Every component/screen that renders server data implements all four states:

1. **Loading** — `Skeleton` blocks shaped like the eventual content (never bare spinners).
2. **Empty** — `EmptyState` with a next action.
3. **Error** — `ErrorState` with a localized, user-safe message + retry.
4. **Data** — the real render.

No blank screens, no raw error text, ever.

## 8. Accessibility rules

- Focus: `focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none`
  on every interactive element (filled fields swap their hairline to `border-portal`
  instead — an equally visible replacement). Never remove outlines without a replacement.
- Hit area ≥40px (`min-h-10`); 44px+ on touch layouts. Icon-only buttons get `aria-label`.
- Inputs always have visible labels; errors via `aria-describedby` + `role="alert"`.
- Status is never color-only: failed wells pair the glow-red border with text + chip;
  transaction amounts carry an explicit +/- sign.
- Triad glows never carry prose; portal is the only prose accent. Contrast table §2.
- Decorative art (`SpecimenTile`, `AsciiSphere`, ordinals, the section spark,
  the wordmark dot) is `aria-hidden`;
  headings/labels render the raw i18n strings (no CSS text-transform tricks needed —
  v3 has no uppercase anywhere).
- `<html lang>` mirrors the active locale; RU copy is complete, not partial.

## 9. Error-UX surfaces (frontend-error-ux contract)

| Surface | Component | Behavior |
|---|---|---|
| Unknown route | `NotFoundPage` | Portal "404" line + mono 400 headline + one green pill home. Root `notFoundComponent`. |
| Render crash | `AppErrorBoundary` | Mono "technical update" fallback + green pill reload. Technical detail → console/monitoring only. |
| Lost connectivity | `OfflineOverlay` | `useSyncExternalStore` on `online`/`offline`; full-screen `role="alertdialog"` blocker on the void; auto-dismisses. |
| Blocking failure | `Modal role="alertdialog"` + `ErrorState` | For failures requiring acknowledgement. Non-blocking failures stay inline (steel block + glow-red left rule). |
| Destructive confirm | `Modal role="alertdialog"` + danger/ghost pills | Paid/irreversible actions never fire in one click: quiet mist sentence stating the consequence, DANGER specimen pill confirms, GHOST pill cancels (e.g. `gallery.deleteConfirm.*`). The mutation fires only on confirm. |

Copy rules: never raw server text, stack traces, or status codes; no red-primary panic
styling (red marks the status rule/text, never the whole surface); every error screen =
mono headline, one line, one action; both locales (`errors.*` keys).

Documented inline-style exception: `Progress` width % (runtime-computed). Documented
raw-hex exception: `specimenTileArt.tsx` (§5) + the `AsciiSphere` mist fallback. No others.

## 10. Governance

- Tokens live only in `theme.css` `@theme`; new tokens require a repeated product
  need, an entry in §2, and a note here. One-screen needs use existing tokens + opacity.
- New shared components: only when 2+ modules need them; add to §6 in the same task.
  Unreferenced kit components get DELETED, not kept "just in case" — but `Select`
  was REVIVED 2026-07-07 for the composer settings strip (it now backs the
  type/aspect/duration dropdowns in `ChatComposer`). The MODEL choice is the
  exception: a native `<option>` cannot carry a logo/tier/description, so the
  model dropdown is the module-owned custom `ModelSelect` listbox (§12), NOT the
  kit `Select`.
- Every v2 token (`cream`, `ink`, `ink-soft`, `vermillion`, `sand`, `media`,
  `success`, `danger`, `font-display`) is DEAD. Grep before reviving anything.
- Dark mode IS the mode — there is no light theme.
- Screens/routes: standalone screens (landing, login, 404, crash, offline) sit
  directly on the void; app screens run inside `AppShell` via the pathless `_shell`
  layout route. AppShell stays presentational (session + BalanceChip injected by
  `routes/_shell.tsx`).
- Prerender guard: `pnpm --filter @opencreate/web build` greps the hero/claims copy —
  redesigns must keep those strings rendering at `/`.

## 11. Page treatments (v3 restyle map)

| Page | Treatment |
|---|---|
| Landing `/` | Stage 2 done: FLOATING transparent masthead (nav only — pricing link, LangSwitch, session action; the wordmark moved into the hero); FULL-VIEWPORT (`min-h-svh`) hero = `AsciiSphere` behind the centered mono wordmark, kicker, whisper-weight headline with ONE portal accent word (EN "video", RU «копейки» — locale-driven via `landing.headlineAccent`, split inline so the h1 accessible name and the prerender grep stay intact), MIST claims line, and TWO specimen pills (green "Start creating" + amber "See pricing"); below: the ~800px research column (`max-w-[50rem]`) — specimen grid (§5), the mono terminal price index (glow-green "ours" numerals, PORTAL footnote), plain mono how-it-works prose rows (small portal ordinals), FAQ as prose on the void (no rules, no cards); minimal one-line footer (tagline + rights). Section headers = amber spark icon + mono 30px h2 (ordinals retired). |
| `/pricing` | Stage 2 done: the same ~800px research column; mono kicker + 30px h1 + glow-amber "200 free credits" chip; PriceTable (portal footnote) + ModelCreditTable with SPECIMEN-GREEN credit numerals under amber-spark SectionHeadings; visitor signup CTA as a `bg-steel` card with a green pill link. |
| `/login` | Stage 3 done: ONE centered STEEL card (`max-w-md rounded-lg border-white/10 bg-steel p-8`) on the void, under the mono wordmark home link (portal dot, accessible name "openCreate"); mono 30px h1 over a hairline, steel `Input` fields, portal mode-switch link, abyss + glow-red-rule server banner; submit pill tinted by mode — log-in = RED, sign-up = GREEN (reference taxonomy). Pending state keeps the same card silhouette. (The earlier manifesto split and `AuthManifesto` are gone.) |
| `/create`, `/library` | Stage 3 done: void canvas, sticky steel bar, mono 30px page h1s. Generator = the "commission sheet" (unfilled white/10 `rounded-lg` frame so the steel surfaces inside keep an elevation step; ghost mono `SheetField` ordinals; steel prompt textarea; glow-GREEN mono `CostLabel`; the custom `ModelSelect` listbox — logo + tariff + description, amber-ring selection). Gallery cards = figures on SQUARE `bg-abyss` tiles (8px radius) with the triad status colors — amber progress+%, green "ready" chip, red failure + refund note — and a glow-red ICON delete. |
| `/cinema` | CinemaStudio library: void canvas, sticky steel bar, mono 30px h1 + green "New film" pill; film cards = canvas-shaped `bg-abyss` plates (no cover → quiet film glyph) with title + aspect `Badge` + "updated" caption, the whole plate a `Link` into the editor; 4 states. |
| `/cinema/$filmId` | CinemaStudio editor, v5 COMPACT (dense tool screen: route canvas `gap-4 px-4 py-4`, `size="sm"` buttons, `text-xs` captions): `FilmEditorHeader` (back chevron, `text-lg` title, aspect chip, film `Menu` → rename/delete-confirm), then the horizontal `Timeline` strip DIRECTLY UNDER THE TITLE — always on screen, never below the fold. The strip is a RESIZABLE band (v6): a size `Select` (S/M/L → 48/64/88px tile height, "custom" placeholder when dragged in-between) + a keyboard-operable `role="separator"` drag edge on the bottom (clamp 40–120px) drive one `--tl-h` custom property the `ShotThumb`s read (`aspect-video h-[var(--tl-h)]`); authoring (add shot · title card · storyboard) lives behind ONE "+" sm trigger that opens a steel `Modal` of three ghost rows; the per-thumb move/delete cluster is a hover/`focus-within` scrim overlay on the tile's bottom edge (duration chip top-right, title Badge inside the tile) — then the FULL-WIDTH stage: `PreviewPlayer` (sequential DOM player, canvas capped `max-h-[42svh]`, "approximation" caveat) · `RenderBar` (green download / calm retry) · `AudioTracks`. The shot editor is a COMPOSER DOCK (v6) fixed to the viewport bottom (`z-30`, opaque steel `rounded-2xl` sheet, max-w-4xl; editor body carries `pb-36` clearance; a slim hint bar stands in when no shot is selected): an auto-growing prompt textarea (`field-sizing-content` + `resize-y`, `max-h-[30svh]`) over a toolbar of compact model+duration `Select`s, three amber-when-open icon toggles (📎 cast · 🎙 spoken line — opening it arms the draft line · ⛶ expand: look presets + transition + title card + willSee hint, in a `max-h-[40svh]` drawer above the prompt, one panel at a time) and Save / green Generate. Status is text + triad glow, never color-only. |
| `/soul` | AI Soul Studio: void canvas, sticky steel bar, mono 30px h1 + a mist-dim subtitle; a two-column deck — the `SoulConstructor` glass card (pills for the two required axes, `Select`s for the eight optional ones, capped amber trait chips, the abyss "what the model will see" well, a green create pill with a "creating is free" caption) beside the narrow `PromptLibrary` rail (a well per ready-made character: composed text, amber Copy, amber "open in constructor"); below, the user's characters as square well plates linking into the card. 4 states on the character grid. NOTHING here costs credits. |
| `/soul/$entityId` | The soul card: back link + name + amber "edit" (reopens the constructor in a `lg` `Modal`), then `SoulSheet` (four `PORTRAIT_SHEET_VIEWS` well plates, per-view shoot/reshoot pills, ONE green priced action — "First portrait · 2 cr" with no photo, "Complete the sheet · 24 cr" with one) and `SoulAnimate` (video model + duration `Select`s, an action prompt, a green "Оживить · N cr" pill, then the clip: amber `Progress` → well-plated `<video>` → glow-red reason + green "credits refunded" chip), with `SoulFacts` (a `<dl>` of picked LABELS + amber trait badges) in the right rail. Every paid action is confirmed by an `alertdialog` that repeats the price. |
| 404 / crash / offline | Done: mono 400 30px headline, one line, one action, flat void. |

## 12. Module UI surfaces (kept current per task)

Module-owned components (inside `modules/*`, composed from §6 primitives).

| Module | Surface | Composition & states |
|---|---|---|
| Auth | `AuthForm` (`/login`) | Inside the route's centered STEEL card: mono 30px h1 over a white/10 hairline, steel `Input` fields (border-defined on the card); submit pill tinted by mode — log-in = RED specimen pill (auth-entry), sign-up = GREEN (creating an account is a create action); login↔register switch as a portal link; zod errors per field (`role="alert"`); server banner = ABYSS block + glow-red left rule (steel would vanish on the steel card); Google button = amber ghost, behind `VITE_GOOGLE_AUTH=1`. |
| Credits | `BalanceChip` (header) | The AMBER SPECIMEN PILL at 32px (v3.1 compact bar; `text-sm` numeral): `rounded-full border-white/10 bg-specimen-amber/20 text-lumen-amber shadow-pill` (hover `/35` — Button-ghost anatomy: the balance is a real control, not passive meta), glow-AMBER bolt icon accent + `font-medium` numeral (the 500 ceiling); the bolt is a decorative `currentColor` SVG — NEVER an OS emoji; loading = pill `Skeleton`; failure = ↻ icon-button; signed-out hidden. Opens history modal. |
| Credits | `TransactionsList` (modal) | `Modal` (steel sheet) + 4 states; ledger rows on `divide-white/10`, mono 400 amounts — `+n` glow-green / `-n` glow-red (sign carries meaning, color reinforces). |
| Generator | `GeneratorPanel` (sheet posture) | The "commission sheet": a TITLED GLASS `Card` (`padding='lg'`, `title=generator.sheet`). v4 retired the unfilled `rounded-lg border-white/10` frame — the card now has depth of its own, so the steel inputs inside no longer carry the elevation ladder alone — and retired the `<header>` + `aria-label` pair with it: the visible mono caption IS the landmark's accessible name (which therefore changed from `generator.title` to `generator.sheet`). Ordered `SheetField` rows (`divide-white/10`), glow-GREEN mono `CostLabel` + green Generate against the closing hairline (price and action share the create tint). Catalog 4 states. Submit failures inline via `SubmitErrorBanner` (portal `/pricing` link on insufficient credits). Sibling of `ChatComposer` over the same store — `/create` renders the composer. |
| Generator | `SheetField` | One sheet row: ghost mono ordinal (`text-white/20`, 400, aria-hidden, derived from render order) + field group; separators owned by the parent `divide-y`. |
| Generator | `PromptField` | Mono caption + steel filled textarea (`bg-steel rounded-lg`, focus → portal border) — the `Input` treatment's textarea twin. |
| Generator | `SubmitErrorBanner` | `role="alert"` steel block + glow-red left rule; EVERY envelope code renders localized primary copy — `insufficient_credits` (+ portal `/pricing` link) and `content_blocked` (refund promise) keep dedicated wording, all other/unknown codes map via `shared/libs/errorCopy` → `errors.codes.*`; the raw envelope message may trail only as a secondary `text-mist-dim` line (suppressed for the two dedicated codes and for non-envelope exceptions). |
| Generator | `ModelSelect` (+ `ModelSelectOption`, `ProviderMark`, `useModelListbox`) | Custom accessible LISTBOX (not a native `<select>` — options need a logo, tier chip and description). Trigger = steel (`variant='sheet'`) or glass (`variant='glass'`, composer) field showing the selected model's `ProviderMark` + name + provider label + `N cr`. Opens an OPAQUE `bg-steel` panel (readable over the composer's frosted glass — the reason a native select was rejected here), placement-aware (flips UP for the bottom-docked composer), listing ALL models in `role="group"` sections (Images / Video). Each `role="option"` row: `ProviderMark` tile, name + provider, tier `Badge` (amber), tariff `N cr · $N.NN` ($ = credits × $0.01, video quotes its base duration) and a localized description (`generator.models.<id>.description`). SELECTED = amber ring (`ring-glow-amber/60`) + `aria-selected`; ACTIVE (keyboard/hover) = one step to `bg-ridge`. Full keyboard: Arrow/Home/End move, Enter/Space select, Esc closes + restores focus, typeahead by name; click-outside closes; enter transition is CSS `@starting-style` (no gradient). Owns `useCatalog` + the 4 states (skeleton / inline retry / disabled placeholder / data). Picking a video model while on 'image' flips the type via the store's `normalizeFor`. Replaced the old `ModelPicker` tiles (deleted 2026-07-08). |
| Generator | `ProviderMark` | Inline SVG provider LOGO marks (one crisp monoline glyph per brand: flux/pixverse/minimax/seedance/wan/kling/veo + generic) — self-contained (no external URLs, CSP-safe), `currentColor`, flat strokes, no gradients; `aria-hidden` (the brand name is text). |
| Generator | `ImageDrop` | Dashed white/15 dropzone on the void (hover brightens + ridge wash) + sr-only file input; preview thumb on `bg-abyss`; image/* ≤10MB; glow-red inline errors. |
| Gallery | `GalleryGrid` | 4 states: 8 plate-shaped skeletons (`animate-skeleton`, `rounded-2xl` = the well's radius, so the grid never re-corners itself when data lands) / `ErrorState` / `EmptyState` + green pill `/create` CTA / 1-2-3-col grid + amber ghost Load more. |
| Gallery | `GenerationCard` | A FIGURE: a SQUARE `Card surface='well' padding='none'` plate — **never `glass`**. A thumbnail in a grid IS the content; frosting a card around a photo lays a lit edge, a blur and a shadow over what the eye is reading as an image. Glass is for chrome that floats OVER media. Images `object-cover`, videos letterboxed; the full frame lives in the detail modal. The `<button>` sits INSIDE the well (a `<button>` takes phrasing content, `Card` renders a `<div>`), so the plate owns the `motion-safe` hover lift and the button a `focus-visible:ring-inset` ring — an outset ring would be clipped by `overflow-hidden`. Mono mist prompt caption; the action set rides the plate's corner in a `Menu` (glow-red ICON delete — `#ff2056` is "icons/status only", a red pill per figure shouted). Two plates stay hand-rolled at the well's radius: PROCESSING (`animate-skeleton` walks background-color; a well would pin the fill and kill the pulse) and FAILED (its `border-glow-red` is STATUS, and Card owns its hairline as surface — pushing a border color through the layout-only `className` would let Tailwind's stylesheet order decide the winner). Processing = `animate-skeleton` tile + `Progress` + glow-amber %; polling is BOUNDED — 20 min past `createdAt` the interval stops and a `role="status"` glow-AMBER "taking longer than usual" note (`gallery.stalled`) + amber ghost Refresh pill (`gallery.refresh`, one manual poll) appear under the progress row (amber, not red: nothing failed yet); a status poll that fails before any data replaces the tile with `ErrorState` (`gallery.pollFailed`) + retry — the card never freezes at "Generating N%". Succeeded = green "ready" chip (`gallery.ready` — status said in text, never color-only); failed = glow-red hairline tile + a localized primary reason (`errorCodeMessageKey(errorCode)` → `errors.codes.*`, unknown → generic) + the raw provider text only as the secondary mist-dim caption (suppressed for `content_blocked`) + "Credits refunded" green chip. Plates lift on hover (`motion-safe`). Delete opens the destructive-confirm alertdialog (§9, `gallery.deleteConfirm.*`) — the optimistic removal fires only on the danger-pill confirm. |
| Gallery | `GenerationDetail` (modal) | A `Card surface='well' padding='none'` media plate inside a `Modal surface='glass'` sheet — the frosted dialog floats, the user's work is sunk one step into it. Height-capped (`max-h-[70dvh]`) with `object-contain`, so a 9:16 portrait shows its whole frame instead of running off the viewport. Mono caption + meta, then the action set as a named icon rail. Only layout classes (sizing, centering, `overflow-hidden`) go through the Card's `className`; the surface is Card's. |
| Gallery | `GalleryFilterChips` | `PillGroup` All/Images/Videos (amber selection). |
| Gallery | `ViewSettingsMenu` | Gear disclosure holding the display preferences (grid/table/slide + density). Its panel stays an OPAQUE `bg-ridge` step, **not** glass: a translucent popup over moving media is unreadable. Same asymmetry `Select` documents. |
| Entities | `EntityLibrary` (`/entities`) | 4 states over `useEntities`: 6 square `rounded-2xl` skeletons / `ErrorState` / `EmptyState` + green create pill / grid of cover tiles. A tile is a `Card surface='well' padding='none'` (an uploaded face is content, not chrome — same reasoning as `GenerationCard`) holding a media button, with the name, localized kind and an overflow `Menu` beneath. |
| Entities | `EntityEditor` (modal) | `Modal` create/edit (null=create): steel `Input` name, kind `Select` (create only — kind is immutable), steel textarea + preset snippet chips, and in edit mode the photo set with amber-bordered primary election. Inline glow-red `role="alert"` errors. |
| Landing | `LandingPage`, `Hero`, `ShowcaseSpread`, `SectionHeading`, `PriceTable`, `HowItWorks`, `FaqClaims`, `ModelCreditTable`, `TableScrollRegion` | Stage 2 terminal skin (§11): full-viewport `AsciiSphere` hero with two pill CTAs; `ShowcaseSpread` = ONE figure wrapping the 4×2 `SpecimenTile` grid + ONE honest figcaption (sampleLabel chip + `landing.showcase.caption` naming the real models) + one video-marked tile; `SectionHeading` (amber spark icon, decorative — heading names are behavior) and `PriceTable` (no props since Stage 2) are also consumed by the /pricing route via the module index. Claims and honesty markers ("verified July 2026" caption as the table's accessible name, one named competitor per row, the sample-style labeling) are unchangeable. `TableScrollRegion` (v4 QA r2 + 390px affordance) wraps both index tables: a keyboard-focusable `role="region"` overflow area + a dynamic aria-hidden mono `common.scrollHint` ("scroll →" / «прокрутите →») + a translucent SOLID `bg-void/60` right-edge overlay strip (aria-hidden, pointer-events-none) that retires at the far right — the NO-GRADIENT answer to an edge fade, both shown only while columns really overflow. |

| Cinema | `CinemaLibrary` (`/cinema`) | 4 states over `useFilms`: 4 canvas-shaped `Skeleton` plates / `ErrorState` / `EmptyState` + green "New film" pill / grid of `FilmCard`. Header green "New film" opens `FilmSettingsModal` (create). |
| Cinema | `FilmCard` | A `Link` figure: canvas-shaped `bg-abyss` plate (aspect-video/square/9:16) with a quiet film glyph (no list cover), mono white title, neutral aspect `Badge`, mist-dim "updated {date}" (localized `Intl`). Plate lifts ≤0.5 on hover (`motion-safe`). |
| Cinema | `FilmSettingsModal` | `Modal` create/edit (null=create): steel `Input` title + aspect `PillGroup` + default-style `Select` (STYLE_PRESETS + "no style"). Create navigates into the new editor; edit closes. Error → inline glow-red. |
| Cinema | `FilmEditorHeader` | Back chevron → `/cinema`, mono title, aspect `Badge`, film `Menu` (rename → `FilmSettingsModal` edit; delete → destructive-confirm `Modal role="alertdialog"` §9 — danger pill fires `useDeleteFilm` then navigates). |
| Cinema | `Timeline` | Horizontal `bg-abyss` rail of `ShotThumb`s + a dashed "add shot" / hairline "title card" cluster + ghost "Storyboard" pill. Reorder by chevron buttons (swap ids → POST full order). Empty rail shows a mist-dim hint. |
| Cinema | `ShotThumb` | Fixed 16:9 `bg-abyss` tile reflecting its clip's LIVE status (shared `['generation', id]` cache): null → title/placeholder glyph · processing → `animate-skeleton` · failed → glow-red text · succeeded → video first-frame / `object-cover` img. Portal ordinal chip, void/70 duration chip, amber crossfade edge marker, amber-ring when selected; move (chevrons, end-disabled) + glow-red delete beneath. |
| Cinema | `ShotInspector` | The selected shot's editor (keyed by shot.id): steel prompt textarea, `PresetPickers`, video-model + duration `Select`s, transition (+ crossfade length) `Select`s, optional title overlay (amber toggle + text + position), an abyss "the model will see" hint (`applyPromptPreset`), a text+glow status line, ghost Save + green Generate (spark icon). Generate saves then creates+links the clip. |
| Cinema | `PresetPickers` | 2×2 grid of `Select`s (style/framing/motion/quality) built FROM the contract preset tables; style prepends a "no style" row, modifier axes carry their own "any". |
| Cinema | `PreviewPlayer` | Sequential DOM player on a canvas-shaped abyss well: stacked video/img/title-slate, advance on `ended` / durationMs timer, amber play-pause pill + `n / total`, mist-dim "preview is an approximation" caveat. Reads clips from cache (no own poll). |
| Cinema | `RenderBar` | Green "Render mp4" (disabled with no shots / while processing) → `Progress` + glow-amber % → green Download `<a>` (`/media/<id>.mp4`) on success, calm `ErrorState` retry on failure (never the raw ffmpeg message). |
| Cinema | `AudioTracks` | Amber ghost "add music"/"add voiceover" → mini-form (prompt + tts voice `Select`) generates+links an audio track; track rows (music/mic icon + kind, glow-red remove) on `divide-white/10`. Hidden affordances when the audio models are absent. |
| Cinema | `StoryboardModal` | `Modal`: steel script textarea + style + shot-count `Select` → POST storyboard (draft shots appear on reload). A clean `provider_error` renders the amber "storyboarding isn't configured" `role="status"` inline — never a crash. |

| Soul | `SoulConstructor` (`/soul`) | Titled GLASS `Card`: steel `Input` name, `PillGroup` for the two REQUIRED axes (archetype, style — a dropdown for a choice with no empty state hides it), a 2-col grid of `Select`s for the eight optional axes (each with an "any" row), `TraitPicker`, the steel notes textarea, `SoulPreview`, and a green submit pill beside the mist-dim "creating a character is free" caption. CONTROLLED — the studio owns the draft so `PromptLibrary` can replace it. Failures = steel block + glow-red LEFT RULE (`errorCopy`, never raw text). Option/trait/style LABELS come from the contract tables and are the documented i18n exception (they are DATA, like `STYLE_PRESETS`). |
| Soul | `TraitPicker` | Chip groups from `TRAIT_GROUPS`: picked = amber specimen tint + `aria-pressed`, idle = white/5 wash → `hover:bg-ridge`, and at `MAX_TRAITS` (6) every unpicked chip is DISABLED (40% dim) with a glow-AMBER `role="status"` line saying why — amber, not red: nothing failed, the studio is protecting a render the user is about to pay for. A picked chip stays enabled at the cap, or the user is stuck at six. |
| Soul | `SoulPreview` | Recessed `well` Card, "what the model will see": the composed positive prompt (mono mist) + the negative as a quiet mist-dim caption + an amber Copy pill. Composed by the CONTRACT functions (`composePortraitPrompt` + `applyPromptPreset`), so it cannot drift into a plausible lie. |
| Soul | `PromptLibrary` | Glass card holding one recessed `well` per `PROMPT_LIBRARY` entry: white label, 3-line-clamped composed prompt, amber Copy + amber "open in constructor" (free, because each entry is a `Soul` literal, not a string). |
| Soul | `SoulCharacters` | 4 states over the SHARED `['entities']` query filtered to `soul != null`: 6 square `rounded-2xl` skeletons / `ErrorState` / `EmptyState` ("build one — it's free until the first portrait") / grid of `Card surface="well" padding="none"` plates, each a typed `Link` into the soul card with an INSET focus ring (an outset one would be clipped). A cover photo is CONTENT — never frosted glass. |
| Soul | `SoulSheet` (`/soul/$entityId`) | THE paid surface. Four well plates in `PORTRAIT_SHEET_VIEWS` order (label from `PORTRAIT_VIEWS`); minting plates pulse with `animate-skeleton`. ONE green priced action — "First portrait · 2 cr" (no photo → `flux-dev`) or "Complete the sheet · 24 cr" (photo → 3 × `flux-kontext-pro`) — plus per-view amber shoot/reshoot pills once a photo exists. The price is READ FROM THE CATALOG and a `null` price DISABLES the button (a pulse, never a guessed number). Every mint passes through a `Modal role="alertdialog"` repeating the cost (§9). A failed view shows the localized `errorCode` reason + a green "credits refunded" `Badge`; a whole-call failure is an inline steel/glow-red-rule alert. |
| Soul | `SoulAnimate` | The 35–140-credit act, never automatic: video-model + duration `Select`s, an editable action prompt (seeded from the derived description), a green "Оживить · N cr" pill behind an alertdialog. With no primary photo it renders a mist-dim reason instead of a dead button. The clip's states: amber `Progress` + glow-amber caption → `<video>` in a well plate (`object-contain`, never cropped) → glow-red localized reason + green "credits refunded" chip → amber `gallery.pollFailed` line. |
| Soul | `SoulFacts` | Glass card: a `<dl>` on `divide-white/10` — mist-dim axis name (`soul.field.*`), white contract LABEL as the value — then the traits as amber `Badge`s and the notes verbatim. Labels, never model fragments: that is the payoff of storing the spec as structure. |

Recorded exceptions: `Modal` overlay is `role="presentation"` (2026-07-06 a11y fix);
failed cards and the submit banner may show the stored server/provider failure text
as a SECONDARY `text-mist-dim` caption under the localized primary (QA finding 3,
2026-07-07; never for `content_blocked`) — §9's "no raw server text" otherwise
stands; `auth.manifesto.*` (and the retired `landing.showcase.figure`/`items.*`,
plus `gallery.contentBlocked` — replaced by `errors.codes.contentBlocked`) keys
remain in BOTH locale files though no longer rendered — the keys-intact rule
outlives the components.
