// apps/web/src/modules/Cinema/model/filmExportPorts.ts
// The PORTS between the tested export orchestrator and the browser-only encode
// (the renderTurntable `TurntableFrameSink` precedent). Two reasons these are
// interfaces, not inlined: (1) jsdom has no WebCodecs/canvas, so the loop that
// carries the correctness can only be unit-tested by injecting fakes here; (2) the
// muxer/target/decoder stay swappable behind them. The REAL implementations live
// in a lazy chunk (`filmExportSink.ts` + `drawFilmFrame.ts`) and are verified
// in-browser, not in vitest — exactly how `createMp4Sink` is.
import type { AudioMixPlan } from './audioMixPlan'
import type { ExportPlan, FramePlanEntry } from './exportPlan'

// The encode + mux + write sink. `finish` returns a Blob for the in-memory
// fallback (Safari/FF) and `null` when the mux streamed straight to disk.
export type FilmExportSink = {
  // Encode whatever is on the canvas as the frame at this timestamp; resolves once
  // the encoder + writer are ready for more (backpressure — a slow device just
  // spends longer here, it never drops a frame).
  addFrame: (timestampMicros: number, durationMicros: number) => Promise<void>
  // Decode + mix the audio plan (OfflineAudioContext) and add the AAC track.
  addAudio: (plan: AudioMixPlan) => Promise<void>
  finish: () => Promise<Blob | null>
  cancel: () => Promise<void>
}

// Draw one output frame onto the export canvas: decode the clip frame at
// `entry.sourceMs`, composite the crossfade (`entry.fade`), draw the title card.
// Browser-only — injected so the loop's tests use a no-op.
export type DrawFilmFrame = (entry: FramePlanEntry) => Promise<void>

// Build the real sink for a canvas + plan (chooses stream-to-disk vs blob by
// capability). `hasAudio` is passed because a muxer must declare EVERY track before
// it starts — the sink cannot add an audio track later once frames are flowing. The
// orchestrator lazy-imports the default; tests inject a fake.
export type FilmExportSinkFactory = (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  plan: ExportPlan,
  hasAudio: boolean,
) => Promise<FilmExportSink>
