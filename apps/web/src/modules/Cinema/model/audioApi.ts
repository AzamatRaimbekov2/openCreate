// apps/web/src/modules/Cinema/model/audioApi.ts
// Server-state mutations for a film's audio tracks: attach an existing audio
// generation (music bed or voiceover) to the timeline, and remove one. Both
// invalidate the film's ['film', id] detail so the track list stays truthful.
// The audio GENERATION itself is created through the ordinary generation
// lifecycle (POST /api/generations, type 'audio') — this only links the result.
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import type { AddFilmAudioInput, AudioKind, FilmAudio, Generation } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { filmKey } from './filmsApi'

// Poll cadence for a track whose clip is still rendering upstream — 4s, the same
// as the shot/gallery views, since they share the ['generation', id] key.
const AUDIO_POLL_MS = 4000

// Live status of every audio track on the timeline, keyed by generation id over
// the SHARED ['generation', id] cache.
//
// WHY THIS EXISTS (2026-07-20): a track may now be attached while its generation
// is still processing — `films/service.ts addAudio` deliberately no longer gates
// on status, because audio is async and the old gate made attachment impossible.
// The safety that gate used to provide is replaced by MAKING PENDING VISIBLE, and
// this hook is what supplies the truth to do that.
//
// It carries a refetchInterval, unlike `useShotGenerations` (shotGeneration.ts),
// which deliberately does not: there, the mounted ShotThumbs own the polling and
// the batch only reads the fresher answer. On the audio lane there is no second
// poller — this IS the only one — so a processing track would otherwise never be
// seen to finish. The interval stops on any terminal state, and stops on a
// first-poll error rather than hammering a failing endpoint every 4s.
export function useAudioGenerations(generationIds: string[]): Record<string, Generation> {
  const results = useQueries({
    queries: generationIds.map((id) => ({
      queryKey: ['generation', id],
      queryFn: () => api<Generation>(`/api/generations/${id}`),
      refetchInterval: (query: {
        state: { status: string; data: Generation | undefined }
      }): number | false => {
        if (query.state.status === 'error' && query.state.data === undefined) return false
        return query.state.data?.status === 'processing' ? AUDIO_POLL_MS : false
      },
    })),
  })
  const byId: Record<string, Generation> = {}
  results.forEach((result, index) => {
    const id = generationIds[index]
    if (id && result.data) byId[id] = result.data
  })
  return byId
}

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
