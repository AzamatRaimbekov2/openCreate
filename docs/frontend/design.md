# openCreate — Design System ("Paper & Ink")

> Canonical design source of truth for `apps/web`. Every screen, component, and token
> decision starts here. Created 2026-07-06 (plan Task 13). Keep in sync with
> `apps/web/src/shared/config/theme.css` and `apps/web/src/shared/ui/`.

## 1. Intent

openCreate is an honest, cheaper AI image/video generation product. The UI must feel
calm, editorial, and trustworthy — deliberately NOT the dark-cinema look of
Higgsfield-style competitors. Direction: **"Paper & Ink"** — warm paper surfaces, ink
text, one electric indigo accent, generous whitespace. Media (generated images/video)
is the only dark element on the page, so the user's output is always the hero.

- Audience: creators comparing generation prices; EN + RU locales, desktop-first, fully responsive.
- Platforms: web SPA (React 19 + Vite 8 + Tailwind v4). No native mobile in MVP.
- Principles: honest copy (short verbs, no exclamation marks), one accent color,
  motion only as feedback, never decoration.

## 2. Color tokens

Defined once in `apps/web/src/shared/config/theme.css` via Tailwind v4 `@theme`.
Use utility classes (`bg-paper`, `text-ink`, `ring-accent`, …) — never raw hex in components.

| Token | Value | Role | Use when | Avoid when |
|---|---|---|---|---|
| `--color-paper` | `#faf9f6` | App canvas | Page/body background, standalone screens (login, 404, crash, offline) | Cards that must lift off the canvas (use white) |
| `--color-ink` | `#111110` | Primary text | Headings, body copy, ghost-button labels | Large fills; disabled text (use ink-soft) |
| `--color-ink-soft` | `#57534e` | Secondary text | Descriptions, captions, placeholder labels, meta info | Primary copy the user must read to act |
| `--color-accent` | `#4f46e5` | The one action color | Primary buttons, active nav, focus rings, progress fill, links | Status meaning (success/danger), large decorative surfaces |
| `--color-accent-soft` | `#eef2ff` | Accent wash | Ghost-button hover, selected-card background, accent badge bg | Text (contrast too low) |
| `--color-media` | `#141413` | Media well | ONLY behind image/video previews and media cards | Any non-media surface — the app stays light |
| `--color-success` | `#16a34a` | Positive status | Refund confirmations, "+credits" amounts, success badges | Buttons/CTAs (accent owns actions) |
| `--color-danger` | `#dc2626` | Destructive / failure status | Delete buttons, failed-generation borders, "-credits" amounts, validation text | Primary styling of error screens (calm neutrals + ghost retry instead — see §8) |

Neutrals in between (borders, skeletons, disabled) are derived with opacity modifiers:
`border-ink/10`, `border-ink/15`, `bg-ink/5`, `bg-ink/10` — do not add new gray tokens.
White (`bg-white`) is the raised-surface color for cards, inputs, and modals.

## 3. Typography

System font stack (Tailwind default `font-sans`) — no webfont cost, instant paint.

| Level | Classes | Use |
|---|---|---|
| Display | `text-4xl md:text-5xl font-semibold tracking-tight text-ink` | Landing hero only |
| H1 | `text-2xl font-semibold tracking-tight text-ink` | Screen titles, crash/404 titles |
| H2 | `text-xl font-semibold text-ink` | Section titles, modal titles |
| Body | `text-base text-ink` | Default copy |
| Secondary | `text-sm text-ink-soft` | Descriptions, helper text |
| Caption | `text-xs text-ink-soft` | Badges, table captions, "verified" notes |

Voice: short verbs, sentence case, no exclamation marks, no blame. All strings via
i18next keys present in BOTH `en.json` and `ru.json`.

## 4. Spacing, radius, elevation, motion

- **Spacing**: 4px scale (Tailwind default). Common rhythm: `gap-1` (4) inside controls,
  `gap-4` (16) between form fields, `p-6` (24) card padding, `py-10`+ (40+) section padding.
  Generous whitespace is part of the identity — when in doubt, add space, not lines.
- **Radius**: cards/modals `rounded-2xl` (`--radius-card: 1rem`), controls (buttons,
  inputs, selects, skeletons) `rounded-xl`, badges/progress `rounded-full`.
- **Elevation**: `shadow-sm` on raised cards; `shadow-xl` only for modals. No other shadows.
- **Borders**: `border-ink/10` default, `border-ink/15` for inputs, `border-danger` only
  on failed media cards.
- **Motion**: opacity/translate only, 150ms (`duration-150`). No scale, no bounces, no
  spinners longer than the wait. `animate-pulse` is reserved for skeletons and
  processing-media placeholders. Respect `prefers-reduced-motion` for any added animation.

## 5. Component inventory (`apps/web/src/shared/ui/`)

Import from `'shared/ui'` only (public API via `index.ts`). Reuse these before creating
anything new; new shared components must be added to this table in the same task.

