// apps/web/src/modules/Assets3D/model/asset3dApi.ts
// Server-state hooks for Modular 3D Assets (ADR modular-3d-assets). Mirrors
// Cinema's filmsApi/shotsApi: the library list (['assets3d']), the wizard's
// composite detail (['asset3d', id] → asset + parts + derived statuses), and the
// asset/part/analyze/extract/mesh mutations. The detail key is the spine the whole
// wizard hangs on — every mutation invalidates it, and the refetched aggregate
// surfaces the fresh imageGenerationId/meshGenerationId citations that the
// id-keyed useLivePartGeneration (partGeneration.ts) then polls.
//
// WHY we never touch the shared ['generation', id] cache here (plan FG1): the
// extract/mesh HTTP responses are Asset3dPart objects, NOT Generations — `res.id`
// is the PART id. Seeding ['generation', partId] with a part-shaped object would
// POISON the cache Gallery/Cinema/Soul read as a Generation (`.status`/`.mediaUrls`).
// So every mutation only invalidates the aggregate; the PAID ones (extract/mesh)
// ALSO invalidate ['generations'] + ['me'] because a charge moved the balance and
// added a feed item. Live per-part status comes from fetching the cited id via
// useLivePartGeneration, never from a response we seed.
//
// This module never imports Cinema/Gallery/Generator — it shares only cache keys.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Asset3d,
  Asset3dDetail,
  Asset3dList,
  Asset3dPart,
  CreateAsset3dInput,
  CreateAsset3dPartInput,
  MeshPartInput,
  UpdateAsset3dInput,
  UpdateAsset3dPartInput,
} from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// The asset's composite detail cache key — exported so the wizard and any sibling
// hook target the exact same entry (the Cinema filmKey precedent). A typo'd key
// would silently strand the wizard on stale parts.
export function assetKey(assetId: string) {
  return ['asset3d', assetId] as const
}

// POST /assets3d/:id/analyze replaces the asset's draft parts and returns the full
// part list ({ items }) — the same envelope the route sends.
type AnalyzeResult = { items: Asset3dPart[] }

export function useAssets() {
  return useQuery({
    queryKey: ['assets3d'],
    queryFn: () => api<Asset3dList>('/api/assets3d'),
  })
}

export function useAsset(assetId: string) {
  return useQuery({
    queryKey: assetKey(assetId),
    queryFn: () => api<Asset3dDetail>(`/api/assets3d/${assetId}`),
    // A missing/empty id (route param not yet resolved) must not fire a request
    enabled: assetId !== '',
  })
}

export function useCreateAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAsset3dInput) =>
      api<Asset3d>('/api/assets3d', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets3d'] }),
  })
}

export function useUpdateAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ assetId, input }: { assetId: string; input: UpdateAsset3dInput }) =>
      api<Asset3d>(`/api/assets3d/${assetId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (_asset, { assetId }) => {
      // The library card (title) and the wizard header both read stale copies
      void queryClient.invalidateQueries({ queryKey: ['assets3d'] })
      void queryClient.invalidateQueries({ queryKey: assetKey(assetId) })
    },
  })
}

// Optimistic delete: the card disappears instantly; a failed DELETE restores the
// snapshot; either way the list is revalidated (the Gallery useDeleteGeneration
// pattern). Deleting an asset removes rows only — the cited generations stay in
// the library, so no ['generations'] invalidation is needed.
export function useDeleteAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (assetId: string) => api<void>(`/api/assets3d/${assetId}`, { method: 'DELETE' }),
    onMutate: async (assetId) => {
      // Stop in-flight refetches from resurrecting the removed item mid-flight
      await queryClient.cancelQueries({ queryKey: ['assets3d'] })
      const previous = queryClient.getQueryData<Asset3dList>(['assets3d'])
      queryClient.setQueryData<Asset3dList>(['assets3d'], (old) =>
        old ? { items: old.items.filter((asset) => asset.id !== assetId) } : old,
      )
      return { previous }
    },
    onError: (_error, _assetId, context) => {
      // Roll back to the exact pre-delete snapshot
      if (context?.previous) queryClient.setQueryData(['assets3d'], context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets3d'] })
    },
  })
}

// FREE (no credits): Claude vision suggests draft parts. No request body. The
// provider_error case (no ANTHROPIC_API_KEY) surfaces through ApiClientError.code,
// and the caller shows an inline "analyze not configured" notice — the wizard
// still works by hand. Replaces the asset's draft parts, so the detail must refetch.
export function useAnalyze() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (assetId: string) =>
      api<AnalyzeResult>(`/api/assets3d/${assetId}/analyze`, { method: 'POST' }),
    onSuccess: (_result, assetId) =>
      queryClient.invalidateQueries({ queryKey: assetKey(assetId) }),
  })
}

export function useAddPart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ assetId, input }: { assetId: string; input: CreateAsset3dPartInput }) =>
      api<Asset3dPart>(`/api/assets3d/${assetId}/parts`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (_part, { assetId }) =>
      queryClient.invalidateQueries({ queryKey: assetKey(assetId) }),
  })
}

// Edit name/description OR save the assembly transform (transform: null clears,
// absent = untouched — the contract's clear-vs-untouch distinction). One hook
// covers the ADR "patch transform" surface because it is the same PATCH route.
export function useUpdatePart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      assetId,
      partId,
      input,
    }: {
      assetId: string
      partId: string
      input: UpdateAsset3dPartInput
    }) =>
      api<Asset3dPart>(`/api/assets3d/${assetId}/parts/${partId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (_part, { assetId }) =>
      queryClient.invalidateQueries({ queryKey: assetKey(assetId) }),
  })
}

export function useDeletePart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ assetId, partId }: { assetId: string; partId: string }) =>
      api<void>(`/api/assets3d/${assetId}/parts/${partId}`, { method: 'DELETE' }),
    onSuccess: (_void, { assetId }) =>
      queryClient.invalidateQueries({ queryKey: assetKey(assetId) }),
  })
}

// PAID image generation (no body — the server composes the model + prompt). The
// 200 response is an Asset3dPart (NOT a Generation): invalidate the aggregate for
// the fresh imageGenerationId citation, plus ['generations'] + ['me'] because a
// charge moved the balance and added a feed item. NEVER seed ['generation', …].
export function useExtractPart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ assetId, partId }: { assetId: string; partId: string }) =>
      api<Asset3dPart>(`/api/assets3d/${assetId}/parts/${partId}/extract`, { method: 'POST' }),
    onSuccess: (_part, { assetId }) => {
      void queryClient.invalidateQueries({ queryKey: assetKey(assetId) })
      void queryClient.invalidateQueries({ queryKey: ['generations'] })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

// PAID model3d generation ({ modelId } tier). The route answers 202 (async): the
// part derives to 'meshing' until useLivePartGeneration polls the cited mesh gen
// to 'ready'. Same invalidation discipline as extract (aggregate + feed + balance;
// never seed the shared generation cache with this part-shaped response).
export function useMeshPart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      assetId,
      partId,
      input,
    }: {
      assetId: string
      partId: string
      input: MeshPartInput
    }) =>
      api<Asset3dPart>(`/api/assets3d/${assetId}/parts/${partId}/mesh`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (_part, { assetId }) => {
      void queryClient.invalidateQueries({ queryKey: assetKey(assetId) })
      void queryClient.invalidateQueries({ queryKey: ['generations'] })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
