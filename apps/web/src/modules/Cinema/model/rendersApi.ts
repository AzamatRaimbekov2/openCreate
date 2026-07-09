// apps/web/src/modules/Cinema/model/rendersApi.ts
// The ffmpeg export job: kick a render (202 processing) and poll it to a
// terminal state. A render spends OUR CPU, not a provider invoice, so there is
// no ledger/refund here — just a status machine (processing → succeeded/failed)
// polled every ~2s. On succeeded the render carries a served /media/<id>.mp4.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FilmRender } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// Poll cadence — a local CPU render reports progress far more often than a
// remote generation, so it is tighter than the 4s generation poll.
const RENDER_POLL_MS = 2000

export function renderKey(renderId: string) {
  return ['render', renderId] as const
}

export function useCreateRender() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filmId: string) =>
      api<FilmRender>(`/api/films/${filmId}/renders`, { method: 'POST' }),
    // Seed the poll cache with the 202 body so useRender has data on the very
    // first render and never flashes an empty bar before the first GET lands.
    onSuccess: (render) => queryClient.setQueryData(renderKey(render.id), render),
  })
}

// Live view of one render. Enabled only once a render exists; the interval stops
// the moment the status leaves 'processing' (succeeded → download link appears,
// failed → the caller shows the message). A poll that errors before ANY data
// stops too, so a failing endpoint is not hammered every 2s.
export function useRender(filmId: string, renderId: string | null) {
  return useQuery({
    queryKey: renderKey(renderId ?? ''),
    queryFn: () => api<FilmRender>(`/api/films/${filmId}/renders/${renderId}`),
    enabled: renderId !== null,
    refetchInterval: (query) => {
      if (query.state.status === 'error' && query.state.data === undefined) return false
      return query.state.data?.status === 'processing' ? RENDER_POLL_MS : false
    },
  })
}
