# PreviewPlayer.tsx — AI component doc

> AI-facing sidecar for `PreviewPlayer.tsx`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

The editor's STAGE — a PLAYHEAD-DRIVEN preview (NLE Phase 1). It reads the ONE
timeline clock, resolves which clip the playhead sits on (`clipAtMs`), mounts that
clip's `<video>/<img>/slate`, and seeks the video to the offset within it —
frame-accurate, so clicking a tile or scrubbing the ruler makes the picture jump.
An APPROXIMATION; the server ffmpeg render is authoritative (the caveat line says
so). NOT the old sequential index player.

## What it does (for an AI reader)

- Responsibilities: read the clock → resolve the current clip → seek/play it.
- Public API / exports: `PreviewPlayer`, `PreviewPlayerProps = { shots }`
  (the `filmAspect` prop was removed in v7.1; there is NO local `index`/`isPlaying`
  state any more — the clock owns both).
- Inputs → Outputs: `Shot[]` + `useTimelineClock.playheadMs` → the clip at that
  time, seeked to its offset.
- Side effects: `useShotGenerations` (read cache); a `requestAnimationFrame`
  PLAY loop that advances `playheadMs` (cancelled on pause/unmount); imperative
  `video.currentTime`/`play()`/`pause()`.

## Dependencies

- Imports: `react` (`useEffect/useMemo/useRef`), `react-i18next`, `Card` from
  `shared/ui`, `useShotGenerations`, `useTimelineClock`, `clipAtMs`/
  `totalDurationMs` from `../model/timelineGeometry`, `PlayIcon`/`PauseIcon`.
- Used by: `FilmEditor` (the stage column). Shares the clock with `Timeline`.

## Diagram

```mermaid
flowchart TD
  CLOCK[useTimelineClock playheadMs] --> AT[clipAtMs → shotId, offsetMs, index]
  AT --> STEP[resolve clip: video | image | slate]
  STEP -->|seek, not playing| CT[video.currentTime = offsetMs/1000]
  PLAY[isPlaying] --> RAF[rAF loop advances playheadMs]
  RAF -->|boundary| AT
  RAF -->|film end| PARK[seek end + pause]
  RAF -->|cleanup| CANCEL[cancelAnimationFrame on pause/unmount]
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

- be4b490 2026-07-15 feat(cinema): плотный редактор — компактный шелл, таймлайн v6, композер-док, звук генерации

## Update 2026-07-22 — sound on play (NLE Phase 2)
The current clip is now AUDIBLE while playing: the play/pause effect sets
`video.muted = !isPlaying` imperatively (not a JSX `muted` prop, which React would
re-assert over the per-frame re-renders), so a wan/Seedance clip plays its own
soundtrack while playing and stays silent while paused/scrubbing. The user's play
gesture is the activation that lets unmuted playback start. Pinned by a test
(`video.muted` toggles false on play, true on pause). CORNER CASE (documented, not
papered over): when a clip SWAPS mid-play at a boundary, the fresh `<video>` calls
`play()` unmuted relying on the page's existing user activation — if activation has
expired the browser may keep it muted; the clip still plays (silently), never
crashes. Full film-audio-track mixing (music/voiceover lanes synced to the
playhead) is a documented Phase-2b seam, NOT this change.

## Update 2026-07-22 — playhead-driven (NLE Phase 1, v8)
The sequential auto-player is GONE. The component no longer holds its own `index`
or `isPlaying`; it reads `useTimelineClock` and resolves the current clip via
`clipAtMs(shots, playheadMs)`. Fixes two live bugs: (1) clicking a shot tile now
jumps the preview (the preview follows the shared playhead, not a private index);
(2) scrubbing/seeking is possible at all. On a SEEK (playhead moved while paused)
the `<video>.currentTime` is pulled to `offsetMs/1000` (frame-accurate); PLAY is a
`requestAnimationFrame` loop advancing `playheadMs` by real elapsed time, swapping
the `<video key>` at each clip boundary and parking+pausing at the film end. The
rAF is cancelled on pause AND unmount (the tested no-leak contract). Images/slates
"play" for free — the rAF walks the playhead through their duration and `clipAtMs`
moves on. Dropped `onEnded`/`setTimeout` (the rAF is the master clock, faithful to
each shot's `durationMs`, which the render uses). Tests: `PreviewPlayer.test.tsx`.

## Update 2026-07-22 — preview FILLS the stage (v7.1)
The `max-h-[42svh]` cap on the canvas box left a dead black band between a small
preview and the tracks (owner report). The canvas box is now `flex-1 min-h-0` and
the Card/section are flex columns, so the preview grows to whatever height the
stage column leaves after the header + render bar; `object-contain` letterboxes
the film's real aspect inside. Consequences: `ASPECT_CLASS` and the `filmAspect`
prop are REMOVED (the box is aspect-agnostic now — the media keeps its own ratio),
and `FilmEditor` no longer passes `filmAspect` to `<PreviewPlayer>`. Verified live
in-browser: no gap between preview and timeline.
