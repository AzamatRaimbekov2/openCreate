// apps/web/src/modules/Studio3D/model/renderTurntable.ts
// Render a turntable to an mp4 IN THE BROWSER (ADR: the renderer fork, resolved to
// the client-side WebCodecs path).
//
// WHY NOT MediaRecorder — this is the whole design, so it is worth being explicit.
// MediaRecorder captures a canvas in REALTIME: frames are grabbed as they are
// painted, so a GC pause, a slow GPU or a backgrounded tab becomes a DROPPED frame
// (and rAF is throttled on hidden tabs, which freezes the recording outright). Its
// container support is also split: Chrome/Firefox write WebM, Safari writes only MP4.
//
// A VideoEncoder driven at a FIXED TIMESTEP has neither problem. We advance the scene
// by t = i/fps, render, and stamp the frame from its INDEX — never from the wall
// clock. A slow machine takes longer; it does not produce a worse file. Output quality
// is deterministic; only wall-clock time varies. That is what makes shipping the
// client renderer defensible.
//
// Support: Chrome 94+, Firefox 130+, Safari 16.4+ (video-only subset — all a SILENT
// turntable needs). Always gate on isTurntableSupported() and fall back.
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH } from 'mediabunny'
import type { ScenePreset } from '@opencreate/contracts'

// Only the frame grid — the timing helpers must be callable (and testable) without a
// whole preset.
export type TurntableTiming = Pick<ScenePreset['render'], 'fps' | 'durationSec'>

export function turntableFrameCount(timing: TurntableTiming): number {
  return Math.round(timing.fps * timing.durationSec)
}

// Microsecond timestamps, derived from the frame INDEX. See the header: this is the
// property that makes the encode deterministic. Microseconds because that is the
// WebCodecs unit; mediabunny's CanvasSource.add() wants SECONDS, so the loop divides
// by 1e6 at the boundary and the integer grid stays the source of truth.
export function turntableTimestamps(timing: TurntableTiming): number[] {
  const count = turntableFrameCount(timing)
  return Array.from({ length: count }, (_, i) => Math.floor((i * 1_000_000) / timing.fps))
}

export function isTurntableSupported(): boolean {
  return typeof globalThis.VideoEncoder !== 'undefined'
}

// Thrown instead of encoding garbage when the browser has no WebCodecs. The caller
// gates on isTurntableSupported() and offers the server render; this is the backstop.
export class TurntableUnsupportedError extends Error {
  constructor() {
    super('This browser has no WebCodecs VideoEncoder, so the turntable cannot be encoded here.')
    this.name = 'TurntableUnsupportedError'
  }
}

// The encode step, as a PORT. Two reasons it is an interface and not inlined:
//  1. jsdom has no WebCodecs, so the fixed-timestep LOOP (the part that carries the
//     determinism guarantee) could otherwise not be unit-tested at all.
//  2. It keeps the muxer a swappable detail — the loop does not care that today's
//     container is mp4 written by mediabunny.
export type TurntableFrameSink = {
  // Encode whatever is currently on the canvas as the frame at this timestamp.
  // Resolves once the encoder is ready for more (backpressure).
  addFrame: (timestampMicros: number, durationMicros: number) => Promise<void>
  finish: () => Promise<Blob>
  cancel: () => Promise<void>
}

export type TurntableSinkFactory = (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  preset: ScenePreset,
) => Promise<TurntableFrameSink>

// The real sink: H.264 in mp4, via mediabunny (mp4-muxer/webm-muxer are both
// deprecated in its favour). The turntable is SILENT — no audio track. That keeps the
// artifact small and removes a whole class of container surprises.
//
// `frameRate` metadata makes mediabunny SNAP timestamps to the grid, which is the same
// invariant the loop already enforces — belt and braces.
//
// fastStart: 'in-memory' puts the moov atom at the FRONT so the clip can stream. The
// API still re-muxes (+faststart, yuv420p) — that is a GUARANTEE step, not a rescue: a
// Chrome encode may legally produce 4:4:4 or 10-bit, which Safari and QuickTime refuse.
export const createMp4Sink: TurntableSinkFactory = async (canvas, preset) => {
  if (!isTurntableSupported()) throw new TurntableUnsupportedError()

  // The canvas IS the frame: mediabunny takes the video's dimensions from it. A
  // mismatch would silently ship a video that is not the size the preset promised, so
  // fail loudly at frame 0 instead of in the artifact.
  const { width, height, fps } = preset.render
  if (canvas.width !== width || canvas.height !== height) {
    throw new TypeError(
      `Canvas is ${canvas.width}x${canvas.height} but the preset renders ${width}x${height}. Size the canvas to the preset before encoding.`,
    )
  }

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  })
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH })
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()

  return {
    addFrame: (timestampMicros, durationMicros) =>
      source.add(timestampMicros / 1_000_000, durationMicros / 1_000_000),
    finish: async () => {
      await output.finalize()
      const buffer = output.target.buffer
      // Non-null after a successful finalize(); a null here means the mux produced no
      // bytes, which must not reach the upload as an empty Blob.
      if (!buffer) throw new Error('The turntable mux finished without producing any bytes.')
      return new Blob([buffer], { type: 'video/mp4' })
    },
    cancel: () => output.cancel(),
  }
}

export type TurntableJob = {
  preset: ScenePreset
  // Draw frame `i` (advancing the camera along the orbit) and leave it on the canvas.
  // `t` is normalized progress along the orbit, in [0, 1). The CALLER owns the three.js
  // renderer — this module owns the encode.
  drawFrame: (frameIndex: number, t: number) => void
  canvas: HTMLCanvasElement | OffscreenCanvas
  onProgress?: (percent: number) => void
  signal?: AbortSignal
  // Test/renderer seam — defaults to the mp4 encoder above. See TurntableFrameSink.
  createSink?: TurntableSinkFactory
}

// Returns an mp4 Blob. Rejects with TurntableUnsupportedError when WebCodecs is absent,
// and with the signal's reason when aborted (the partial file is discarded).
export async function renderTurntable(job: TurntableJob): Promise<Blob> {
  const { preset, canvas, drawFrame, onProgress, signal } = job
  const createSink = job.createSink ?? createMp4Sink

  const frames = turntableFrameCount(preset.render)
  const stamps = turntableTimestamps(preset.render)
  // Nominal frame duration. Floored like the stamps, so it never overlaps the next one.
  const frameDurationMicros = Math.floor(1_000_000 / preset.render.fps)

  signal?.throwIfAborted()
  const sink = await createSink(canvas, preset)

  try {
    for (let i = 0; i < frames; i++) {
      signal?.throwIfAborted()
      // Fixed timestep: the scene is a pure function of the frame index. Nothing in
      // this loop reads a clock.
      drawFrame(i, i / frames)
      // `stamps` is built with exactly `frames` entries; the fallback only satisfies
      // noUncheckedIndexedAccess.
      const timestampMicros = stamps[i] ?? Math.floor((i * 1_000_000) / preset.render.fps)
      // Awaiting respects encoder + writer backpressure — a slow machine simply spends
      // longer here, which is precisely the trade MediaRecorder cannot make.
      await sink.addFrame(timestampMicros, frameDurationMicros)
      onProgress?.(Math.round(((i + 1) / frames) * 100))
    }
    return await sink.finish()
  } catch (error) {
    // Abort or encoder failure: tear the muxer down so its buffers are released rather
    // than leaked, then surface the original reason.
    await sink.cancel()
    throw error
  }
}
