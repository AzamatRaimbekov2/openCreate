# index.ts — AI component doc

> AI-facing sidecar for `modules/Generator/index.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose

Public API of the Generator module — the single legal import point
(`import { GeneratorPanel } from 'modules/Generator'`).

## What it does (for an AI reader)

- Responsibilities: re-export the module's public surface; nothing else.
- Public API / exports: `GeneratorPanel` only.
- Inputs → Outputs: import from `'modules/Generator'` → the panel component.
- Side effects: none.

## Dependencies

- Imports: `./components/GeneratorPanel`.
- Used by: `routes/create.tsx`.

## Diagram

```mermaid
flowchart LR
  R[routes/create.tsx] -->|import 'modules/Generator'| IDX[index.ts] --> GP[GeneratorPanel]
```

## Key decisions / gotchas

- Deliberately minimal: the store, catalog query, and mutation are module
  internals — routes must not reach the draft state directly, and the Gallery
  talks to the Generator only through the shared query cache (`['generations']`, `['me']`).

## Commits

- (pending) feat(web): generator module — prompt, model/aspect/duration, i2v upload, cost
