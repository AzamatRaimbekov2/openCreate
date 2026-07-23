// apps/web/src/modules/Cinema/model/timelineClock.ts
// The timeline CLOCK — the one source of truth for "where are we in the film"
// (NLE Phase 1, ADR docs/wiki/decisions/cinema-nle-timeline.md). Every surface
// hangs off it: the ruler/tiles turn a click into `seek(ms)`, the playhead cursor
// renders at `playheadMs`, and the preview resolves `clipAtMs(playheadMs)` to a
// frame. It is deliberately UI-PURE — no React, no timers, no DOM — so the
// transport arithmetic unit-tests with zero render; the rAF playback loop lives in
// PreviewPlayer and only ever calls `seek`/`pause` here.
//
// A singleton is intentional (the /cinema/$filmId editor is the only mount): the
// preview and the timeline read the SAME store instance, which is how selection
// and the playhead stay unified without prop-drilling. FilmEditor `reset()`s it on
// film change so a stale playhead never carries across films.
import { create } from 'zustand'

// ZOOM = px per second, the shared scale the tiles/ruler/cursor all render on
// (Phase 2). The default matches the Phase-1 constant so nothing shifts on load.
// The bounds let a 10-minute film fit a laptop strip (≈1.7 px/s) at one end and a
// single clip fill the screen (240 px/s) at the other.
export const DEFAULT_PX_PER_SEC = 24
export const MIN_PX_PER_SEC = 1
export const MAX_PX_PER_SEC = 240
// Multiplicative step per zoom-in/out click — a geometric ramp feels even.
const ZOOM_FACTOR = 1.5

const clampZoom = (pxPerSec: number): number =>
  Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, pxPerSec))

export type TimelineClockState = {
  // Absolute playback position from the film start, in milliseconds.
  playheadMs: number
  // Whether the rAF playback loop (owned by PreviewPlayer) is running.
  isPlaying: boolean
  // The timeline scale in px per second (Phase 2). One number, so the tiles, the
  // ruler and the playhead cursor cannot drift apart.
  zoom: number
  // Jump the playhead. Clamped to [0, durationMs] when a duration is given; with
  // no duration it is clamped only at zero (the caller owns the upper bound).
  seek: (ms: number, durationMs?: number) => void
  play: () => void
  pause: () => void
  toggle: () => void
  // Set the scale directly (clamped) — e.g. from a future zoom slider.
  setZoom: (pxPerSec: number) => void
  zoomIn: () => void
  zoomOut: () => void
  // Compute the scale that makes the whole film fit `containerWidthPx`. A pure
  // computation: the caller measures the strip and passes both numbers, so the
  // store stays DOM-free. An empty film or width falls back to the default.
  fitToWindow: (filmMs: number, containerWidthPx: number) => void
  // Back to the start, paused, default zoom — when the editor opens a new film.
  reset: () => void
}

export const useTimelineClock = create<TimelineClockState>((set, get) => ({
  playheadMs: 0,
  isPlaying: false,
  zoom: DEFAULT_PX_PER_SEC,
  seek: (ms, durationMs) => {
    const floored = Math.max(0, ms)
    const clamped = durationMs === undefined ? floored : Math.min(durationMs, floored)
    set({ playheadMs: clamped })
  },
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  toggle: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setZoom: (pxPerSec) => set({ zoom: clampZoom(pxPerSec) }),
  zoomIn: () => set({ zoom: clampZoom(get().zoom * ZOOM_FACTOR) }),
  zoomOut: () => set({ zoom: clampZoom(get().zoom / ZOOM_FACTOR) }),
  fitToWindow: (filmMs, containerWidthPx) => {
    if (filmMs <= 0 || containerWidthPx <= 0) {
      set({ zoom: DEFAULT_PX_PER_SEC })
      return
    }
    set({ zoom: clampZoom(containerWidthPx / (filmMs / 1000)) })
  },
  reset: () => set({ playheadMs: 0, isPlaying: false, zoom: DEFAULT_PX_PER_SEC }),
}))
