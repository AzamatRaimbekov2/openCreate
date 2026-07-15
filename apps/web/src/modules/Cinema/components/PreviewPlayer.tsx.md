# PreviewPlayer.tsx — AI component doc

> AI-facing sidecar for `PreviewPlayer.tsx`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

A simple, robust sequential DOM player (NOT an encoder): plays the shots' media
back-to-back on one canvas — video advances on `ended`, an image/title slate on a
`durationMs` timer. An APPROXIMATION; the server render is authoritative.

It is also the editor's STAGE — the hero surface of `/cinema/$filmId`.

## What it does (for an AI reader)

- Responsibilities: build a playlist from shots + their generations; play it.
- Public API / exports: `PreviewPlayer`, `PreviewPlayerProps = { shots, filmAspect }`.
- Inputs → Outputs: `Shot[]` → a playing `<video>/<img>/slate` sequence.
- Side effects: `useShotGenerations` (read cache); `setTimeout` per non-video step;
  imperative `video.play()/pause()`.

## Dependencies

- Imports: `react` (`useEffect/useMemo/useRef/useState`), `react-i18next`,
  `Card` from `shared/ui`, `useShotGenerations`, `PlayIcon`/`PauseIcon`.
- Used by: `FilmEditor` (the stage column).

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

- v4 surface: ONE `Card surface="well" padding="none" className="overflow-hidden"`.
  Media runs edge to edge to the card's rounded corners; the transport controls
  hang off it as a hairline footer, so the player reads as a single object.
- It carries NO visible heading, only `aria-label` on its `<section>`: a hero that
  announces itself is a panel, not a stage. Screen readers still get the name.
- No polling here — the mounted `ShotThumb`s own the `['generation', id]` poll;
  this only reads the fresher answer from cache.
- No crossfade compositing / wasm — deliberately (ADR). The caveat line says the
  preview is approximate.

## Update 2026-07-15 — v5 canvas cap
- The canvas is capped at `max-h-[42svh]`: uncapped, a 16:9 canvas in the ~1000px stage
  column was ~580px tall and alone pushed export + audio below the fold. When the cap
  bites, object-contain letterboxes the media inside the dark well (like a real monitor
  with an off-shape source). Transport strip px-4 py-3→px-3 py-1.5, play size-10→size-8.

## Commits

- _no commit yet_
