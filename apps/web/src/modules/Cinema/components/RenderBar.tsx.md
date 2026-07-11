# RenderBar.tsx — AI component doc

> AI-facing sidecar for `RenderBar.tsx`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

The export control: POST a render (202 processing), poll it, then show a Download
link (succeeded) or a calm localized retry (failed). Owns the active render id.

v4: an ACTION BAR, not a panel — one glass row (caption + the green pill) that
only grows when a render is running or has finished.

## What it does (for an AI reader)

- Responsibilities: kick + poll + surface a render; disable while in flight.
- Public API / exports: `RenderBar`, `RenderBarProps = { filmId, canRender }`.
- Inputs → Outputs: click → render lifecycle → download link / retry.
- Side effects: `useCreateRender`, `useRender` (poll).

## Dependencies

- Imports: `react` (`useState`), `react-i18next`, `shared/ui`
  (`Button`, `Card`, `ErrorState`, `Progress`), `useCreateRender`/`useRender`,
  `DownloadIcon`.
- Used by: `FilmEditor` (under the stage).
- Tested by: `RenderBar.test.tsx`.

## Diagram

```mermaid
flowchart TD
  BTN[Render mp4] --> CR[useCreateRender] --> ID[renderId]
  ID --> UR[useRender poll 2s]
  UR -->|processing| PROG[Progress + %]
  UR -->|succeeded| DL[Download link /media/:id.mp4]
  UR -->|failed| ERR[ErrorState retry]
```

## Key decisions / gotchas

- An untitled `Card` (glass) holding one row. A TITLED card here would have given
  the export button the same visual weight as the video above it — the exact
  flatness v4 set out to fix. The `<section aria-label>` still names the region.
- Glass, not steel: it floats over the stage's dark well and the specular top
  edge of `GLASS_SURFACE` is what separates the two.
- Never renders the raw `errorMessage` — failed shows a localized calm retry.
- Disabled when `canRender` is false (no shots) or while processing — the honest
  client mirror of the API's concurrency cap.

## Commits

- _no commit yet_
