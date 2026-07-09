# PreviewPlayer.tsx — AI component doc

> AI-facing sidecar for `PreviewPlayer.tsx`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

A simple, robust sequential DOM player (NOT an encoder): plays the shots' media
back-to-back on one canvas — video advances on `ended`, an image/title slate on a
`durationMs` timer. An APPROXIMATION; the server render is authoritative.

## What it does (for an AI reader)

- Responsibilities: build a playlist from shots + their generations; play it.
- Public API / exports: `PreviewPlayer`, `PreviewPlayerProps = { shots, filmAspect }`.
- Inputs → Outputs: `Shot[]` → a playing `<video>/<img>/slate` sequence.
- Side effects: `useShotGenerations` (read cache); `setTimeout` per non-video step;
  imperative `video.play()/pause()`.

## Dependencies

- Imports: `react` (`useEffect/useMemo/useRef/useState`), `react-i18next`,
  `useShotGenerations`, `PlayIcon`/`PauseIcon`.
- Used by: `FilmEditor`.

## Diagram

```mermaid
flowchart TD
  SHOTS[Shot[]] --> PL[playlist: media | slate]
  PL --> CUR[current step]
  CUR -->|video ended| NEXT[goNext]
  CUR -->|timer durationMs| NEXT
  NEXT -->|past end| STOP[stop + rewind]
```

## Key decisions / gotchas

- No polling here — the mounted `ShotThumb`s own the `['generation', id]` poll;
  this only reads the fresher answer from cache.
- No crossfade compositing / wasm — deliberately (ADR). The caveat line says the
  preview is approximate.

## Commits

- _no commit yet_
