// apps/web/src/modules/Cinema/model/filmExportAudio.ts
// Mix the export's audio plan into ONE AudioBuffer with an OfflineAudioContext
// (ADR: client-side-export §Audio) — the browser counterpart of render.ts's amix.
// Each source (a clip's native soundtrack or a film music/voice track) is fetched
// from /media, decoded, placed at its timeline start with its gain, and (native)
// trimmed to its window; the whole thing renders offline to a buffer capped at the
// film length, which mediabunny's AudioBufferSource then encodes to AAC.
//
// ⚠️ IN-BROWSER VERIFIED ONLY — jsdom has no Web Audio; the pure `audioMixPlan` it
// consumes is unit-tested, this render step is verified by a real-browser export.
import type { AudioMixPlan } from './audioMixPlan'

// Resolve a generation id to a playable /media url (built from the generation cache
// by the caller). Null → the source is skipped (its clip has no media yet).
export type ResolveMediaUrl = (generationId: string) => string | null

const dbToGain = (db: number): number => 10 ** (db / 20)

export async function mixExportAudio(
  plan: AudioMixPlan,
  resolveUrl: ResolveMediaUrl,
): Promise<AudioBuffer | null> {
  if (plan.sources.length === 0 || plan.totalMs <= 0) return null

  const sampleRate = 48_000
  const length = Math.ceil((plan.totalMs / 1000) * sampleRate)
  const context = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate })

  let scheduled = 0
  for (const source of plan.sources) {
    const url = resolveUrl(source.generationId)
    if (url === null) continue
    let decoded: AudioBuffer
    try {
      const bytes = await (await fetch(url)).arrayBuffer()
      decoded = await context.decodeAudioData(bytes)
    } catch {
      // A clip with no audio stream (or a fetch failure) is skipped — the final
      // guard the pure plan defers to (a silent shot must not fail the export).
      continue
    }
    const node = context.createBufferSource()
    node.buffer = decoded
    const gain = context.createGain()
    gain.gain.value = dbToGain(source.gainDb)
    node.connect(gain).connect(context.destination)
    // Native audio seeks into the clip (its trim) and plays only the shot window;
    // a film track plays from 0 for its natural length (capped by the context).
    const when = source.timelineStartMs / 1000
    const offset = source.sourceStartMs / 1000
    if (source.durationMs !== null) node.start(when, offset, source.durationMs / 1000)
    else node.start(when, offset)
    scheduled += 1
  }

  if (scheduled === 0) return null
  return context.startRendering()
}
