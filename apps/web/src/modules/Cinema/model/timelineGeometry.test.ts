// apps/web/src/modules/Cinema/model/timelineGeometry.test.ts
// The pure timeline math: total film length, and which clip a playhead sits on
// (with the offset within it). This is what drives the preview's
// `video.currentTime`, so the boundary rules — clip edges, playhead at 0 and at
// the exact end, an empty film — are pinned here with no render and no network.
import {
  chooseTickIntervalSec,
  clipAtMs,
  clipBoundariesMs,
  dropIndexForX,
  followScroll,
  formatTimecode,
  moveItem,
  msToPx,
  nextBoundaryMs,
  prevBoundaryMs,
  pxToMs,
  rulerTicks,
  shotWidthPx,
  snapMs,
  splitTargetAt,
  totalDurationMs,
  windowFromEdge,
} from './timelineGeometry'

// A minimal shot: only what the geometry reads (id + durationMs).
const shot = (id: string, durationMs: number) => ({ id, durationMs })

describe('totalDurationMs', () => {
  it('is zero for an empty film', () => {
    expect(totalDurationMs([])).toBe(0)
  })

  it('sums every shot duration', () => {
    expect(totalDurationMs([shot('a', 4000), shot('b', 6000), shot('c', 5000)])).toBe(15_000)
  })
})

describe('clipAtMs', () => {
  const shots = [shot('a', 4000), shot('b', 6000), shot('c', 5000)] // total 15000

  it('returns null for an empty film', () => {
    expect(clipAtMs([], 0)).toBeNull()
  })

  it('puts the playhead at zero on the first clip, offset zero', () => {
    expect(clipAtMs(shots, 0)).toEqual({ shotId: 'a', offsetMs: 0, index: 0 })
  })

  it('clamps a negative playhead onto the first clip', () => {
    expect(clipAtMs(shots, -1000)).toEqual({ shotId: 'a', offsetMs: 0, index: 0 })
  })

  it('reports the offset within the current clip', () => {
    expect(clipAtMs(shots, 2500)).toEqual({ shotId: 'a', offsetMs: 2500, index: 0 })
  })

  it('gives an exact clip boundary to the NEXT clip, offset zero', () => {
    // 4000 is the end of clip a and the start of clip b — b owns it.
    expect(clipAtMs(shots, 4000)).toEqual({ shotId: 'b', offsetMs: 0, index: 1 })
  })

  it('resolves a position inside a middle clip', () => {
    // a [0,4000) · b [4000,10000) · c [10000,15000). 7000 is 3000 into b.
    expect(clipAtMs(shots, 7000)).toEqual({ shotId: 'b', offsetMs: 3000, index: 1 })
    // 12000 is 2000 into the last clip c.
    expect(clipAtMs(shots, 12_000)).toEqual({ shotId: 'c', offsetMs: 2000, index: 2 })
  })

  it('lets the LAST clip own the exact film end', () => {
    // At 15000 (the very end) the playhead rests on c's last frame, not off the film.
    expect(clipAtMs(shots, 15_000)).toEqual({ shotId: 'c', offsetMs: 5000, index: 2 })
  })

  it('clamps a playhead beyond the end onto the last clip end', () => {
    expect(clipAtMs(shots, 99_999)).toEqual({ shotId: 'c', offsetMs: 5000, index: 2 })
  })
})

describe('msToPx / pxToMs', () => {
  it('maps milliseconds to pixels on a px-per-second scale', () => {
    expect(msToPx(2000, 24)).toBe(48)
  })

  it('round-trips a pixel offset back to milliseconds', () => {
    expect(pxToMs(48, 24)).toBe(2000)
  })
})

