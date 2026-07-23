// apps/web/src/modules/Cinema/model/timelineClock.test.ts
// The timeline clock is the ONE source of truth for playback position, so its
// arithmetic is unit-tested with zero render: seek must clamp, and the transport
// flags must flip predictably. A drift here desynchronises every surface that
// hangs off the clock (preview, playhead cursor), so it is pinned directly.
import {
  DEFAULT_PX_PER_SEC,
  MAX_PX_PER_SEC,
  MIN_PX_PER_SEC,
  useTimelineClock,
} from './timelineClock'

// A singleton store leaks state between cases; reset to the defaults each time.
beforeEach(() => {
  useTimelineClock.getState().reset()
})

describe('useTimelineClock', () => {
  it('starts parked at zero and paused', () => {
    const state = useTimelineClock.getState()
    expect(state.playheadMs).toBe(0)
    expect(state.isPlaying).toBe(false)
  })

  it('seeks to an in-range position verbatim', () => {
    useTimelineClock.getState().seek(2500, 10_000)
    expect(useTimelineClock.getState().playheadMs).toBe(2500)
  })

  it('clamps a negative seek up to zero', () => {
    useTimelineClock.getState().seek(-500, 10_000)
    expect(useTimelineClock.getState().playheadMs).toBe(0)
  })

  it('clamps a seek past the duration down to the duration', () => {
    useTimelineClock.getState().seek(999_999, 10_000)
    expect(useTimelineClock.getState().playheadMs).toBe(10_000)
  })

  it('clamps only at zero when no duration is given', () => {
    useTimelineClock.getState().seek(999_999)
    expect(useTimelineClock.getState().playheadMs).toBe(999_999)
    useTimelineClock.getState().seek(-1)
    expect(useTimelineClock.getState().playheadMs).toBe(0)
  })

  it('plays, pauses and toggles the transport flag', () => {
    useTimelineClock.getState().play()
    expect(useTimelineClock.getState().isPlaying).toBe(true)
    useTimelineClock.getState().pause()
    expect(useTimelineClock.getState().isPlaying).toBe(false)
    useTimelineClock.getState().toggle()
    expect(useTimelineClock.getState().isPlaying).toBe(true)
    useTimelineClock.getState().toggle()
    expect(useTimelineClock.getState().isPlaying).toBe(false)
  })

  it('reset returns to zero and paused', () => {
    useTimelineClock.getState().seek(5000, 10_000)
    useTimelineClock.getState().play()
    useTimelineClock.getState().reset()
    const state = useTimelineClock.getState()
    expect(state.playheadMs).toBe(0)
    expect(state.isPlaying).toBe(false)
  })
})

// Phase 2: the clock also owns ZOOM (px per second) — the ADR reserved `zoom` on
// the clock so the tiles, ruler and cursor share one scale. The store's job is the
// arithmetic: clamp, the zoom-in/out factor, and the fit-to-window computation.
describe('useTimelineClock — zoom', () => {
  it('starts at the default px-per-second scale', () => {
    expect(useTimelineClock.getState().zoom).toBe(DEFAULT_PX_PER_SEC)
  })

  it('clamps setZoom to the sane min/max', () => {
    useTimelineClock.getState().setZoom(999)
    expect(useTimelineClock.getState().zoom).toBe(MAX_PX_PER_SEC)
    useTimelineClock.getState().setZoom(0.001)
    expect(useTimelineClock.getState().zoom).toBe(MIN_PX_PER_SEC)
  })

  it('zooms in and out by a fixed factor', () => {
    useTimelineClock.getState().setZoom(24)
    useTimelineClock.getState().zoomIn()
    expect(useTimelineClock.getState().zoom).toBe(36) // 24 × 1.5
    useTimelineClock.getState().setZoom(24)
    useTimelineClock.getState().zoomOut()
    expect(useTimelineClock.getState().zoom).toBe(16) // 24 / 1.5
  })

  it('clamps a zoom-in at the maximum', () => {
    useTimelineClock.getState().setZoom(MAX_PX_PER_SEC)
    useTimelineClock.getState().zoomIn()
    expect(useTimelineClock.getState().zoom).toBe(MAX_PX_PER_SEC)
  })

  it('fits the whole film into the container width', () => {
    // A 10s film in a 1000px strip → 1000 / 10 = 100 px per second.
    useTimelineClock.getState().fitToWindow(10_000, 1000)
    expect(useTimelineClock.getState().zoom).toBe(100)
  })

  it('clamps fit-to-window for a very long film in a narrow strip', () => {
    // 10 min (600s) in 300px → 0.5 px/s, below the floor → clamp to the min.
    useTimelineClock.getState().fitToWindow(600_000, 300)
    expect(useTimelineClock.getState().zoom).toBe(MIN_PX_PER_SEC)
  })

  it('falls back to the default when the film or width is empty', () => {
    useTimelineClock.getState().setZoom(80)
    useTimelineClock.getState().fitToWindow(0, 1000)
    expect(useTimelineClock.getState().zoom).toBe(DEFAULT_PX_PER_SEC)
  })

  it('reset restores the default zoom too', () => {
    useTimelineClock.getState().setZoom(120)
    useTimelineClock.getState().reset()
    expect(useTimelineClock.getState().zoom).toBe(DEFAULT_PX_PER_SEC)
  })
})
