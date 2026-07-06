# types.ts — Runware wire types

> AI-facing sidecar for `types.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Type-only module describing the Runware REST wire shapes the client sends and receives, so `client.ts` and the generation service share one vocabulary with zero runtime cost.

## What it does (for an AI reader)
- Responsibilities: name the request/result shapes for image inference, video submission and polling.
- Public API / exports:
  - `RunwareImageRequest` / `RunwareImageResult` — sync image task input/output (`imageURL`, optional `seed`/`cost`/`NSFWContent`).
  - `RunwareVideoRequest` — async video task input; `frameImages` carries the image→video input frame(s), which Runware nests under `inputs`.
  - `RunwarePollResult` — discriminated union on `status` (`processing` | `success` | `error`) so callers must handle all three poll outcomes.
- Inputs → Outputs: types only; no values.
- Side effects: none (compiles away entirely under `verbatimModuleSyntax`).

## Dependencies
- Imports / depends on: nothing.
- Used by: `integrations/runware/client.ts`, `modules/generations/service.ts` (Task 10), `test/runware-client.test.ts`.

## Diagram
```mermaid
flowchart LR
  T[types.ts] -.shapes.-> CL[client.ts fetch envelope]
  T -.shapes.-> SVC[generations/service.ts]
  CL <-->|JSON tasks| RW[(Runware /v1)]
```

## Key decisions / gotchas
- Field names mirror the Runware task schema exactly (`positivePrompt`, `taskUUID`, `NSFWContent`) so requests can be spread straight into the task envelope without a mapping layer.
- Optional props are declared `?: T | undefined` (not just `?: T`): this repo compiles with `exactOptionalPropertyTypes`, and the client builds these objects from `unknown` JSON fields that legitimately produce `undefined`.

## Commits
- _pending_ — feat(api): runware REST client (imageInference, videoInference, getResponse)
