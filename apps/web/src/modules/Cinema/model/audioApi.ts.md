# audioApi.ts — AI component doc

> AI-facing sidecar for `audioApi.ts`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

Server-state mutations that attach/remove a film's audio tracks (music bed or
voiceover). The audio generation itself is made through the ordinary generation
lifecycle; this only links the finished result to the film.

## What it does (for an AI reader)

- Responsibilities: link an existing audio generation to a film; remove a track.
- Public API / exports:
  - `useAddAudio()` → POST `/api/films/:filmId/audio` (`AddFilmAudioInput` → `FilmAudio`)
  - `useDeleteAudio()` → DELETE `/api/films/:filmId/audio/:audioId`
- Inputs → Outputs: variables carry `filmId` (+ `input`/`audioId`).
- Side effects: network; invalidate `['film', filmId]`.

## Dependencies

- Imports: `@tanstack/react-query`, contract types, `shared/libs/apiClient`,
  `filmKey` from `./filmsApi`.
- Used by: `AudioTracks`.

## Diagram

```mermaid
flowchart LR
  A[AudioTracks] --> H[audioApi hooks]
  H -->|POST/DELETE| API[/api/films/:id/audio]
  H -->|invalidate| C[(cache: film:id → audio)]
```

## Key decisions / gotchas

- Audio is NOT a new subsystem (ADR §1): the track references a `generation.type
  = 'audio'` row. These hooks never create audio — they only wire the reference.

## Commits

- _no commit yet_
