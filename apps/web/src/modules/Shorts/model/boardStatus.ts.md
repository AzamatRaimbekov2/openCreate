# boardStatus.ts — AI model doc

> AI-facing sidecar for `model/boardStatus.ts`. Created 2026-08-20. Keep in sync with the code.

## Purpose
Derives what a beat's chip says. ADR shorts-studio §2 declined a batch table, job rows and a status
machine on the grounds that `shot.generation_id` already answers "does this clip exist?" — so this
file IS the batch's progress model, and it stores nothing.

## What it does (for an AI reader)
- Public API: `isGeneratedBeat`, `beatGenerationId`, `beatState`, `batchProgress`; types
  `BatchRunItem`, `BatchRunItemStatus`, `BeatState`, `BeatStatus`, `BatchProgress`.
- Inputs → Outputs: a shot + an optional run-store item + an optional cached generation →
  `{ status, errorCode }`.
- Side effects: none. Pure.

## The precedence rule (the whole point)
1. The shared `['generation', id]` CACHE is the truth about a clip that exists.
2. The run store supplies ONLY what the cache cannot know: `queued`, `submitting`, and a submit that
   failed before any generation row existed (`insufficient_credits` above all — nothing to poll).
3. The cache OVERRULES the store, always. The store outlives the run, so after a remount it may
   still call a beat "queued" whose clip landed. A board that contradicts the media it shows is
   worse than one that forgets.

## Dependencies
- Imports: `Generation`, `Shot` types only.
- Used by: `RunBoard.tsx`, and `useBatchRun.ts` (for `isGeneratedBeat` and the `BatchRunItem` type —
  the dependency runs runner → model, never the reverse).

## Key decisions / gotchas
- `isGeneratedBeat` tests `modelId !== null && prompt` rather than "index i of template.beats said
  generated": it survives a user editing the film in Cinema before running the batch.
- `beatGenerationId` falls back to the run item because `shot.generationId` is one request behind
  the POST that created the clip; without it the beat blinks back to "draft" next to a paid clip.
- A cited generation whose cache entry has not arrived reads `processing`, never `draft` — never
  offer to pay again for a clip that exists.
- `batchProgress` excludes `free` beats: a title card is not progress.

## Commits
- _no commit yet_
