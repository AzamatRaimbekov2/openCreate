// apps/web/src/modules/Cinema/model/audioApi.ts
// Server-state mutations for a film's audio tracks: attach an existing audio
// generation (music bed or voiceover) to the timeline, and remove one. Both
// invalidate the film's ['film', id] detail so the track list stays truthful.
// The audio GENERATION itself is created through the ordinary generation
// lifecycle (POST /api/generations, type 'audio') — this only links the result.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AddFilmAudioInput, AudioKind, FilmAudio, Generation } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { filmKey } from './filmsApi'

export function useAddAudio() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filmId, input }: { filmId: string; input: AddFilmAudioInput }) =>
      api<FilmAudio>(`/api/films/${filmId}/audio`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (_audio, { filmId }) =>
      queryClient.invalidateQueries({ queryKey: filmKey(filmId) }),
  })
}

export function useDeleteAudio() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filmId, audioId }: { filmId: string; audioId: string }) =>
      api<void>(`/api/films/${filmId}/audio/${audioId}`, { method: 'DELETE' }),
    onSuccess: (_void, { filmId }) =>
      queryClient.invalidateQueries({ queryKey: filmKey(filmId) }),
  })
}

export type AddAudioTrackVars = {
  filmId: string
  // The film-side track kind ('music' | 'voiceover')
  kind: AudioKind
  // The audio catalog model to generate with (music model or tts model)
  modelId: string
  // Music: the positive prompt. Voiceover: the spoken text.
  prompt: string
  // TTS voice id (voiceover only)
  voice?: string
}

// Generate an audio clip AND link it as a film track, in one action. The audio
// generation rides the ordinary lifecycle (charge-at-submit, 202 processing) —
// we link it while still processing; the track resolves when the generation
// completes. Credits were charged, so ['me'] is refreshed like any generation.
export function useAddAudioTrack() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ filmId, kind, modelId, prompt, voice }: AddAudioTrackVars) => {
      const generation = await api<Generation>('/api/generations', {
        method: 'POST',
        body: JSON.stringify({ modelId, prompt, ...(voice ? { voice } : {}) }),
      })
      return api<FilmAudio>(`/api/films/${filmId}/audio`, {
        method: 'POST',
        body: JSON.stringify({ kind, generationId: generation.id }),
      })
    },
    onSuccess: (_audio, { filmId }) => {
      void queryClient.invalidateQueries({ queryKey: filmKey(filmId) })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
