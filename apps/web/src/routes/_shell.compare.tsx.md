# _shell.compare.tsx — hidden /compare page

> AI-facing sidecar for `_shell.compare.tsx`. Created 2026-07-29. Keep this in sync with the code on every change.

## Purpose

The hidden model-evaluation page (`/compare`, inside the AppShell layout):
one prompt → three contenders in parallel (FLUX dev + Nano Banana Pro via the
production Runware pipeline, Qwen Image Max direct via DeepInfra). Reached by
direct URL only — deliberately absent from all navigation.

## What it does (for an AI reader)

- Responsibilities: composition only — `CompareForm` + one `GenerationPanel`
  per `COMPARE_PROVIDERS` entry in a responsive grid (stack < md, 3 columns
  ≥ md). All behavior lives in `modules/Compare`.
- Public API / exports: `Route` only (router plugin code-split rule).
- Side effects:
  - 1s stopwatch interval while ANY panel is loading (derived `anyLoading`,
    so single-panel retries tick too). The counter RESETS in the event
    handlers (`handleGenerate`/`handleRetry`), never synchronously inside the
    effect — react-hooks/set-state-in-effect. Local state, NOT store — pure
    presentation; a store interval would notify every subscriber needlessly.
  - Unmount cleanup calls `useCompareStore.getState().abort()` — leaving the
    page cancels in-flight renders (they spend provider money) WITHOUT
    clearing settled results, so returning shows the last comparison.

## Dependencies

- Imports / depends on: `@tanstack/react-router`, `modules/Compare` (public
  index only).
- Used by: TanStack Router file-based tree under `_shell`.

## Diagram

```mermaid
flowchart LR
  URL[/compare] --> RT[_shell.compare.tsx]
  RT --> F[CompareForm]
  RT --> P1[GenerationPanel × 3]
  RT --> ST[useCompareStore]
```

## Key decisions / gotchas

- Hidden on purpose: operator tool; no nav link is a feature, not an omission.
- Session note: the page renders signed-out, but every generate call 401s —
  the panels then show the sanitized error state (acceptable for a hidden
  operator tool; no auth guard added).
- English copy hardcoded (no i18n keys): internal utility, same register as
  test fixtures.

## Commits

- _no commit yet_
