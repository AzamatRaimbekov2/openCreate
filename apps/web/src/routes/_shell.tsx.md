# _shell.tsx — AI component doc

> AI-facing sidecar for `_shell.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Pathless TanStack layout route (`/_shell`) that renders the AppShell chrome
around every in-app screen (`_shell.create.tsx`, `_shell.library.tsx`,
`_shell.pricing.tsx`). URLs are unchanged — pathless layouts add no segment.

## What it does (for an AI reader)
- Responsibilities: the ONLY place that wires the presentational `AppShell` to
  the modules — reads the session via `useAuthSession` (modules/Auth), injects
  `BalanceChip` (modules/Credits) as `balanceSlot`, and implements sign-out.
- Public API / exports / props / endpoints: `Route` (file-route export only).
- Inputs → Outputs: better-auth session snapshot → `AppShell` props
  (`user` normalized to `{name: string|null, email}`, `isSessionPending`,
  `onSignOut`, `balanceSlot`) with `<Outlet />` as children.
- Side effects (I/O, network, state): `handleSignOut` calls better-auth
  `signOut()`, then `queryClient.clear()` (personal caches — me, generations,
  transactions — must not survive the account) and navigates to `/`.

## Dependencies
- Imports / depends on: `@tanstack/react-router` (`Outlet`, `createFileRoute`,
  `useNavigate`), `@tanstack/react-query` (`useQueryClient`), `modules/Auth`
  (`signOut`, `useAuthSession`), `modules/Credits` (`BalanceChip`),
  `shared/ui` (`AppShell`).
- Used by: routeTree.gen (parent of `/_shell/create`, `/_shell/library`,
  `/_shell/pricing`).

## Diagram
```mermaid
flowchart LR
  Root[__root.tsx providers] --> Shell[_shell.tsx layout]
  Auth[modules/Auth session] --> Shell
  Credits[modules/Credits BalanceChip] --> Shell
  Shell -- props+slots --> AppShell[shared/ui AppShell]
  AppShell --> Outlet[Outlet: create · library · pricing]
  Shell -- signOut → clear cache → navigate '/' --> Home[/]
```

## Key decisions / gotchas
- The plan (Task 18) implied module imports inside `shared/ui/AppShell.tsx`;
  that breaks the "shared never imports modules" law, so the wiring lives here
  — routes are the composition layer and MAY import any module's public API.
- `balanceSlot` is only passed when signed in: mounting BalanceChip signed out
  would fire a guaranteed-401 `/api/me`; the shell shows "Sign in" instead.
- Landing (`index.tsx`) and `login.tsx` stay OUTSIDE this layout on purpose —
  they are standalone paper screens (design.md §9).

## Commits
- _pending: feat(web): app shell with nav, balance, language switch_