// Phase 2 ruler + auto-scroll geometry — all pure, so the zoom-dependent tick
// interval, the timecode format and the follow-scroll decision are pinned here.
describe('formatTimecode', () => {
  it('formats milliseconds as m:ss', () => {
    expect(formatTimecode(0)).toBe('0:00')
    expect(formatTimecode(5000)).toBe('0:05')
    expect(formatTimecode(65_000)).toBe('1:05')
    expect(formatTimecode(600_000)).toBe('10:00')
  })
})

describe('chooseTickIntervalSec', () => {
  it('picks a denser interval when zoomed in', () => {
    // At 24 px/s a 5s interval keeps labels ~120px apart (readable).
    expect(chooseTickIntervalSec(24)).toBe(5)
    // Zoomed in (100 px/s), 1s labels fit comfortably.
    expect(chooseTickIntervalSec(100)).toBe(1)
  })

  it('picks a coarser interval when zoomed out', () => {
    // At 1 px/s labels must be far apart or they overlap.
    expect(chooseTickIntervalSec(1)).toBeGreaterThanOrEqual(60)
  })
})

describe('rulerTicks', () => {
  it('emits tick times from 0 to the total at the chosen interval', () => {
    // 12s film at 24 px/s → 5s interval → 0, 5000, 10000.
    expect(rulerTicks(12_000, 24)).toEqual([0, 5000, 10_000])
  })

  it('is empty-safe for a zero-length film', () => {
    expect(rulerTicks(0, 24)).toEqual([0])
  })
})

describe('followScroll', () => {
  it('recenters when the cursor runs past the right band', () => {
    // cursor at 900 in a 1000px view starting at 0 → past 85% → recenter to 400.
    expect(followScroll(900, 0, 1000)).toBe(400)
  })

  it('returns null while the cursor is comfortably in view', () => {
    expect(followScroll(500, 0, 1000)).toBeNull()
  })

  it('recenters (never negative) when the cursor is left of the view', () => {
    expect(followScroll(50, 400, 1000)).toBe(0)
  })

  it('does nothing when the view is unmeasured (width 0)', () => {
    expect(followScroll(900, 0, 0)).toBeNull()
  })
})

// ── Phase 3: on-timeline editing (trim / reorder / snap) — pure decisions ──

const BOUNDS = { minDurationMs: 500, maxDurationMs: 60_000 }

describe('windowFromEdge', () => {
  const orig = { trimStartMs: 1000, durationMs: 4000 } // out-point = 5000

  it('moves the OUT-point (duration) when the end edge is dragged', () => {
    expect(windowFromEdge(orig, 'end', 7000, BOUNDS)).toEqual({ trimStartMs: 1000, durationMs: 6000 })
  })

  it('moves the IN-point and keeps the out-point fixed when the start edge is dragged', () => {
    // start → 2000 keeps out at 5000 → duration 3000.
    expect(windowFromEdge(orig, 'start', 2000, BOUNDS)).toEqual({ trimStartMs: 2000, durationMs: 3000 })
  })

  it('never lets the start edge cross below zero, extending duration to the out-point', () => {
    // Dragging the in-point before 0 clamps start to 0 → duration = out (5000).
    expect(windowFromEdge(orig, 'start', -500, BOUNDS)).toEqual({ trimStartMs: 0, durationMs: 5000 })
  })

  it('enforces the minimum duration on the end edge', () => {
    // Dragging the out-point back to the in-point floors duration at min.
    expect(windowFromEdge(orig, 'end', 1000, BOUNDS)).toEqual({ trimStartMs: 1000, durationMs: 500 })
  })

  it('enforces the minimum duration on the start edge', () => {
    // Dragging the in-point up to the out-point floors duration at min.
    expect(windowFromEdge(orig, 'start', 6000, BOUNDS)).toEqual({ trimStartMs: 4500, durationMs: 500 })
  })

  it('caps duration at the maximum on the end edge', () => {
    expect(windowFromEdge({ trimStartMs: 0, durationMs: 4000 }, 'end', 999_999, BOUNDS)).toEqual({
      trimStartMs: 0,
      durationMs: 60_000,
    })
  })
})

