# AppShell.tsx — AI component doc

> AI-facing sidecar for `AppShell.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Application chrome (header + canvas) for in-app screens: wordmark, primary nav
(Create/Library/Pricing), credits balance slot, EN/RU LangSwitch, account area.
Presentational by design so `shared/ui` never imports `modules/*`.

## What it does (for an AI reader)
- Responsibilities: render the fixed header row and the `bg-paper` page canvas;
  decide between three account-area states (session pending → `Skeleton`,
  signed out → primary-styled Sign in `Link`, signed in → `UserMenu` with a
  Sign out `menuitem`).
- Public API / exports / props / endpoints: `AppShell`, `AppShellProps`,
  `AppShellUser`. Props: `user: AppShellUser | null`, `isSessionPending?`,
  `onSignOut: () => void`, `balanceSlot?: ReactNode`, `children`.
- Inputs → Outputs: injected session snapshot + slots → header chrome around
  `children`. Nav uses TanStack `Link` with color ONLY in
  `activeProps`/`inactiveProps` (avoids dueling `text-*` utilities).
- Side effects (I/O, network, state): none — only local `isOpen` state for the
  disclosure menu (Escape + click-away close, same pattern as `Modal`).

## Dependencies
- Imports / depends on: `@tanstack/react-router` (`Link`), `react-i18next`,
  `shared/ui/LangSwitch`, `shared/ui/Skeleton`.
- Used by: `routes/_shell.tsx` (the pathless layout route that injects session
  state from `modules/Auth` and `BalanceChip` from `modules/Credits`).

## Diagram
```mermaid
flowchart LR
  ShellRoute[routes/_shell.tsx] -- "user / onSignOut / balanceSlot" --> AppShell[AppShell.tsx]
  AppShell --> Nav[Links: create · library · pricing]
  AppShell --> LS[LangSwitch]
  AppShell --> Acct{account area}
  Acct -- pending --> Sk[Skeleton]
  Acct -- signed out --> SignIn[Sign in Link → /login]
  Acct -- signed in --> Menu[UserMenu → onSignOut]
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

## Commits
- 01c29ab 2026-07-06 feat(web): app shell with nav, balance, language switch
- a04eac7 2026-07-06 feat(web): pricing page with per-model credit table (pricing anchor → typed Link)
