# video-adapter.ts — AI component doc

> AI-facing sidecar for `video-adapter.ts`. Created 2026-07-08. Keep this in sync with the code on every change.

## Purpose
Adapts the existing, UNCHANGED `RunwareClient` onto the neutral `VideoProvider` seam so the generation service can route Runware video through the same registry as wan-runpod. All Runware-specific mapping lives here; `client.ts` is never touched.

## What it does (for an AI reader)
- Responsibilities: map `submit`→`submitVideo`, `poll`→`getResponse`, with the neutral noun rename.
- Public API / exports: `createRunwareVideoAdapter(client: RunwareClient): VideoProvider`.
- Inputs → Outputs:
  - `submit(VideoSubmitInput)` — mints a `taskUUID` (idempotency key), calls `client.submitVideo({ taskUUID, positivePrompt, model, width, height, duration, frameImages?, omitSafety? })`, returns `{ providerJobId: taskUUID }`.
  - `poll(id)` — `client.getResponse(id)` → `processing{progress}` | `success{ assetUrl = videoURL ?? imageURL, costUsd = cost, nsfw = NSFWContent }` | `error{message}`.
- Side effects: none of its own (delegates network to the client).

## Dependencies
- Imports / depends on: `./client` (`RunwareClient`), `../video-provider`.
- Used by: `app.ts` (production registry) and `modules/generations/service.ts` (fallback registry when `videoProviders` is not injected).

## Diagram
```mermaid
flowchart LR
  seam[VideoProvider] --> adapter[runware/video-adapter]
  adapter -->|submitVideo/getResponse| client[RunwareClient]
```

## Key decisions / gotchas
- `taskUUID` is generated here (was previously in the service) and returned as the job id — semantics identical to pre-seam: minted before the HTTP call (idempotency), persisted by the service only after submit resolves.
- A `submitVideo` rejection propagates unchanged so the service's guarded fail+refund settles the row.

## Commits
- _no commit yet_