describe('snapMs', () => {
  it('snaps to the nearest target within the px threshold', () => {
    // threshold 8px at 24 px/s ≈ 333ms; 5100 is 100ms from 5000 → snaps.
    expect(snapMs(5100, [0, 5000, 12_000], 24, 8)).toBe(5000)
  })

  it('leaves the value untouched when no target is within the threshold', () => {
    expect(snapMs(5100, [0, 12_000], 24, 8)).toBe(5100)
  })

  it('is a no-op with no targets', () => {
    expect(snapMs(5100, [], 24, 8)).toBe(5100)
  })
})

describe('clipBoundariesMs', () => {
  it('lists zero then each cumulative clip end', () => {
    expect(clipBoundariesMs([{ id: 'a', durationMs: 4000 }, { id: 'b', durationMs: 6000 }])).toEqual([
      0, 4000, 10_000,
    ])
  })
})

describe('shotWidthPx', () => {
  it('scales by zoom above the clickable floor', () => {
    expect(shotWidthPx(5000, 24)).toBe(120)
  })

  it('never renders below the minimum tile width', () => {
    expect(shotWidthPx(500, 1)).toBe(56) // 0.5px scaled → floored to 56
  })
})

describe('dropIndexForX', () => {
  const widths = [100, 100, 100] // three 100px tiles → boundaries 0,100,200,300

  it('keeps the slot while the pointer is in a tile first half', () => {
    expect(dropIndexForX(widths, 40)).toBe(0) // tile 0, before its 50px midpoint
    expect(dropIndexForX(widths, 120)).toBe(1) // tile 1 (100–200), before its 150 midpoint
  })

  it('advances to the next slot past a tile midpoint', () => {
    expect(dropIndexForX(widths, 160)).toBe(2) // past tile 1 midpoint (150)
    expect(dropIndexForX(widths, 260)).toBe(2) // tile 2, clamped to the last slot
  })

  it('clamps to the last slot past the end', () => {
    expect(dropIndexForX(widths, 9999)).toBe(2)
  })
})

describe('moveItem', () => {
  it('moves an item forward', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item backward', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('returns an unchanged copy for an out-of-range index', () => {
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })
})

// ── Phase 4: split-at-playhead + boundary navigation — pure decisions ──

describe('splitTargetAt', () => {
  const shots = [{ id: 'a', durationMs: 4000 }, { id: 'b', durationMs: 6000 }] // 0–4000, 4000–10000

  it('returns the shot under the playhead and the offset from its own start', () => {
    // 6000 is 2000 into shot b.
    expect(splitTargetAt(shots, 6000)).toEqual({ shotId: 'b', atMs: 2000 })
  })

  it('is null on a clip boundary (nothing to split there)', () => {
    expect(splitTargetAt(shots, 4000)).toBeNull() // b's start — atMs would be 0
    expect(splitTargetAt(shots, 0)).toBeNull()
    expect(splitTargetAt(shots, 10_000)).toBeNull() // the film end
  })

  it('is null for an empty film', () => {
    expect(splitTargetAt([], 1000)).toBeNull()
  })
})

describe('prevBoundaryMs / nextBoundaryMs', () => {
  const bounds = [0, 4000, 10_000]

  it('finds the previous boundary strictly before the playhead', () => {
    expect(prevBoundaryMs(bounds, 5000)).toBe(4000)
    expect(prevBoundaryMs(bounds, 4000)).toBe(0) // 4000 is not strictly before itself
    expect(prevBoundaryMs(bounds, 0)).toBe(0)
  })

  it('finds the next boundary strictly after the playhead', () => {
    expect(nextBoundaryMs(bounds, 5000)).toBe(10_000)
    expect(nextBoundaryMs(bounds, 4000)).toBe(10_000)
    expect(nextBoundaryMs(bounds, 11_000)).toBe(10_000) // clamps to the last boundary
  })
})
