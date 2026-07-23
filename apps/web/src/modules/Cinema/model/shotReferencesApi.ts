// apps/web/src/modules/Cinema/model/shotReferencesApi.ts
// Server-state mutations for a shot's ATTACHED reference images — arbitrary
// pictures ("make it look like these"), distinct from tagged Entities. Both
// endpoints return the UPDATED Shot and invalidate the film's ['film', id]
// detail cache, exactly like the sibling shot mutations in shotsApi.ts, so the
// inspector re-renders with the fresh referenceImages the instant one lands or
// is removed. The server sources the stored bytes back into the closed
// generation channel on every generate, so an attach PERSISTS (see contracts
// film.ts header) — the client never re-sends the data URI at generate time.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Shot } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { filmKey } from './filmsApi'

// POST the raw bytes as a data URI. The API validates type/size/svg at the
// boundary (addShotReferenceInputSchema) and refuses the (N+1)th over the shared
// budget of 5 BEFORE storing — a 400 the component surfaces as localized copy.
export function useAddShotReference() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      filmId,
      shotId,
      dataUri,
    }: {
      filmId: string
      shotId: string
      dataUri: string
    }) =>
      api<Shot>(`/api/films/${filmId}/shots/${shotId}/references`, {
        method: 'POST',
        body: JSON.stringify({ dataUri }),
      }),
    onSuccess: (_shot, { filmId }) =>
      queryClient.invalidateQueries({ queryKey: filmKey(filmId) }),
  })
}

// DELETE is idempotent (a re-fire on an already-gone ref still returns the Shot),
// so no optimistic bookkeeping is needed — the refetch is the source of truth.
export function useDeleteShotReference() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filmId, shotId, refId }: { filmId: string; shotId: string; refId: string }) =>
      api<Shot>(`/api/films/${filmId}/shots/${shotId}/references/${refId}`, { method: 'DELETE' }),
    onSuccess: (_shot, { filmId }) =>
      queryClient.invalidateQueries({ queryKey: filmKey(filmId) }),
  })
}