| Component | Variants / props | States |
|---|---|---|
| `Button` | `variant: primary \| ghost \| danger`, `size: md \| lg`, `isLoading` | hover, focus-visible ring, disabled (50% opacity), loading (spinner + disabled + `aria-busy`) |
| `Input` | `label`, `error`; all native input props incl. `ref` (RHF-ready) | focus ring, `aria-invalid` + `role="alert"` message when `error` |
| `Select` | `label`, `options: {value,label}[]`, `error` | same as Input |
| `Skeleton` | `className` for shape | pulsing block — mirrors the content's silhouette |
| `Modal` | `isOpen`, `onClose`, `title`, `role: dialog \| alertdialog` | portal, Escape + overlay close, body-scroll lock, focus restore |
| `EmptyState` | `icon?`, `title`, `description?`, `action?` | static placeholder — never an empty screen |
| `ErrorState` | `message`, `onRetry?` | calm card, ghost "Try again" button, `role="alert"` |
| `Badge` | `variant: neutral \| accent \| success \| danger` | static pill |
| `Progress` | `value: 0–100`, `label?` | accent fill, `role="progressbar"` with value now/min/max |
| `AppErrorBoundary` | wraps the app | catches render crashes → full-screen calm fallback + reload |
| `OfflineOverlay` | none (self-managed) | full-screen blocking overlay while `navigator.onLine === false`, auto-clears |
| `NotFoundPage` | none | 404 screen with link home (root `notFoundComponent`) |
| `PillGroup<T>` | `label`, `options: {value,label}[]`, `value`, `onChange` | labelled `role="group"` of toggle pills, selection via `aria-pressed`; selected = `border-accent bg-accent-soft text-accent` (added Task 16 — needed by Generator pickers AND Gallery filter chips) |
| `LangSwitch` | none (reads/sets locale via `shared/config/i18n`) | compact `role="group"` EN/RU toggle, `aria-pressed` active pill = `bg-accent-soft text-accent` (added Task 18 — needed by AppShell AND the standalone landing) |
| `AppShell` | `user: {name,email} \| null`, `isSessionPending?`, `onSignOut`, `balanceSlot?`, `children` | header (wordmark home link, nav Create/Library/Pricing with accent active state, balance slot, LangSwitch, account area) + `bg-paper` canvas; account area: pending = `Skeleton`, signed out = primary Sign in link, signed in = disclosure user menu (`aria-haspopup`/`aria-expanded`, Escape + click-away close) |

Buttons: primary = the single main action per view; ghost = secondary/quiet actions and
retry; danger = destructive only (delete). Size `lg` only for landing/hero CTAs.

## 6. The 4-states rule (mandatory)

Every component/screen that renders server data implements all four states:

1. **Loading** — `Skeleton` blocks shaped like the eventual content (never bare spinners).
2. **Empty** — `EmptyState` with a next action (e.g. CTA to create).
3. **Error** — `ErrorState` with a localized, user-safe message + retry.
4. **Data** — the real render.

No blank screens, no raw error text, ever.

## 7. Accessibility rules

- Focus: `focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none` on
  every interactive element. Never remove outlines without a ring replacement.
- Hit area: minimum 40px (`min-h-10`) for all controls; 44px+ on touch layouts.
- Icon-only buttons always get `aria-label`.
- Inputs always have visible `<label>`s; errors are linked via `aria-describedby` and
  announced with `role="alert"`.
- Contrast: ink on paper 17.9:1; accent on white 6.3:1; ink-soft on paper 6.2:1 — all AA+.
  Never place text on `accent-soft` other than `text-accent` (5.9:1).
- Status is never color-only: failed cards pair the danger border with text + badge.
- Language: `<html lang>` mirrors the active locale; RU copy is complete, not partial.

## 8. Error-UX surfaces (frontend-error-ux contract)

| Surface | Component | Behavior |
|---|---|---|
| Unknown route | `NotFoundPage` | Calm 404, title + description + home link. Wired as root `notFoundComponent`. |
| Render crash | `AppErrorBoundary` | Full-screen "technical update" fallback + reload button. Technical detail goes to console/monitoring only. |
| Lost connectivity | `OfflineOverlay` | `useSyncExternalStore` on `online`/`offline` events; full-screen `role="alertdialog"` blocker; auto-dismisses on reconnect. |
| Blocking failure | `Modal role="alertdialog"` + `ErrorState` | For failures requiring acknowledgement/decision. Non-blocking failures stay inline (banners/`ErrorState`). |

Copy rules: never show raw server text, stack traces, or status codes; no red-primary
panic styling; messages exist in both locales (`errors.*` keys).

## 9. Governance

- Tokens live only in `theme.css` `@theme`; new tokens require a repeated product need,
  an entry in §2, and a note here — one-screen needs use existing tokens + opacity.
- New shared components: only when 2+ modules need them; add to §5 with variants/states.
  Module-specific UI lives inside the module.
- Documented exception: `Progress` uses an inline `style` width — a runtime-computed
  percentage cannot be a static Tailwind utility. No other inline styles are allowed.
