// apps/web/src/modules/Cinema/model/shotsApi.ts
// Server-state mutations for the timeline's shots: add (empty or title card),
// update (prompt/preset/duration/transition/title), delete, and reorder. Each
// keeps the film's ['film', id] detail cache truthful — reorder PATCHES it with
// the server's re-spaced list for an instant swap, the rest invalidate it.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateShotInput, FilmDetail, Shot, UpdateShotInput } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { filmKey } from './filmsApi'

export function useAddShot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filmId, input }: { filmId: string; input: CreateShotInput }) =>
      api<Shot>(`/api/films/${filmId}/shots`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (_shot, { filmId }) =>
      queryClient.invalidateQueries({ queryKey: filmKey(filmId) }),
  })
}

export function useUpdateShot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      filmId,
      shotId,
      input,
    }: {
      filmId: string
      shotId: string
      input: UpdateShotInput
    }) =>
      api<Shot>(`/api/films/${filmId}/shots/${shotId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (_shot, { filmId }) =>
      queryClient.invalidateQueries({ queryKey: filmKey(filmId) }),
  })
}

export function useDeleteShot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filmId, shotId }: { filmId: string; shotId: string }) =>
      api<void>(`/api/films/${filmId}/shots/${shotId}`, { method: 'DELETE' }),
    onSuccess: (_void, { filmId }) =>
      queryClient.invalidateQueries({ queryKey: filmKey(filmId) }),
  })
}

// Reorder sends the FULL ordered id list; the server re-spaces orderIndex and
// returns the shots in their new order. We write that straight into the detail
// cache so the strip re-sequences the instant an up/down button is pressed —
// no refetch flicker between clicks.
export function useReorderShots() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filmId, shotIds }: { filmId: string; shotIds: string[] }) =>
      api<{ items: Shot[] }>(`/api/films/${filmId}/shots/reorder`, {
        method: 'POST',
        body: JSON.stringify({ shotIds }),
      }),
    onSuccess: (data, { filmId }) => {
      queryClient.setQueryData<FilmDetail>(filmKey(filmId), (old) =>
        old ? { ...old, shots: data.items } : old,
      )
    },
  })
}

// Split a shot at `atMs` (offset from the shot's OWN start, 0 < atMs < durationMs).
// The server does the real work — cut the trim window into two shots citing the
// same generation, re-space orderIndex — and returns the WHOLE updated FilmDetail,
// which we write straight into the cache (like reorder) so the strip re-splits
// instantly. NLE Phase 4; contract: POST /api/films/:id/shots/:shotId/split.
export function useSplitShot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filmId, shotId, atMs }: { filmId: string; shotId: string; atMs: number }) =>
      api<FilmDetail>(`/api/films/${filmId}/shots/${shotId}/split`, {
        method: 'POST',
        body: JSON.stringify({ atMs }),
      }),
    onSuccess: (detail, { filmId }) => {
      queryClient.setQueryData<FilmDetail>(filmKey(filmId), detail)
    },
  })
}
