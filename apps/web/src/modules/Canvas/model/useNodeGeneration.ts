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

// Shared by buildRunInput AND the node components (which also need the
// parent's id to keep its status fresh in the shared poll cache — see
// ImageNode.tsx). Factored out so the two call sites can never disagree on
// what counts as "the media parent". Deliberately does NOT exclude 'upload'
// (F4 fix-wave finding): an upload IS wired media, and buildRunInput below is
// what decides whether it is citable — hiding it here made the wire silently
// disappear instead, so Generate fell back to a plain t2i/t2v that ignored a
// wire the user could see on the board (paying for something other than what
// the graph showed).
export function findMediaParent(
  nodeId: string,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): CanvasNode | undefined {
  return edges
    .filter((e) => e.targetNodeId === nodeId)
    .map((e) => nodes.find((n) => n.id === e.sourceNodeId))
    .find((n) => n !== undefined && MEDIA_SOURCE_KINDS.includes(n.kind))
}

// Pure: node + graph → the POST body, or null when the node isn't runnable
// yet (missing prompt/model, or a media parent that has no SUCCEEDED output).
// The Generate button disables on null — a click can never submit a broken
// chain. `generationStatus` is a snapshot the caller reads out of the shared
// TanStack Query cache (['generation', id]) — this function stays pure and
// synchronous rather than reaching into the cache itself. Default `{}` (no
// known statuses) is deliberately the SAFE side: an id with no known status
// is treated as not-succeeded, never assumed good.
export function buildRunInput(
  node: CanvasNode,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  generationStatus: Readonly<Record<string, Generation['status'] | undefined>> = {},
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

  // Media wire: the parent's NEWEST SUCCEEDED generation id becomes
  // inputGenerationId — never merely the last history entry. C2 fix: the
  // history's last id can be a still-processing or failed retry, and citing
  // it would send a broken/empty parent into the child's provider call.
  // Walk from the end so ties (several succeeded runs) still pick the newest.
  const mediaParent = findMediaParent(node.id, nodes, edges)
  if (mediaParent) {
    // F4 fix-wave finding: an upload has no `generationIds` history — it is a
    // stored file, not a generation — so there is nothing to cite YET (that's
    // phase 4's job). Disable Generate here rather than silently falling
    // through to a plain t2i/t2v: the wire is visible on the board, and
    // charging the user for a run that ignores it would be dishonest. The
    // wire itself stays legal (edgeRules is unchanged) — only the affordance
    // is gated, same as "connected but not yet succeeded".
    if (mediaParent.kind === 'upload') return null
    const succeeded = [...mediaParent.generationIds]
      .reverse()
      .find((gid) => generationStatus[gid] === 'succeeded')
    if (!succeeded) return null
    input.inputGenerationId = succeeded
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
