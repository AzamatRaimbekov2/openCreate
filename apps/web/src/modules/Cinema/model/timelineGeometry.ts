// apps/web/src/modules/Cinema/model/timelineGeometry.ts
// The PURE timeline math (NLE Phase 1) — no React, no network, no DOM, so every
// boundary rule is unit-tested with zero render. It answers the two questions the
// clock cannot answer alone:
//   * how long is the film (sum of shot durations), and
//   * which clip does a playhead sit on, and how far INTO it.
// `clipAtMs` is what drives the preview's `video.currentTime`: a frame-accurate
// seek, not a sequential index. The px<->ms helpers are a clean seam for Phase 2
// (they take `pxPerSec` as a parameter, so no zoom constant leaks in here).

// The geometry reads only these two fields, so it stays decoupled from the full
// `Shot` contract (a structural subtype — the same shape `shotStartMs` uses).
export type TimelineShot = {
  id: string
  durationMs: number
}

// Which clip the playhead occupies, plus the offset WITHIN it (what the preview
// sets as `video.currentTime`) and the shot's index (for the `n / N` footer).
export type ClipAt = {
  shotId: string
  offsetMs: number
  index: number
}

// The film's total length — a simple sum. Crossfade overlaps are a render-time
// subtlety, not a timeline-geometry one (the tiles/ruler use the same sum).
export function totalDurationMs(shots: readonly TimelineShot[]): number {
  return shots.reduce((sum, shot) => sum + shot.durationMs, 0)
}

// Resolve a playhead to its clip. Each shot owns the half-open interval
// `[start, end)`; the LAST shot also owns its exact end point, so a playhead
// parked at the film's very end rests on the last frame rather than falling off
// the film. A negative playhead clamps onto the first clip; a playhead past the
// end clamps onto the last clip's end. `null` only for an empty film.
export function clipAtMs(shots: readonly TimelineShot[], playheadMs: number): ClipAt | null {
  if (shots.length === 0) return null
  const clamped = Math.max(0, playheadMs)
  let start = 0
  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index]
    if (shot === undefined) continue
    const end = start + shot.durationMs
    const isLast = index === shots.length - 1
    // Non-last shots own [start, end); the last also owns the exact `end`.
    if (clamped < end || (isLast && clamped <= end)) {
      return { shotId: shot.id, offsetMs: clamped - start, index }
    }
    start = end
  }
  // Beyond the film end → the last frame of the last shot.
  const lastIndex = shots.length - 1
  const last = shots[lastIndex]
  if (last === undefined) return null
  return { shotId: last.id, offsetMs: last.durationMs, index: lastIndex }
}

// Phase-2 seam: map time to timeline pixels on a px-per-second scale, and back.
// Isolated here so the zoom (`pxPerSec`) can vary without touching call sites.
export function msToPx(ms: number, pxPerSec: number): number {
  return (ms / 1000) * pxPerSec
}

export function pxToMs(px: number, pxPerSec: number): number {
  return (px / pxPerSec) * 1000
}

// ── Phase 2: ruler ticks + auto-scroll ──────────────────────────────────────

// Format an absolute ms position as a `m:ss` timecode for the ruler labels.
export function formatTimecode(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// "Nice" label intervals (seconds) the ruler steps through — a 1-2-5 ladder so
// the numbers stay readable (0:05, 0:10, 0:30, 1:00, …) at any zoom.
const NICE_INTERVALS_SEC = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600] as const
// Aim for at least this much room between labels so they never collide.
const MIN_LABEL_GAP_PX = 64

// Pick the smallest nice interval whose on-screen width clears the label gap.
// Denser when zoomed in (small px→large interval), coarser when zoomed out.
export function chooseTickIntervalSec(pxPerSec: number): number {
  for (const interval of NICE_INTERVALS_SEC) {
    if (interval * pxPerSec >= MIN_LABEL_GAP_PX) return interval
  }
  return NICE_INTERVALS_SEC[NICE_INTERVALS_SEC.length - 1] ?? 600
}

// The tick times (ms) from 0 through the film total at the chosen interval — the
// ruler labels each with `formatTimecode`. Always includes 0 (a zero-length film
// still shows its origin tick).
export function rulerTicks(totalMs: number, pxPerSec: number): number[] {
  const stepMs = chooseTickIntervalSec(pxPerSec) * 1000
  const ticks: number[] = []
  for (let ms = 0; ms <= totalMs; ms += stepMs) ticks.push(ms)
  return ticks
}

// ── Phase 3: on-timeline editing (trim / reorder / snap) — pure decisions ───
// Pointer-drag has no layout in jsdom, so ALL the editing DECISIONS live here as
// pure functions (the `followScroll` precedent): the hook measures + drives the
// pointer, these compute the result, the component wires them to the mutations.

// A shot's playback window: it plays `[trimStartMs, trimStartMs + durationMs)`.
export type TrimWindow = {
  trimStartMs: number
  durationMs: number
}

// The smallest a tile may render (px) so it stays clickable at any zoom.
export const MIN_TILE_WIDTH_PX = 56

// A tile's rendered width — the time-proportional width, floored so a very short
// clip (or a zoomed-out timeline) never collapses to an unclickable sliver. Used
// by BOTH the lane render and the reorder hit-testing, so they cannot drift.
export function shotWidthPx(durationMs: number, zoom: number): number {
  return Math.max(Math.round(msToPx(durationMs, zoom)), MIN_TILE_WIDTH_PX)
}

