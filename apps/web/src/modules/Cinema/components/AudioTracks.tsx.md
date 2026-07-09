# AudioTracks.tsx — AI component doc

> AI-facing sidecar for `AudioTracks.tsx`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

The secondary audio rail: add a music bed or voiceover (generate the audio clip +
link it as a track, in one action) and list existing tracks with remove.

## What it does (for an AI reader)

- Responsibilities: compose the film's tracklist; open a per-kind mini-form.
- Public API / exports: `AudioTracks`,
  `AudioTracksProps = { filmId, audio, audioModels }`.
- Inputs → Outputs: form → `useAddAudioTrack`; row remove → `useDeleteAudio`.
- Side effects: `useAddAudioTrack` (POST generation + POST audio), `useDeleteAudio`.

## Dependencies

- Imports: `react` (`useState`), `react-i18next`, `shared/ui` (`Button`, `Select`),
  `useAddAudioTrack`/`useDeleteAudio`, icons.
- Used by: `FilmEditor`.

## Diagram

```mermaid
flowchart TD
  ADD[add music / voiceover] --> FORM[prompt + voice]
  FORM --> T[useAddAudioTrack → gen + link]
  LIST[FilmAudio[]] --> ROW[track rows]
  ROW -->|remove| DEL[useDeleteAudio]
```

## Key decisions / gotchas

- Music model vs tts model are picked by `audioKind` from the passed `audioModels`
  (from the catalog). Voices come from the tts model's `voices`.
- The link happens while the audio generation is still processing; the track
  resolves when the generation completes.

## Commits

- _no commit yet_
