# index.ts — AI module doc

> AI-facing sidecar for `modules/Shorts/index.ts`. Created 2026-08-20. Keep in sync.

## Purpose
Public API of the Shorts module. Routes import ONLY `ShortsStudio` from here; `model/` and
`components/` are private.

## The module in one sentence (ADR shorts-studio)
"A template that instantiates a 9:16 film, plus a batch runner over its shots." The template half
already existed, so nearly everything here is the runner plus the two surfaces it needs.

## Seams out of this module
- `modules/Templates` — TemplateCard, TierPicker, useTemplates, useBalance.
- `modules/Cinema` — composeShotClipInput, shouldRetrySubmit, useShotGeneration(s).
- The shared query cache — `['film', id]`, `['films']`, `['generation', id]`, `['me']`.
Nothing imports Shorts back; the dependency runs one way. The CATALOG is not fetched here — it
arrives from the route as `models`.

## Commits
- _no commit yet_
