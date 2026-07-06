// apps/web/src/modules/Generator/model/createGeneration.ts
// Mutation for POST /api/generations. On success the returned Generation is
// prepended into the shared ['generations'] infinite cache (the Gallery module
// reads the same key — modules stay decoupled through the cache, like ['me'])
// and ['me'] is invalidated because credits were charged at submit.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import type { CreateGenerationInput, Generation, GenerationList } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// Prepend the fresh generation to the first page of the infinite list so the
// new card appears instantly — no full refetch, no scroll jump.
function prependToList(
  old: InfiniteData<GenerationList> | undefined,
  generation: Generation,
): InfiniteData<GenerationList> {
  if (!old || old.pages.length === 0) {
    return { pages: [{ items: [generation], nextCursor: null }], pageParams: [null] }
  }
  return {
    ...old,
    pages: old.pages.map((page, index) =>
      index === 0 ? { ...page, items: [generation, ...page.items] } : page,
    ),
  }
}

export function useCreateGeneration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateGenerationInput) =>
      api<Generation>('/api/generations', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (generation) => {
      // Image responses arrive already succeeded (201); video arrives as a
      // processing card (202) that the Gallery polls — both are prepended as-is
      queryClient.setQueryData<InfiniteData<GenerationList>>(['generations'], (old) =>
        prependToList(old, generation),
      )
      // The charge happened at submit — refresh the balance chip
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
