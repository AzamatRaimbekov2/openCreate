// apps/web/src/modules/Cinema/model/rendersApi.ts
// The ffmpeg export job: kick a render (202 processing) and poll it to a
// terminal state. A render spends OUR CPU, not a provider invoice, so there is
// no ledger/refund here — just a status machine (processing → succeeded/failed)
// polled every ~2s. On succeeded the render carries a served /media/<id>.mp4.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FilmRender } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { filmKey } from './filmsApi'

// Poll cadence — a local CPU render reports progress far more often than a
// remote generation, so it is tighter than the 4s generation poll.
const RENDER_POLL_MS = 2000

export function renderKey(renderId: string) {
  return ['render', renderId] as const
}

// How many CONSECUTIVE failed polls before we give up and tell the user we have
// lost sight of the render. TanStack resets fetchFailureCount on any success, so
// this really is "in a row" — one network blip mid-render costs nothing.
export const MAX_POLL_FAILURES = 3

export function useCreateRender() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filmId: string) =>
      api<FilmRender>(`/api/films/${filmId}/renders`, { method: 'POST' }),
    onSuccess: (render, filmId) => {
      // Seed the poll cache with the 202 body so useRender has data on the very
      // first render and never flashes an empty bar before the first GET lands.
      queryClient.setQueryData(renderKey(render.id), render)
      // The film detail carries `latestRender`, and it just went stale — a
      // reload (or a second tab) must see the render that was started here.
      void queryClient.invalidateQueries({ queryKey: filmKey(filmId) })
    },
  })
}

// Should the poll fire again? PURE, so the wedge it fixes is testable with no
// QueryClient and no network.
//
// THE BUG THIS REPLACES: the old guard was `isError && data === undefined`. But
// useCreateRender SEEDS the cache with the 202 body, so `data` was never
// undefined in the tab that started the render — the guard could not fire. The
// interval then ran forever against a failing endpoint, and because the seeded
// row still said 'processing', the strip showed "processing 0%" with no error
// and no retry while Export stayed removed from the ⋯ menu. The user was locked
// out of their own film with nothing on screen admitting it.
//
// Counting CONSECUTIVE failures makes the seed irrelevant: a poll that keeps
// failing stops, and the caller can say so.
export function renderPollInterval(
  status: FilmRender['status'] | undefined,
  failureCount: number,
): number | false {
  if (failureCount >= MAX_POLL_FAILURES) return false
  return status === 'processing' ? RENDER_POLL_MS : false
}

// Live view of one render. Enabled only once a render exists; the interval stops
// on any terminal status AND after MAX_POLL_FAILURES consecutive errors. Callers
// MUST read `isError`: a poll we have given up on is a state the user has to be
// told about, not a spinner that quietly never resolves.
export function useRender(filmId: string, renderId: string | null) {
  return useQuery({
    queryKey: renderKey(renderId ?? ''),
    queryFn: () => api<FilmRender>(`/api/films/${filmId}/renders/${renderId}`),
    enabled: renderId !== null,
    refetchInterval: (query) =>
      renderPollInterval(query.state.data?.status, query.state.fetchFailureCount),
  })
}