// Recompute a shot's trim window from the ABSOLUTE new position of the edge being
// dragged (the caller adds the pointer delta and snaps BEFORE calling this, so
// this function is only bounds + geometry). The END edge moves the out-point
// (duration only); the START edge moves the in-point while the out-point stays
// fixed — bounded so duration stays within [min, max] and the start never goes
// below zero. Returns integers (the schema wants ints).
export function windowFromEdge(
  orig: TrimWindow,
  edge: 'start' | 'end',
  edgeMs: number,
  opts: { minDurationMs: number; maxDurationMs: number },
): TrimWindow {
  const outMs = orig.trimStartMs + orig.durationMs
  if (edge === 'start') {
    const minStart = Math.max(0, outMs - opts.maxDurationMs)
    const maxStart = outMs - opts.minDurationMs
    const start = Math.min(maxStart, Math.max(minStart, Math.round(edgeMs)))
    return { trimStartMs: start, durationMs: outMs - start }
  }
  const duration = Math.min(
    opts.maxDurationMs,
    Math.max(opts.minDurationMs, Math.round(edgeMs) - orig.trimStartMs),
  )
  return { trimStartMs: orig.trimStartMs, durationMs: duration }
}

// Snap a candidate ms to the nearest target (clip boundary or the playhead) when
// it falls within `thresholdPx` (converted to ms via the zoom); else leave it.
export function snapMs(
  valueMs: number,
  targetsMs: readonly number[],
  zoom: number,
  thresholdPx: number,
): number {
  const thresholdMs = pxToMs(thresholdPx, zoom)
  let best = valueMs
  let bestDist = thresholdMs
  for (const target of targetsMs) {
    const dist = Math.abs(target - valueMs)
    if (dist <= bestDist) {
      bestDist = dist
      best = target
    }
  }
  return best
}

// Cumulative clip boundaries (ms): 0, then each shot's end — the snap targets for
// trimming and reordering (the caller appends the playhead).
export function clipBoundariesMs(shots: readonly TimelineShot[]): number[] {
  const bounds = [0]
  let acc = 0
  for (const shot of shots) {
    acc += shot.durationMs
    bounds.push(acc)
  }
  return bounds
}

// Which slot a reorder pointer x (relative to the lane's left) drops into, given
// each tile's rendered width. Midpoints: crossing half a tile advances the slot.
// Clamped to a valid index.
export function dropIndexForX(tileWidthsPx: readonly number[], pointerX: number): number {
  let x = 0
  for (let index = 0; index < tileWidthsPx.length; index += 1) {
    const width = tileWidthsPx[index] ?? 0
    if (pointerX < x + width / 2) return index
    x += width
  }
  return Math.max(0, tileWidthsPx.length - 1)
}

// Pure array move (remove at `from`, insert at `to`); an out-of-range index
// returns an unchanged copy — the caller then skips the reorder POST.
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return next
  next.splice(to, 0, moved)
  return next
}

// ── Phase 4: split-at-playhead + boundary navigation — pure decisions ───────

// The shot the playhead can be SPLIT at, or null. `atMs` is the offset from the
// shot's OWN start (the split endpoint's contract), so it is exactly `clipAtMs`'s
// offset. Null on a boundary (offset 0 or the full duration — nothing to cut) or
// an empty film, so the caller disables the control there.
export function splitTargetAt(
  shots: readonly TimelineShot[],
  playheadMs: number,
): { shotId: string; atMs: number } | null {
  const at = clipAtMs(shots, playheadMs)
  if (at === null) return null
  const shot = shots[at.index]
  if (shot === undefined) return null
  if (at.offsetMs <= 0 || at.offsetMs >= shot.durationMs) return null
  return { shotId: shot.id, atMs: at.offsetMs }
}

// The nearest clip boundary strictly BEFORE the playhead (Shift+← jump); 0 when
// there is none. `boundaries` is `clipBoundariesMs(shots)`.
export function prevBoundaryMs(boundaries: readonly number[], ms: number): number {
  let best: number | null = null
  for (const boundary of boundaries) {
    if (boundary < ms && (best === null || boundary > best)) best = boundary
  }
  return best ?? 0
}

// The nearest clip boundary strictly AFTER the playhead (Shift+→ jump); clamps to
// the last boundary (the film end) when there is none beyond.
export function nextBoundaryMs(boundaries: readonly number[], ms: number): number {
  let best: number | null = null
  for (const boundary of boundaries) {
    if (boundary > ms && (best === null || boundary < best)) best = boundary
  }
  return best ?? boundaries[boundaries.length - 1] ?? 0
}

// How far the playhead may run into the view before we recenter (a lead band so
// the cursor is never pinned to the edge during play).
const FOLLOW_RIGHT_BAND = 0.85
const FOLLOW_LEFT_BAND = 0.1

// Auto-scroll decision (pure, so it unit-tests without a real scroll box): given
// the cursor's x, the current scroll offset and the viewport width, return the
// new scrollLeft that recenters the cursor — or null to leave the scroll alone
// (cursor already comfortably in view, or the view is unmeasured, width 0).
export function followScroll(
  cursorPx: number,
  viewLeft: number,
  viewWidth: number,
): number | null {
  if (viewWidth <= 0) return null
  const rightBound = viewLeft + viewWidth * FOLLOW_RIGHT_BAND
  const leftBound = viewLeft + viewWidth * FOLLOW_LEFT_BAND
  if (cursorPx > rightBound || cursorPx < leftBound) {
    return Math.max(0, cursorPx - viewWidth / 2)
  }
  return null
}
