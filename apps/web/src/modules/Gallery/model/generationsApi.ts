// apps/web/src/modules/Gallery/model/generationsApi.ts
// Server-state hooks of the Gallery: the infinite generations list, the 4s
// polling of items still processing (our API re-polls Runware on each GET —
// bounded by a 20-minute budget since createdAt), and the optimistic delete.
// The ['generations'] and ['me'] keys are shared with the Generator/Credits
// modules through the query cache — no imports.
import { useEffect, useRef } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import type { Generation, GenerationList } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// Page size for the infinite list (plan Task 17; API caps at 50)
const PAGE_SIZE = 24
// Poll cadence while a generation is processing (spec: SPA polls every 4s)
const POLL_INTERVAL_MS = 4000
// Polling budget (QA finding 1): a video takes minutes, never twenty — past
// this the item is stalled server-side and the interval must not run forever.
// The card switches to a "taking longer than usual" state with a manual refresh.
export const GENERATION_STALL_MS = 20 * 60 * 1000

export function useGenerations() {
  return useInfiniteQuery({
    queryKey: ['generations'],
    queryFn: ({ pageParam }) =>
      api<GenerationList>(
        pageParam
          ? `/api/generations?limit=${PAGE_SIZE}&cursor=${pageParam}`
          : `/api/generations?limit=${PAGE_SIZE}`,
      ),
    initialPageParam: null as string | null,
    // nextCursor: null = last page (getNextPageParam null → hasNextPage false)
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

export type LiveGenerationOptions = {
  // Injectable clock for deterministic stall tests; production uses Date.now
  now?: () => number
}

export type LiveGenerationResult = {
  // The fresher of poll/list data — what the card renders
  generation: Generation
  // The 20-minute polling budget is spent and the item still says processing:
  // the interval is stopped, the card shows the amber "taking longer" state
  isStalled: boolean
  // The per-item GET itself failed before EVER delivering data (network/5xx):
  // without this flag the card would sit at "Generating N%" forever
  isPollError: boolean
  // One manual poll — powers both the stalled "refresh" and the error retry.
  // It restarts the query; a successful processing answer within the budget
  // also resumes the interval (refetchInterval re-evaluates after each fetch).
  refresh: () => void
  // True while the manual poll is in flight (drives the button spinner)
  isRefreshing: boolean
}

// Live view of one generation. While the LIST still says "processing" this
// polls GET /api/generations/:id every 4s and renders the fresher answer;
// terminal items render straight from list data — zero extra requests.
// The interval is BOUNDED (QA finding 1): past GENERATION_STALL_MS since
// createdAt it stops and the caller renders the stalled state instead.
export function useLiveGeneration(
  seed: Generation,
  options?: LiveGenerationOptions,
): LiveGenerationResult {
  const queryClient = useQueryClient()
  const isSeedProcessing = seed.status === 'processing'
  // now() is injected in tests so the budget boundary is deterministic —
  // fake timers alone cannot move Date.now past a 20-minute wall
  const now = options?.now ?? Date.now
  const createdAtMs = Date.parse(seed.createdAt)

  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: ['generation', seed.id],
    queryFn: () => api<Generation>(`/api/generations/${seed.id}`),
    enabled: isSeedProcessing,
    refetchInterval: (query) => {
      // A poll that failed before EVER delivering data: stop — the card shows
      // the error state with a manual retry instead of hammering a failing
      // endpoint every 4s. (A failure AFTER data falls through: one blip must
      // not kill the live view, the next tick usually recovers.)
      if (query.state.status === 'error' && query.state.data === undefined) return false
      // Stop the interval the moment the poll reports a terminal state
      const status = query.state.data?.status ?? seed.status
      if (status !== 'processing') return false
      // The polling budget: beyond 20 minutes the generation is stalled
      // upstream — further automatic polling only burns requests. Evaluated
      // after every fetch, so the interval dies on the first tick past the wall.
      return now() - createdAtMs < GENERATION_STALL_MS ? POLL_INTERVAL_MS : false
    },
  })

  const current = isSeedProcessing && data ? data : seed
  // First-poll failure: no fresher data exists at all (isError alone is not
  // enough — a later background failure still has data worth rendering)
  const isPollError = isSeedProcessing && isError && data === undefined
  const isStalled =
    isSeedProcessing &&
    !isPollError &&
    current.status === 'processing' &&
    now() - createdAtMs >= GENERATION_STALL_MS

  // Terminal transition: the poll finished (or failed→refund) before the list
  // knows. Invalidate the list (fresh mediaUrls/status) and the balance
  // (refund case) exactly once per card instance.
  const didInvalidateRef = useRef(false)
  useEffect(() => {
    if (!isSeedProcessing || current.status === 'processing' || didInvalidateRef.current) return
    didInvalidateRef.current = true
    void queryClient.invalidateQueries({ queryKey: ['generations'] })
    void queryClient.invalidateQueries({ queryKey: ['me'] })
  }, [isSeedProcessing, current.status, queryClient])

  return {
    generation: current,
    isStalled,
    isPollError,
    // void: the manual poll's outcome surfaces through query state, not the
    // click handler — callers must never await UI-event promises
    refresh: () => void refetch(),
    isRefreshing: isFetching,
  }
}

// Optimistic delete: the card disappears instantly; a failed DELETE restores
// the snapshot; either way the list is revalidated afterwards.
export function useDeleteGeneration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<undefined>(`/api/generations/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      // Stop in-flight refetches from resurrecting the removed item mid-flight
      await queryClient.cancelQueries({ queryKey: ['generations'] })
      const previous = queryClient.getQueryData<InfiniteData<GenerationList>>(['generations'])
      queryClient.setQueryData<InfiniteData<GenerationList>>(['generations'], (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.filter((generation) => generation.id !== id),
              })),
            }
          : old,
      )
      return { previous }
    },
    onError: (_error, _id, context) => {
      // Roll back to the exact pre-delete snapshot
      if (context?.previous) queryClient.setQueryData(['generations'], context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['generations'] })
    },
  })
}
