// apps/web/src/modules/Generator/model/catalogApi.ts
// TanStack Query hook for the model catalog (GET /api/catalog). The catalog is
// a static curated list for the whole session — fetched once, never re-fetched
// (staleTime: Infinity) so model cards don't flicker or reorder mid-edit.
import { useQuery } from '@tanstack/react-query'
import type { CatalogModel } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// Wire shape of GET /api/catalog (contracts catalogResponseSchema)
export type CatalogResponse = {
  // Curated models, image and video, in the API's display order
  models: CatalogModel[]
}

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => api<CatalogResponse>('/api/catalog'),
    // The catalog changes only with an API deploy — one fetch per session
    staleTime: Infinity,
  })
}
