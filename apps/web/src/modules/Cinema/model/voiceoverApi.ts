// apps/web/src/modules/Cinema/model/voiceoverApi.ts
// "Voice this shot": generate the TTS clip for a shot's spoken line and file it
// on the timeline under the beat that speaks it.
//
// ADR: docs/wiki/decisions/template-catalog.md §4
//
// WHY THIS EXISTS AT ALL. The formats the template catalog ships — fruit dramas,
// cat soap operas, talking produce — ARE dialogue. A shot's `voiceover` field
// holds the line as authored copy (free to hold, free to edit); this turns it into
// audio. Without it a template could only hand the user a silent slideshow.
//
// THE ONE NON-OBVIOUS PIECE IS startMs. A FilmAudio track is positioned in
// absolute milliseconds from the start of the film, but the line belongs to a
// SHOT. So the caller computes the shot's offset — the sum of every preceding
// shot's durationMs — and the track lands under the beat that speaks it. Get this
// wrong and every line plays over the wrong picture, which is a failure the user
// only discovers after paying for the render.
//
// It REPLACES rather than appends: the API deletes any existing track for this
// shot before inserting (see films/service.ts addAudio). A second click is a
// re-voice, not a second overlapping line.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FilmAudio, Generation, ShotVoiceover } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { filmKey } from './filmsApi'

// The absolute timeline offset of a shot: everything before it, summed. Exported
// and pure so it can be unit-tested — an off-by-one here desynchronises the whole
// film and the symptom (lines under the wrong picture) looks like a model problem,
// not an arithmetic one.
export function shotStartMs(shots: Array<{ id: string; durationMs: number }>, shotId: string): number {
  let offset = 0
  for (const shot of shots) {
    if (shot.id === shotId) return offset
    offset += shot.durationMs
  }
  // A shot that is not in the list: place at 0 rather than throwing. The caller
  // only ever passes a shot it just read from the same film detail.
  return 0
}

export type GenerateVoiceoverVars = {
  filmId: string
  shotId: string
  // The tts catalog model id ('voiceover'). Passed in rather than hardcoded — the
  // catalog owns which model speaks, this hook only spends it.
  modelId: string
  voiceover: ShotVoiceover
  startMs: number
}

export function useGenerateVoiceover() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ filmId, shotId, modelId, voiceover, startMs }: GenerateVoiceoverVars) => {
      // The audio generation rides the ordinary lifecycle: charged at submit, 202
      // processing. We link it while it is still processing — the render skips a
      // track whose generation has not succeeded, so nothing is silently dropped.
      const generation = await api<Generation>('/api/generations', {
        method: 'POST',
        body: JSON.stringify({
          modelId,
          prompt: voiceover.text,
          voice: voiceover.voice,
        }),
      })
      return api<FilmAudio>(`/api/films/${filmId}/audio`, {
        method: 'POST',
        body: JSON.stringify({
          kind: 'voiceover',
          generationId: generation.id,
          shotId,
          startMs,
        }),
      })
    },
    onSuccess: (_audio, { filmId }) => {
      void queryClient.invalidateQueries({ queryKey: filmKey(filmId) })
      // Credits were spent — the balance chip must not keep showing the old number.
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
