# storyboardApi.ts — AI component doc

> AI-facing sidecar for `storyboardApi.ts`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

Turn a script into draft shots via the LLM storyboard endpoint. The drafts are
written server-side with `generationId = null` (nothing generated or charged);
this hook just reloads the film so they appear on the timeline.

## What it does (for an AI reader)

- Responsibilities: POST the script, then invalidate the film detail.
- Public API / exports: `useStoryboard()` → POST `/api/films/:filmId/storyboard`
  (`CreateStoryboardInput` → `{items: Shot[]}`).
- Inputs → Outputs: variables carry `filmId` + `input` (script/style/shotCount).
- Side effects: network; invalidate `['film', filmId]`.

## Dependencies

- Imports: `@tanstack/react-query`, contract types, `shared/libs/apiClient`,
  `filmKey` from `./filmsApi`.
- Used by: `StoryboardModal`.

## Diagram

```mermaid
flowchart LR
  SM[StoryboardModal] --> H[useStoryboard]
  H -->|POST script| API[/storyboard]
  API -->|draft shots| H --> C[(invalidate film:id)]
```

## Key decisions / gotchas

- Key-gated on the API (`ANTHROPIC_API_KEY` optional). When unset the endpoint
  answers `provider_error`; the caller catches the `ApiClientError` and shows the
  "storyboard isn't configured" inline notice — it never blocks boot or the page.

## Commits

- _no commit yet_
