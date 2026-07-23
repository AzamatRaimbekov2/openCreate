// apps/web/src/modules/Cinema/model/filmExporter.ts
// The REAL WebCodecs encode sink for the film export (ADR: client-side-export).
// It mirrors Studio3D's proven `createMp4Sink` (mediabunny), extended to a film:
// video via CanvasSource, audio via AudioBufferSource fed ONE mixed buffer, output
// either STREAMED to disk (File System Access → flat memory for long films) or an
// in-memory Blob (Safari/FF fallback).
//
// ⚠️ IN-BROWSER VERIFIED ONLY. Like `createMp4Sink`, this file cannot run in vitest
// (no WebCodecs/OfflineAudioContext/File System Access in jsdom) — the loop that
// USES it (`runFilmExport`) is unit-tested with a fake sink; THIS file is verified
// by a real-browser export smoke test. The blob path mirrors the shipped
// `createMp4Sink` closely; the STREAMING target + the audio mix are the new surface
// and are the first things to check in-browser.
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
} from 'mediabunny'
import type { AudioMixPlan } from './audioMixPlan'
import type { ExportPlan } from './exportPlan'
import type { FilmExportSink } from './filmExportPorts'
import { exportCapabilities } from './exportCapabilities'
import { mixExportAudio, type ResolveMediaUrl } from './filmExportAudio'

// AAC mix bitrate — matches the server render's `-b:a 192k`.
const AUDIO_BITRATE = 192_000

// Open a save-to-disk writable via File System Access, wrapped as a mediabunny
// StreamTarget so the mux writes progressively (memory stays flat). Returns null
// when the user cancels the picker (the caller then aborts cleanly).
async function openDiskTarget(): Promise<{ target: StreamTarget; writable: FileSystemWritableFileStream } | null> {
  const picker = (globalThis as {
    showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>
  }).showSaveFilePicker
  if (picker === undefined) return null
  let handle: FileSystemFileHandle
  try {
    handle = await picker({
      suggestedName: 'film.mp4',
      types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
    })
  } catch {
    // The user dismissed the picker — treat as a cancel, not an error.
    return null
  }
  const writable = await handle.createWritable()
  // StreamTarget writes {data, position} chunks; FileSystemWritableFileStream.write
  // accepts exactly that shape, so it plugs in directly.
  const target = new StreamTarget(writable as unknown as WritableStream)
  return { target, writable }
}

export async function createFilmExportSink(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  plan: ExportPlan,
  hasAudio: boolean,
  // Resolves an audio source's generation id → its /media url (from the cache).
  // Defaults to "no media" so the lazy fallback path still type-checks; the hook
  // always injects the real resolver.
  resolveUrl: ResolveMediaUrl = () => null,
): Promise<FilmExportSink> {
  // The canvas IS the frame; a size mismatch would silently ship the wrong
  // resolution, so fail loudly at construction (the createMp4Sink guard).
  if (canvas.width !== plan.width || canvas.height !== plan.height) {
    throw new TypeError(
      `Canvas is ${canvas.width}x${canvas.height} but the film is ${plan.width}x${plan.height}.`,
    )
  }

  const disk = exportCapabilities().streaming ? await openDiskTarget() : null
  const streaming = disk !== null
  const output = new Output({
    // Streamed: sequential write (moov trails). Blob: faststart (moov leads).
    format: new Mp4OutputFormat({ fastStart: streaming ? false : 'in-memory' }),
    target: disk?.target ?? new BufferTarget(),
  })

  const videoSource = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH })
  output.addVideoTrack(videoSource, { frameRate: plan.fps })

  // A muxer declares EVERY track before start(); create the audio source now (fed
  // its buffer later in addAudio) so an audio-carrying film can add its track.
  let audioSource: AudioBufferSource | null = null
  if (hasAudio) {
    audioSource = new AudioBufferSource({ codec: 'aac', bitrate: AUDIO_BITRATE })
    output.addAudioTrack(audioSource)
  }

  await output.start()

  return {
    addFrame: (timestampMicros, durationMicros) =>
      videoSource.add(timestampMicros / 1_000_000, durationMicros / 1_000_000),
    addAudio: async (audioPlan: AudioMixPlan) => {
      if (audioSource === null) return
      // Decode + mix every source into ONE buffer, then hand it over.
      const buffer = await mixExportAudio(audioPlan, resolveUrl)
      if (buffer !== null) await audioSource.add(buffer)
    },
    finish: async () => {
      await output.finalize()
      if (streaming) {
        // The bytes already went to disk; close the file and return no Blob.
        await disk?.writable.close()
        return null
      }
      const bytes = (output.target as BufferTarget).buffer
      if (bytes === null) throw new Error('The film mux finished without producing any bytes.')
      return new Blob([bytes], { type: 'video/mp4' })
    },
    cancel: async () => {
      await output.cancel()
      // Release a half-written disk file so it is not left as a truncated mp4.
      if (streaming) await disk?.writable.abort?.().catch(() => undefined)
    },
  }
}
