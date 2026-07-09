// apps/web/src/modules/Cinema/model/storyboardApi.ts
// Script → draft shots. Posts a script (+ style + optional shot count) to the
// LLM storyboard endpoint; the returned draft shots are already written on the
// server (generationId = null — nothing generated or charged yet), so we simply
// invalidate the film detail and let the timeline reload with them appended.
//
// This endpoint is KEY-GATED on the API (ANTHROPIC_API_KEY optional): when the
// key is unset it answers a clean provider_error, which surfaces through the
// mutation's ApiClientError as the "storyboard isn't configured" inline notice.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateStoryboardInput, Shot } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { filmKey } from './filmsApi'

export function useStoryboard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filmId, input }: { filmId: string; input: CreateStoryboardInput }) =>
      api<{ items: Shot[] }>(`/api/films/${filmId}/storyboard`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, { filmId }) =>
      queryClient.invalidateQueries({ queryKey: filmKey(filmId) }),
  })
}