- Dark mode: out of scope for MVP (`--color-media` is the only dark surface). Revisit
  when user demand appears — status colors must be re-contrast-checked then.
- Screens/routes: standalone (landing, login, 404, crash, offline) sit directly on
  paper; app screens (create, library, pricing) run inside the AppShell via the
  pathless `_shell` layout route. AppShell itself is presentational — session
  state and BalanceChip are injected by `routes/_shell.tsx` (shared/ui never
  imports modules/*).

## 10. Module UI surfaces (kept current per task)

Module-owned components (live inside `modules/*`, composed from §5 primitives —
NOT part of `shared/ui`):

| Module | Surface | Composition & states |
|---|---|---|
| Auth | `AuthForm` (login screen `/login`) | White card on paper; `Input` + `Button`; login↔register switch (fields remount per mode); zod errors per field (`role="alert"`); localized server-error banner (`role="alert"`, `bg-danger/10`); submitting = button spinner; Google button only when `VITE_GOOGLE_AUTH=1`. |
| Credits | `BalanceChip` (AppShell header) | Accent-soft pill `⚡ n` (`rounded-full bg-accent-soft text-accent`); loading = chip-shaped `Skeleton`; failure = compact ↻ icon-button (aria-label); signed-out = hidden. Click opens the history modal. |
| Credits | `TransactionsList` (modal) | `Modal` + 4 states: 3 skeleton rows / `ErrorState` retry / `EmptyState` / rows with localized kind + locale-formatted date + signed amount (`+n` `text-success`, `-n` `text-danger`). |
| Generator | `GeneratorPanel` (create page `/create`) | White card; catalog 4 states (form-silhouette skeletons / `ErrorState` retry / defensive `EmptyState` / form). Composes `PillGroup` (type), `ModelPicker`, prompt textarea, `AspectPicker` + `DurationPicker` (video only), `ImageDrop` (i2v only), `CostLabel` + primary Generate. Submit failures are INLINE `role="alert"` banners (`bg-danger/10`); insufficient credits adds a `/pricing` link. |
| Generator | `ModelPicker` (cards) | 2-col grid of `aria-pressed` cards: product name + honest provider label + price hint (image "≈ 1 credit" / video "from 35"); selected = `border-accent bg-accent-soft`. |
| Generator | `ImageDrop` | Dashed dropzone button (`border-dashed border-ink/15`) + sr-only labelled file input; validates image/* ≤10MB; preview thumb + ghost Remove; errors inline `role="alert"` `text-danger`. |
| Gallery | `GalleryGrid` (create + library) | 4 states: 8 card skeletons / `ErrorState` retry / `EmptyState` + primary-styled `/create` `Link` CTA (off on the create page) / responsive 1-2-3-col grid + ghost "Load more" while `nextCursor`. |
| Gallery | `GenerationCard` | White card, media well in the REAL aspect (`aspect-video`/`aspect-square`/`aspect-[9/16]`) on `bg-media`. Processing = pulsing well + `Progress` + "n%" caption; succeeded = `<video controls>` or image button → `GenerationDetail` modal, footer cost · download link · ghost-danger Delete; failed = `border-danger` + localized title + stored failure reason (caption) + success `Badge` "Credits refunded". |
| Gallery | `GalleryFilterChips` (library) | `PillGroup` of All / Images / Videos; selection is page-local state. |
| Landing | `LandingPage` (route `/`) | Standalone screen with its OWN top bar (wordmark · /pricing link · `LangSwitch` · session-aware Sign in/Create action); sections in reading order: Hero → PriceTable → HowItWorks → FaqClaims. CTA destination comes in as a prop (`ctaTo`) — the route reads the session, the module never imports Auth. |
| Landing | `Hero` | Display headline (i18n `landing.headline`), the three approved claims mid-dot joined, primary-lg CTA `Link`, decorative `aria-hidden` showcase strip (`public/showcase/*.webp` gradient placeholders on `bg-media` wells). |
| Landing | `PriceTable` (landing + `/pricing`) | White card, semantic `<table>`; `<caption>` = the "verified July 2026" honesty marker (also the table's accessible name). Our column cells `bg-accent-soft` with `text-accent` ONLY (§7); one named competitor item per row, no blanket "cheapest" claims. |
| Landing | `HowItWorks` | `<ol>` of three white step cards (aria-hidden ordinal badge, h3 + description). |
| Landing | `FaqClaims` | `<ul>` of exactly three Q&A cards (expire+no-subscription / what a credit is / which models) — the FAQ must not grow topics beyond the approved claims. |

A11y fix recorded 2026-07-06: the `Modal` overlay no longer sets `aria-hidden`
(it hid the dialog itself from the accessibility tree); it is `role="presentation"`.

Recorded copy exception (Tasks 16-17): failed generation cards show the stored
provider failure reason as a SECONDARY caption under a localized primary line —
the plan's card contract requires the reason to be visible; §8's "no raw server
text" otherwise stands.
