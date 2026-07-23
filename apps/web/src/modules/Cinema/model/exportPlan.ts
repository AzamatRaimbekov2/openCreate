// apps/web/src/modules/Cinema/model/exportPlan.ts
// The PURE per-frame timeline for the client-side export (ADR:
// docs/wiki/decisions/client-side-export.md). It re-implements the SERVER render's
// timeline math (apps/api/src/modules/films/render.ts) in the browser so the mp4
// the client encodes matches the one ffmpeg produced: concat by order, per-shot
// trim `[trimStartMs, +durationMs]`, and crossfade transitions that OVERLAP (an
// xfade shortens the total by the transition, and both shots are visible + blended
// through the fade). No WebCodecs, no canvas — this is the tested correctness core;
// the browser adapter just decodes/composites/encodes what this plan describes.
import type { AspectRatio, Shot } from '@opencreate/contracts'

// The output fps — a fixed constant matching the server render (service.ts uses
// `fps: 30`). Frame timestamps derive from the index, never the wall clock, so the
// encode is deterministic (the renderTurntable precedent).
export const EXPORT_FPS = 30

// Canvas size per aspect — MUST match render.ts `CANVAS` so a client export is the
// same resolution as the server one. 720p-class.
const CANVAS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1280, height: 720 },
  '1:1': { width: 720, height: 720 },
  '9:16': { width: 720, height: 1280 },
}
export function canvasFor(aspect: AspectRatio): { width: number; height: number } {
  return CANVAS[aspect]
}

// A crossfade is clamped to strictly inside both neighbouring shots (render.ts uses
// `- 0.05` seconds); below this it degrades to a hard cut. Milliseconds here.
const CROSSFADE_FLOOR_MS = 50

// One shot placed on the OUTPUT timeline. `startMs` already accounts for crossfade
// overlap (a crossfaded shot starts BEFORE the previous one ends). `crossfadeMs` is
// the fade INTO this segment (0 for the first shot or a hard cut).
export type SegmentSpan = {
  shotId: string
  startMs: number
  durationMs: number
  trimStartMs: number
  crossfadeMs: number
}

// Fold the shots into the overlapping output timeline — the same left-fold
// render.ts does, so the total (and every start) matches the server. A hard cut
// starts where the accumulated stream ends; a crossfade starts `cross` earlier.
export function buildSegmentTimeline(shots: readonly Shot[]): {
  segments: SegmentSpan[]
  totalMs: number
} {
  const segments: SegmentSpan[] = []
  let acc = 0 // accumulated visible length of the timeline so far
  shots.forEach((shot, index) => {
    const prevLen = acc
    let cross = 0
    if (index > 0 && shot.transition === 'crossfade') {
      cross = Math.min(shot.transitionMs, prevLen - CROSSFADE_FLOOR_MS, shot.durationMs - CROSSFADE_FLOOR_MS)
      if (cross < 0) cross = 0 // clamped below the floor → a hard cut
    }
    const startMs = index === 0 ? 0 : prevLen - cross
    segments.push({ shotId: shot.id, startMs, durationMs: shot.durationMs, trimStartMs: shot.trimStartMs, crossfadeMs: cross })
    acc = startMs + shot.durationMs
  })
  return { segments, totalMs: acc }
}

// One output frame: which shot to draw, the source seek within its clip, and — when
// inside a crossfade — the OUTGOING shot to draw beneath and the blend `alpha` of
// the incoming shot on top (a linear cross-dissolve = ffmpeg xfade fade).
export type FramePlanEntry = {
  frameIndex: number
  timestampMicros: number
  shotId: string
  // Seek within the shot's source clip = trimStartMs + timeline offset. Ignored for
  // image/title shots (drawn as a still/slate by the adapter).
  sourceMs: number
  fade: { fromShotId: string; fromSourceMs: number; alpha: number } | null
}

export type ExportPlan = {
  width: number
  height: number
  fps: number
  frameCount: number
  durationMs: number
  frames: FramePlanEntry[]
}

// Which segment index owns `timeMs` — the LAST whose start is ≤ it (starts increase,
// so a boundary lands on the new segment at offset 0). −1 for an empty timeline.
function segmentAt(segments: readonly SegmentSpan[], timeMs: number): number {
  let found = -1
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (segment !== undefined && segment.startMs <= timeMs) found = index
    else break
  }
  return found
}

// Build the full frame plan. Frame count is the overlapping total (from the fold)
// at `fps`; each frame resolves to its shot + source offset + optional fade.
export function exportPlan(shots: readonly Shot[], aspect: AspectRatio, fps: number = EXPORT_FPS): ExportPlan {
  const { width, height } = canvasFor(aspect)
  const { segments, totalMs } = buildSegmentTimeline(shots)
  const frameCount = Math.round((totalMs / 1000) * fps)

  const frames: FramePlanEntry[] = []
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const timeMs = (frameIndex / fps) * 1000
    const current = segmentAt(segments, timeMs)
    const segment = segments[current]
    if (segment === undefined) continue
    const sourceMs = segment.trimStartMs + (timeMs - segment.startMs)
    let fade: FramePlanEntry['fade'] = null
    // Inside this segment's crossfade-in window, the previous segment is still
    // playing beneath and this one fades in (alpha 0→1).
    if (segment.crossfadeMs > 0 && current > 0 && timeMs < segment.startMs + segment.crossfadeMs) {
      const previous = segments[current - 1]
      if (previous !== undefined) {
        fade = {
          fromShotId: previous.shotId,
          fromSourceMs: previous.trimStartMs + (timeMs - previous.startMs),
          alpha: (timeMs - segment.startMs) / segment.crossfadeMs,
        }
      }
    }
    frames.push({
      frameIndex,
      timestampMicros: Math.floor((frameIndex * 1_000_000) / fps),
      shotId: segment.shotId,
      sourceMs,
      fade,
    })
  }

  return { width, height, fps, frameCount, durationMs: totalMs, frames }
}
