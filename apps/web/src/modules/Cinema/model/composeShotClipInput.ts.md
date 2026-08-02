# composeShotClipInput.ts — AI component doc

> AI-facing sidecar for `composeShotClipInput.ts`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

The single, pure translation from a timeline `Shot` + a chosen `CatalogModel`
into the `POST /api/generations` body that renders that shot's clip. It is the
one place CinemaStudio decides what the model is asked to make.

## What it does (for an AI reader)

- Responsibilities: forward the shot's own `prompt` and its **structured**
  `promptPreset` untouched (the server composes — ADR §3, never flatten
  fragments into `prompt`); resolve the request `aspectRatio` against the shot's
  own override, then the film canvas; snap a video model's `duration` to an
  offered option.
- Public API / exports:
  - `composeShotClipInput(shot, model, filmAspect): CreateGenerationInput`
  - `nearestDuration(options, seconds): number`
- Inputs → Outputs: `(Shot, CatalogModel, AspectRatio)` → `CreateGenerationInput`.
- Side effects: none — pure, synchronous, no I/O.

## Dependencies

- Imports: types only from `@opencreate/contracts`
  (`AspectRatio`, `CatalogModel`, `CreateGenerationInput`, `Shot`).
- Used by: `shotGeneration.ts` (`useGenerateShotClip` builds the request body
  from it); tested by `composeShotClipInput.test.ts`.

## Diagram

```mermaid
flowchart LR
  SHOT[Shot: prompt + promptPreset + durationMs + aspectRatio?] --> C[composeShotClipInput]
  MODEL[CatalogModel: type/aspectRatios/durationOptions] --> C
  ASPECT[film aspectRatio] --> C
  C --> OUT[CreateGenerationInput\nmodelId, prompt, aspectRatio,\npromptPreset?, duration?]
```

## Key decisions / gotchas

- The preset stays **structured** to the wire: `prompt` is exactly the user's
  words, `promptPreset` travels as the id object. The server composes so
  "Regenerate"/"Edit" read back what the user wrote (ADR §3).
- `promptPreset` key is OMITTED when the shot has none — `exactOptionalPropertyTypes`
  forbids `promptPreset: undefined`, and an absent preset composes to the plain
  prompt anyway.
- Aspect precedence: `shot.aspectRatio ?? filmAspect`, then the model's first
  ratio when that target is not on the model's list (`noUncheckedIndexedAccess`
  fallback → the target). The render scales/pads every shot to the canvas
  regardless, so the override only decides the shape of the RAW clip.
- `duration` is video-only; snapped to the nearest `durationOptions` value because
  a video model prices per that list and rejects arbitrary seconds.

## Update 2026-07-15 — native generation audio
- Video branch forwards `audio: true` ONLY when the shot asks AND the model
  declares `nativeAudio` — a stale shot flag must never 400 a request (the API
  refuses unsupported audio before charging) or double a price on a model that
  cannot sing. Covered by three new cases in composeShotClipInput.test.ts.

## Update 2026-08-02 — per-shot aspect override
- `shot.aspectRatio` (nullable, new in contracts) now wins over `filmAspect`.
  `null` = "no opinion" → today's behaviour exactly (inherit the film canvas), so
  every existing shot composes byte-identically. An override the model does not
  offer takes the same rescue path an unsupported film aspect always took.
- Set from the composer's new per-shot aspect control (`PresetPickers`), and
  carried into the generate-time `draftShot` by `ShotInspector`.

## Commits

- _no commit yet_
