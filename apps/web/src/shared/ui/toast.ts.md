# toast.ts — AI component doc

> AI-facing sidecar for `toast.ts`. Created 2026-07-21. Keep this in sync with the code on every change.

## Purpose
The imperative toast API — how non-React code (event handlers, mutation callbacks, effect bodies) raises a notification without a hook. It writes to `toastStore` via `getState()`; the `<Toaster>` renders whatever lands there.

## What it does (for an AI reader)
- Responsibilities: expose `toast.error/info/success(options)` and `toast.dismiss(id)`. Bind the `variant` per method so callers pass only `{ title, description?, action?, durationMs?, dedupeKey? }`.
- Public API / exports / props / endpoints: the `toast` object. `error/info/success` return the created toast's `string` id; `dismiss(id)` removes it.
- Inputs → Outputs: `ToastOptions` (ToastInput minus `variant`) → a pushed toast + its id.
- Side effects (I/O, network, state): mutates the shared `useToastStore` (add/remove). No DOM, no network.

## Dependencies
- Imports / depends on: `./toastStore` (`useToastStore`, `ToastInput`).
- Used by: `modules/Cinema/model/shotFailureToast` (generation-failure toasts), `modules/Cinema/model/promptEnhance` (soften/retry degrade toast), any future non-React notifier. Exported through `shared/ui/index.ts`.

## Diagram
```mermaid
flowchart LR
  CALLER[event handler / mutation cb] --> API[toast.error/info/success]
  API -->|getState().push| STORE[(useToastStore)]
  STORE --> TOASTER[Toaster renders]
```

## Key decisions / gotchas
- Reads the store via `getState()` (NOT a hook) so it works outside React render — the whole point of an imperative API.
- The variant is chosen by METHOD, not passed in options, so call sites read as intent (`toast.error(...)`).
- Returns the id so an async action that resolves elsewhere can `toast.dismiss(id)`.

## Commits
- (pending) feat(web): toast system + generation-failure surfacing, soften/retry, transient retry
