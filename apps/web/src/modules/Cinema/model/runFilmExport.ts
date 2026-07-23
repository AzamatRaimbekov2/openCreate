// apps/web/src/modules/Cinema/model/runFilmExport.ts
// The export ORCHESTRATOR (ADR: client-side-export) — the renderTurntable loop,
// generalised to a multi-clip film with audio. It walks the pure `exportPlan`
// frame by frame: draw the frame (decode + composite + title, via the injected
// `drawFrame`), encode it (the injected `FilmExportSink`), report progress; then
// mix + add the audio; then finish (Blob for the blob fallback, or null when the
// mux streamed to disk). On abort or an encoder failure it CANCELS the sink so its
// buffers/streams are released — no leak (the #1 review risk), then rethrows.
//
// The loop reads NO clock: timestamps come from `exportPlan` (the frame index), so
// a slow device just takes longer, never producing a worse file. The real sink is
// lazy-imported (keeps mediabunny/WebCodecs out of the main bundle); tests inject a
// fake, so this whole file runs in jsdom.
import type { AudioMixPlan } from './audioMixPlan'
import type { ExportPlan } from './exportPlan'
import type { DrawFilmFrame, FilmExportSink, FilmExportSinkFactory } from './filmExportPorts'

export type FilmExportJob = {
  plan: ExportPlan
  audioPlan: AudioMixPlan
  canvas: HTMLCanvasElement | OffscreenCanvas
  drawFrame: DrawFilmFrame
  onProgress?: (percent: number) => void
  signal?: AbortSignal
  // Test/browser seam — defaults to the lazy mediabunny sink. See FilmExportSink.
  createSink?: FilmExportSinkFactory
}

// Lazy default: pulled only when no sink is injected (i.e. in a real browser), so
// mediabunny + the WebCodecs adapter stay in the export chunk, off the main bundle.
const lazySink: FilmExportSinkFactory = async (canvas, plan, hasAudio) => {
  const { createFilmExportSink } = await import('./filmExporter')
  return createFilmExportSink(canvas, plan, hasAudio)
}

export async function runFilmExport(job: FilmExportJob): Promise<Blob | null> {
  const { plan, audioPlan, canvas, drawFrame, onProgress, signal } = job
  const createSink = job.createSink ?? lazySink

  signal?.throwIfAborted()
  const sink: FilmExportSink = await createSink(canvas, plan, audioPlan.sources.length > 0)
  // Nominal frame duration (µs), floored so it never overlaps the next stamp.
  const frameDurationMicros = Math.floor(1_000_000 / plan.fps)

  try {
    for (const frame of plan.frames) {
      signal?.throwIfAborted()
      await drawFrame(frame)
      // Awaiting respects encoder + writer backpressure.
      await sink.addFrame(frame.timestampMicros, frameDurationMicros)
      // Reserve 100 for a completed finish; frames report up to 99.
      onProgress?.(Math.min(99, Math.round(((frame.frameIndex + 1) / plan.frameCount) * 100)))
    }
    await sink.addAudio(audioPlan)
    const result = await sink.finish()
    onProgress?.(100)
    return result
  } catch (error) {
    // Abort or encoder failure: release the muxer/stream, then surface the reason.
    await sink.cancel()
    throw error
  }
}
