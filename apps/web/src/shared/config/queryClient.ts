// apps/web/src/shared/config/queryClient.ts
// Single TanStack Query client for the whole SPA — one cache, shared by all modules.
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // One retry hides transient network blips without hammering the API
      retry: 1,
      // Most reads (/api/me, catalog) tolerate 30s staleness; override per-query when needed
      staleTime: 30_000,
      // Generation polling is explicit (refetchInterval) — focus refetch would add noise
      refetchOnWindowFocus: false,
    },
  },
})
