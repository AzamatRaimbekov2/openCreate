# AppShell.tsx — AI component doc

> AI-facing sidecar for `AppShell.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Application chrome (header + canvas) for in-app screens, in the v3 "Bioluminescent
Terminal" voice: sticky STEEL bar (`bg-steel`) over the void, mono wordmark
"openCreate·" (portal-blue dot), lowercase mono nav (Create/Library/Pricing),
credits balance slot, EN/RU LangSwitch, account area. Presentational by design so
`shared/ui` never imports `modules/*`.

## What it does (for an AI reader)
- Responsibilities: render the sticky steel header row and the `bg-void` page canvas.
  The three account-area states now live in the shared `AccountMenu` component — this
  file just renders `<AccountMenu ... />` in the right cluster.
- Public API / exports / props / endpoints: `AppShell`, `AppShellProps`,
  `AppShellUser` (re-exported alias of `AccountMenu`'s `AccountUser`). Props:
  `user: AppShellUser | null`, `isSessionPending?`, `onSignOut: () => void`,
  `balanceSlot?: ReactNode`, `children`.
- Inputs → Outputs: injected session snapshot + slots → header chrome around
  `children`. Nav uses TanStack `Link` with color ONLY in
  `activeProps`/`inactiveProps` (avoids dueling `text-*` utilities).
- Side effects (I/O, network, state): none. The disclosure-menu state now lives in
  `AccountMenu`, so this file holds no local state.

## Dependencies
- Imports / depends on: `@tanstack/react-router` (`Link`), `react-i18next`,
  `shared/ui/LangSwitch`, `shared/ui/AccountMenu` (`AccountMenu` + `AccountUser`).
- Used by: `routes/_shell.tsx` (the pathless layout route that injects session
  state from `modules/Auth` and `BalanceChip` from `modules/Credits`).

## Diagram
```mermaid
flowchart LR
  ShellRoute[routes/_shell.tsx] -- "user / onSignOut / balanceSlot" --> AppShell[AppShell.tsx]
  AppShell --> Nav[Links: create · library · pricing]
  AppShell --> LS[LangSwitch]
  AppShell --> Acct[AccountMenu → onSignOut]
  AppShell --> Content[children (Outlet)]
```

## Key decisions / gotchas
- The plan (Task 18) put BalanceChip and sign-out INSIDE this file; that would
  make `shared/ui` import `modules/*`, which the architecture law forbids.
  Resolved with slots/props: the `routes/_shell.tsx` layout route (routes MAY
  import modules) does the wiring. Behavior contracts of the plan's test are
  unchanged.
- `/pricing` shipped as a plain `<a>` in Task 18 (the typed Link union rejects
  routes that don't exist yet); Task 20 created the route and swapped it to a
  typed `Link` with the same active/inactive styling as the other nav items.
- Account name can be an empty string in better-auth — trigger label falls back
  to the email via `user.name?.trim()`.
- v3 terminal restyle intent: the bar became STICKY `bg-steel` (a surface step needs
  no border/shadow to separate from the void while scrolling); the wordmark stays the
  default mono with an aria-hidden portal "·" — the brand's cursor (accessible name
  stays "openCreate"); nav = lowercase `text-sm` mono, active = plain `text-white`
  (presence, not an accent — portal is reserved for links/brand, the triad for
  actions); Sign in = red specimen pill because the reference taxonomy files
  login/auth under red; the user-menu panel = `bg-ridge` + white/10 hairline, 8px
  (elevation by color step, hover steps back down to steel). Roles/labels unchanged —
  `AppShell.test.tsx` queries by role/name only.

## Update 2026-07-11 — template catalog
- Nav gains a `/templates` typed `Link` (`t('nav.templates')`), same
  `activeProps`/`inactiveProps` styling as every other item. Nav order is now
  create · library · cinema · **templates** · entities · pricing.
- **It sits next to Cinema, not next to Create, on purpose**: a template IS a film —
  applying one lands you in the film editor at `/cinema/$filmId` — and the adjacency is
  the hint. Putting it beside Create would suggest it produces a single generation.
- `AppShell` stays presentational: the link is a plain typed `Link`, so `shared/ui` still
  imports nothing from `modules/*`.

## Update 2026-07-15 — v3.1 compact bar
- Chrome height dropped **64→44px**: bar `py-3→py-1.5`, controls `min-h-10→min-h-8`,
  wordmark `text-xl→text-base`, nav/account/sign-in labels `text-sm→text-xs`
  (sign-in pill `px-5 py-2→px-4 py-1`, menu trigger `py-2→py-1`, session skeleton
  `h-10→h-8`). The dropdown menu panel/items are NOT shrunk — they overlay content,
  not chrome, so their hit area stays 40px.
- **Why**: the editor screens (CinemaStudio timeline, Soul sheet) are
  vertical-space-hungry; the header is pure chrome, so every pixel it gives up goes
  to the canvas. `BalanceChip` (modules/Credits) mirrors the same 32px control scale.
- Roles, labels and states untouched — behavior tests unaffected.

## Update 2026-07-20 — Modular 3D Assets entry
- Nav gains ONE `/assets` typed `Link` (`t('nav.assets')`), identical
  `className={navLinkClass}` + `activeProps`/`inactiveProps` to every sibling. Nav
  order is now create · library · cinema · **assets** · templates · souls · entities · pricing.
- **Placed beside Cinema, before Templates**: both `/cinema` and `/assets` are
  multi-step WORKBENCHES you enter from a library (film editor / asset wizard),
  not one-shot generations like `/create`. The adjacency is the mental model —
  a user who understands "the film library opens an editor" reads the asset
  library the same way. Anything closer to Create would imply a single click buys
  a finished thing; the wizard is five priced stages.
- The whole change is the one `<Link>` — `AppShell` stays presentational and still
  imports nothing from `modules/*`; the route (`_shell.assets.index.tsx`) does the
  auth guard and the module composition. Roles/labels unchanged, so
  `AppShell.test.tsx` (queries by role/name) is unaffected.

## Update 2026-07-23 — account slot extracted to AccountMenu
- The private `AccountArea`/`UserMenu` moved to `shared/ui/AccountMenu.tsx` so the
  CinemaStudio editor's own top bar (`modules/Cinema/CinemaEditorHeader`) can render the
  IDENTICAL account affordance without importing across `modules/*`. `AppShell` now renders
  `<AccountMenu ... />` and imports its `AccountUser` type (re-exported as `AppShellUser`).
- `AppShell` lost its `useState`/`Skeleton` usage (they went with the menu). Nav, wordmark,
  balance and lang are untouched — roles/labels unchanged, so `AppShell.test.tsx` is unaffected.

## Update 2026-07-24 — mascot logo mark in the wordmark lockup
- The home-link wordmark now leads with a **circular mascot mark** — a 24px
  `<img src="/logo-mark.png">` (the openCreate mascot, from `apps/web/public/`),
  `rounded-full object-cover ring-1 ring-white/10`, `alt=""` + `aria-hidden` so the
  accessible name stays "openCreate" (the text, not the image, carries it). The Link
  became `inline-flex items-center gap-2` to seat mark + word + portal cursor on one row.
- **Why**: the brand now has a real visual identity (mascot + "openCreate." wordmark,
  generated by the owner). The header is where the app logo lives, so the mark belongs
  here — it turns the plain text wordmark into a proper logo lockup. The `/logo-mark.png`
  asset (and the favicon/PWA icon pack + `manifest.webmanifest` in `public/`) are all
  cropped from the same mascot source; `index.html` wires the favicons/manifest/theme-color.
- Presentational-only still holds: it's a static `public/` asset via `<img>`, no
  `modules/*` import. Roles/labels unchanged, so `AppShell.test.tsx` (queries by
  role/name) is unaffected — the image is nameless by design.

## Update 2026-07-30 — openCreator (agent) entry
- Nav gains ONE `/creator` typed `Link` (`t('nav.creator')` — "Agent" / «Агент»), with the
  identical `navLinkClass` + `activeProps`/`inactiveProps` as every sibling. Nav order is
  now create · **creator** · library · cinema · canvas · assets · templates · souls · entities · pricing.
- **Placed immediately after Create**: the two answer the same question from opposite
  ends — `/create` is the manual pen, `/creator` is the agent you hand the whole task to.
  The adjacency is the hint that one is the autonomous form of the other. Putting it next
  to the workbenches (cinema/canvas/assets) would imply a multi-step editor the user
  drives; openCreator drives itself after one budget confirmation.
- The whole change is the one `<Link>`. `AppShell` stays presentational and imports
  nothing from `modules/*`; the route (`_shell.creator.tsx`) does the auth guard and the
  module composition. Roles/labels unchanged, so `AppShell.test.tsx` is unaffected.

## Commits
- 01c29ab 2026-07-06 feat(web): app shell with nav, balance, language switch
- a04eac7 2026-07-06 feat(web): pricing page with per-model credit table (pricing anchor → typed Link)
- 3305c12 2026-07-07 restyle(web): editorial design system — tokens, fonts, ui kit
- 252ab38 2026-07-07 restyle(web): terminal design system — cosmic void tokens, jetbrains mono, specimen pills + docs

## Update 2026-07-30 — Canvas Mode entry
- Nav gains ONE `/canvas` typed `Link` (`t('nav.canvas')`), identical
  `className={navLinkClass}` + `activeProps`/`inactiveProps` to every sibling. Nav
  order is now create · library · cinema · **canvas** · assets · templates · souls ·
  entities · pricing.
- **Placed beside Cinema, before Assets**, for the reason the Assets entry gives:
  `/canvas` is a WORKBENCH you enter from a library and keep working in, not a
  one-shot generation. Without this link the route exists but is unreachable —
  a shipped feature with no door.
- The whole change is the one `<Link>`; `AppShell` stays presentational and still
  imports nothing from `modules/*`. Roles/labels unchanged, so `AppShell.test.tsx`
  (queries by role/name) is unaffected.

## Update 2026-07-31 — Style Studio entry
- Nav gains ONE `/styles` typed `Link` (`t('nav.styles')` — "Styles" / «Стили»),
  identical `navLinkClass` + `activeProps`/`inactiveProps` to every sibling. Nav
  order is now create · creator · library · cinema · canvas · assets · templates ·
  souls · entities · **styles** · pricing.
- **Placed with the two LIBRARIES (after entities), not with Create**: a style is a
  reusable thing you build once and then PICK everywhere, exactly like a character
  or an entity. After the registry migration (ADR style-studio D5) the styles a
  user writes on this page appear in every style picker in the app, which makes it
  a library screen rather than a creation surface.
- The whole change is the one `<Link>`; `AppShell` stays presentational and imports
  nothing from `modules/*` — the route (`_shell.styles.tsx`) does the auth guard and
  the module composition. Roles/labels unchanged, so `AppShell.test.tsx` is unaffected.
