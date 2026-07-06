// apps/web/src/modules/Gallery/model/generationsApi.ts
// Server-state hooks of the Gallery: the infinite generations list, the 4s
// polling of items still processing (our API re-polls Runware on each GET),
// and the optimistic delete. The ['generations'] and ['me'] keys are shared
// with the Generator/Credits modules through the query cache — no imports.
import { useEffect, useRef } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import type { Generation, GenerationList } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// Page size for the infinite list (plan Task 17; API caps at 50)
const PAGE_SIZE = 24
// Poll cadence while a generation is processing (spec: SPA polls every 4s)
const POLL_INTERVAL_MS = 4000

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

// Live view of one generation. While the LIST still says "processing" this
// polls GET /api/generations/:id every 4s and renders the fresher answer;
// terminal items render straight from list data — zero extra requests.
export function useLiveGeneration(seed: Generation): Generation {
  const queryClient = useQueryClient()
  const isSeedProcessing = seed.status === 'processing'

  const { data } = useQuery({
    queryKey: ['generation', seed.id],
    queryFn: () => api<Generation>(`/api/generations/${seed.id}`),
    enabled: isSeedProcessing,
    // Stop the interval the moment the poll reports a terminal state
    refetchInterval: (query) =>
      query.state.data?.status === 'processing' ? POLL_INTERVAL_MS : false,
  })

  const current = isSeedProcessing && data ? data : seed

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

  return current
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
