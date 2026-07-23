// apps/web/src/modules/Cinema/model/audioMixPlan.ts
// The PURE audio spec for the client export — the browser's OfflineAudioContext
// mix consumes this list. It mirrors render.ts §"Audio": each clip's NATIVE
// soundtrack (a shot generated WITH sound, `shot.audio`) delayed to its
// crossfade-aware timeline start and trimmed to the shot window, PLUS the film's
// music/voiceover tracks at their offset with gain. `totalMs` is the video length
// (the fold total) — a music bed longer than the film is capped there at mix time.
import type { FilmAudio, Shot } from '@opencreate/contracts'
import { buildSegmentTimeline } from './exportPlan'

export type AudioSourceKind = 'native' | 'music' | 'voiceover'

// One thing to decode + place in the mix. `generationId` identifies the media (the
// adapter resolves it to a /media url); `durationMs` is null for a film track (play
// its natural length, capped to `totalMs`) and the shot window for native audio.
export type AudioSource = {
  kind: AudioSourceKind
  generationId: string
  timelineStartMs: number
  // Seek into the source before mixing (native = the shot's trim; film tracks = 0).
  sourceStartMs: number
  durationMs: number | null
  gainDb: number
}

export type AudioMixPlan = {
  // The video timeline length — the mixer caps the whole mix to this.
  totalMs: number
  sources: AudioSource[]
}

export function audioMixPlan(shots: readonly Shot[], filmAudio: readonly FilmAudio[]): AudioMixPlan {
  const { segments, totalMs } = buildSegmentTimeline(shots)
  const sources: AudioSource[] = []

  // Native clip audio: a shot generated with sound contributes its own soundtrack,
  // delayed to the SAME crossfade-aware start the picture uses (so sound and image
  // stay in lockstep). The pure plan lists every `shot.audio` candidate; the adapter
  // is the final guard (a clip whose media has no audio track is skipped there,
  // mirroring the server's caution about mapping a non-existent stream).
  shots.forEach((shot, index) => {
    if (!shot.audio || shot.generationId === null) return
    const segment = segments[index]
    if (segment === undefined) return
    sources.push({
      kind: 'native',
      generationId: shot.generationId,
      timelineStartMs: segment.startMs,
      sourceStartMs: shot.trimStartMs,
      durationMs: shot.durationMs,
      gainDb: 0,
    })
  })

  // Film tracks (music beds / voiceover): at their absolute offset, with gain; their
  // real length lives in the media (unknown here), so `durationMs` is null and the
  // mixer caps to `totalMs`.
  filmAudio.forEach((track) => {
    sources.push({
      kind: track.kind === 'voiceover' ? 'voiceover' : 'music',
      generationId: track.generationId,
      timelineStartMs: track.startMs,
      sourceStartMs: 0,
      durationMs: null,
      gainDb: track.gainDb,
    })
  })

  return { totalMs, sources }
}
