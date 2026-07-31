# routes.ts (styles) — AI component doc

> AI-facing sidecar for `modules/styles/routes.ts`. Created 2026-07-31. Keep this in sync with the code on every change.

## Purpose
HTTP layer for the style registry (ADR `docs/wiki/decisions/style-studio.md` D4). Thin by design,
mirroring `canvas/routes.ts`: require a session, parse with the shared contracts schema, delegate to
the service, map the two domain errors onto the `ApiError` envelope.

## What it does (for an AI reader)
- Responsibilities: authentication gate, wire validation, error→status mapping. No business rules —
  ownership, the builtin refusal and the preview citation all live in the service.
- Endpoints (all require a session; all answer 401 without one):
  - `GET /api/styles` → `{ items: Style[] }` — builtin + the caller's own, one list. **This is what
    every style picker renders from**, replacing the SPA's static `STYLE_PRESETS` import.
  - `POST /api/styles` → `201 Style`
  - `PATCH /api/styles/:id` → `200 Style`
  - `DELETE /api/styles/:id` → `204`
  - `POST /api/styles/:id/references` `{ dataUri }` → `201 Style` (the UPDATED style)
  - `DELETE /api/styles/:id/references/:refId` → `200 Style` (the updated style)
- Inputs → Outputs: `createStyleInputSchema` / `updateStyleInputSchema` /
  `addStyleReferenceInputSchema` bodies → `Style` DTOs. Invalid body → `400 validation_failed` with
  the first zod issue's message.
- Side effects: none of its own; delegates to the service.

## Dependencies
- Imports / depends on: `@opencreate/contracts` (input schemas), `./service`, fastify.
- Used by: `app.ts` (`registerStyleRoutes`).

## Diagram
```mermaid
flowchart LR
  C[SPA] -->|"GET /api/styles"| RT[style routes]
  C -->|"POST/PATCH/DELETE"| RT
  RT -->|requireUser| A[session]
  C -->|"POST/DELETE :id/references"| RT
  RT -->|zod parse| V["createStyleInput /<br/>updateStyleInput /<br/>addStyleReferenceInput"]
  RT --> S[styleService]
  S -->|StyleNotFoundError| E404["404 not_found<br/>(foreign == missing)"]
  S -->|StyleValidationError| E400["400 validation_failed<br/>(builtin / bad preview)"]
```

## Key decisions / gotchas
- **No rate bucket beyond the global one.** This is free text CRUD writing a handful of short
  columns and spending nothing. The one expensive thing a style leads to — its preview — is an
  ordinary `POST /api/generations`, which carries the money path's own limits and charges.
- **404 vs 400 is meaningful here**: `StyleNotFoundError` → 404 with a fixed message so a foreign id
  and a missing one are indistinguishable; `StyleValidationError` → 400 and carries its message,
  because those refusals (a builtin, a bad preview citation) describe an action the caller may fix.
- `GET /api/styles` is the ONLY read: there is no `GET /api/styles/:id`, because the list is small,
  bounded by one user's rows plus seven, and every consumer wants the whole thing.
- **The reference endpoints are a deliberate mirror of the shot-reference ones** (ADR A4), down to
  the status codes: `201` for an upload that created something, `200` for a detach that returns the
  survivors, and the **whole updated style** as the body of both — so the constructor re-renders its
  thumbnail strip from one response with no client-side merge to get wrong.
- **svg is refused twice, on purpose.** `addStyleReferenceInputSchema` rejects it at the wire (along
  with oversize payloads) and `storage.saveDataUri` → `parseImageDataUri` re-guards the disk. Defence
  in depth: the wire check is what produces a clean message, the disk check is what is actually
  load-bearing if a future caller bypasses the route.
- **An unknown `refId` DELETE answers 200, not 404** — the service treats it as a no-op, so a retried
  delete is safe and idempotent.
- Reference uploads get no rate bucket of their own either: the cap (3 per style) plus the wire's
  byte limit are the real ceiling.

## Commits
- _no commit yet_
