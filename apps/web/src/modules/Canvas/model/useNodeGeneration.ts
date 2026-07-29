// apps/web/src/modules/Canvas/model/useNodeGeneration.ts
// One node's run + poll. Submit mirrors Cinema's useGenerateShotClip
// discipline (retry allowlist on submit only); polling mirrors
// useShotGeneration: query key ['generation', id] @ 4s, shared with every
// other poller in the app. On success the id is APPENDED to the node's
// version history (never overwrites — spec: "⟳ v3 · history").
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import type {
  CanvasEdge,
  CanvasNode,
  CreateGenerationInput,
  Generation,
  GenerationList,
} from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { useCanvasStore } from './canvasStore'
import { MEDIA_SOURCE_KINDS } from './types'

const POLL_INTERVAL_MS = 4000

// Pure: node + graph → the POST body, or null when the node isn't runnable
// yet (missing prompt/model, or a media parent that has no output). The
// Generate button disables on null — a click can never submit a broken chain.
export function buildRunInput(
  node: CanvasNode,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): CreateGenerationInput | null {
  const prompt = node.config.prompt?.trim()
  const modelId = node.config.modelId
  if (!prompt || prompt.length < 2 || !modelId) return null

  const input: CreateGenerationInput = {
    modelId,
    prompt,
    ...(node.config.aspectRatio ? { aspectRatio: node.config.aspectRatio } : {}),
    ...(node.kind === 'video' && node.config.duration !== undefined
      ? { duration: node.config.duration }
      : {}),
  }

  // Media wire: the parent's LATEST generation id becomes inputGenerationId.
  // Upload parents are previews only in this phase — their media is a stored
  // file, not a generation, so there is nothing to cite yet.
  const mediaParent = edges
    .filter((e) => e.targetNodeId === node.id)
    .map((e) => nodes.find((n) => n.id === e.sourceNodeId))
    .find((n) => n !== undefined && MEDIA_SOURCE_KINDS.includes(n.kind) && n.kind !== 'upload')
  if (mediaParent) {
    const latest = mediaParent.generationIds[mediaParent.generationIds.length - 1]
    if (!latest) return null
    input.inputGenerationId = latest
  }

  return input
}

// Submit-only retries (Cinema's allowlist): a 5xx/429 on submit is safe to
// retry — the server hasn't charged; anything else (validation, credits) is
// final. Never retry the poll — it's already a loop.
function shouldRetrySubmit(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false
  if (!(error instanceof ApiClientError)) return false
  return (
    error.status >= 500 ||
    error.code === 'rate_limited' ||
    error.code === 'provider_error' ||
    error.code === 'internal_error'
  )
}

export function useRunNode(nodeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    retry: shouldRetrySubmit,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    mutationFn: (input: CreateGenerationInput) =>
      api<Generation>('/api/generations', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (generation) => {
      // Version history is append-only; the poller below takes over from here.
      useCanvasStore.getState().appendGeneration(nodeId, generation.id)
      queryClient.setQueryData(['generation', generation.id], generation)
      // The Library shows canvas runs like any other (same cache seams as the
      // Generator: prepend + refresh the balance chip).
      queryClient.setQueryData<InfiniteData<GenerationList>>(['generations'], (old) =>
        old && old.pages.length > 0
          ? {
              ...old,
              pages: old.pages.map((page, index) =>
                index === 0 ? { ...page, items: [generation, ...page.items] } : page,
              ),
            }
          : old,
      )
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

// Poll the node's LATEST generation while it processes. The key matches
// Cinema's useShotGeneration exactly (['generation', id], 4s) so every poller
// in the app shares ONE cache entry per generation.
export function useNodeGeneration(generationId: string | null) {
  return useQuery({
    queryKey: ['generation', generationId ?? ''],
    enabled: generationId !== null,
    queryFn: () => api<Generation>(`/api/generations/${generationId}`),
    refetchInterval: (query) => {
      // A first-poll error stops the interval instead of hammering a dead id.
      if (query.state.status === 'error' && query.state.data === undefined) return false
      return query.state.data?.status === 'processing' ? POLL_INTERVAL_MS : false
    },
  })
}
