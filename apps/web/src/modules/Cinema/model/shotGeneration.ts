// apps/web/src/modules/Cinema/model/shotGeneration.ts
// The Cinema shot-generation flow — the bridge between a timeline shot and the
// existing generation lifecycle:
//   1. POST /api/generations with the composed request (composeShotClipInput)
//   2. PATCH the shot's generationId so the timeline points at the new clip
//   3. cache the result and poll it to a terminal state
// It DECOUPLES from the Gallery/Generator modules through the shared query cache
// (['generations'], ['generation', id], ['me']) — never through an import.
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import type {
  ApiErrorCode,
  AspectRatio,
  CatalogModel,
  Generation,
  GenerationList,
  Shot,
} from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { composeShotClipInput } from './composeShotClipInput'
import { filmKey } from './filmsApi'

// Poll cadence while a shot's clip is still rendering upstream (spec: 4s, same
// as the Gallery's live generation view — they share the ['generation', id] key).
const GENERATION_POLL_MS = 4000

// Retry policy for the SUBMIT (kick-off) call only. A transient blip
// (rate limit, provider hiccup, our own 5xx, a dropped connection) should not
// surface to the user on the first stumble — but an ACTIONABLE/terminal failure
// must NEVER be retried: content_blocked / validation_failed / conflict are
// pointless to repeat, and insufficient_credits would just re-cost the attempt.
// So this is an ALLOWLIST of clearly-transient codes, not a denylist.
const TRANSIENT_SUBMIT_CODES: ReadonlySet<ApiErrorCode> = new Set([
  'rate_limited',
  'provider_error',
  'internal_error',
])

// Up to two retries (three attempts total) — enough to ride out a blip, few
// enough that a truly-down provider fails fast into a toast.
const MAX_SUBMIT_RETRIES = 2

// Pure predicate handed to TanStack Query's `retry`. Exported so the policy is
// unit-tested directly instead of through a mutation + fake timers.
export function shouldRetrySubmit(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_SUBMIT_RETRIES) return false
  if (error instanceof ApiClientError) {
    if (TRANSIENT_SUBMIT_CODES.has(error.code)) return true
    // Any 5xx is transient even if its code is unexpected; every 4xx (the four
    // terminal codes included) is actionable and must not re-cost the user.
    return error.status >= 500
  }
  // No error envelope at all = a network throw (fetch TypeError) → transient.
  return true
}

// Short exponential backoff (1s, 2s), capped — no thundering retry.
const submitRetryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 4000)

// Prepend the fresh generation to the shared infinite list so it also appears in
// the Gallery/create feed — same helper shape the Generator uses (no import).
function prependToGenerations(
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

export type GenerateShotClipVars = {
  filmId: string
  // The shot to fill — its prompt + preset drive the request, its id is patched
  shot: Shot
  // The chosen catalog model (a video model, normally)
  model: CatalogModel
  // The film canvas the request aspect resolves against
  filmAspect: AspectRatio
}

// Create a clip for a shot and link it. Charge-at-submit happens server-side, so
// on success we refresh the balance (['me']) exactly like the Generator does.
export function useGenerateShotClip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ filmId, shot, model, filmAspect }: GenerateShotClipVars) => {
      const generation = await api<Generation>('/api/generations', {
        method: 'POST',
        body: JSON.stringify(composeShotClipInput(shot, model, filmAspect)),
      })
      // Point the shot at its new clip; the film detail then renders it
      await api<Shot>(`/api/films/${filmId}/shots/${shot.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ generationId: generation.id }),
      })
      return generation
    },
    // Only the SUBMIT is retried, and only on transient codes — a settled
    // `failed` generation is never re-run here (that is the poll's terminal
    // state, surfaced as a toast, not a mutation to repeat).
    retry: shouldRetrySubmit,
    retryDelay: submitRetryDelay,
    onSuccess: (generation, { filmId }) => {
      // Seed the poll cache and the shared feed; refresh film detail + balance
      queryClient.setQueryData(['generation', generation.id], generation)
      queryClient.setQueryData<InfiniteData<GenerationList>>(['generations'], (old) =>
        prependToGenerations(old, generation),
      )
      void queryClient.invalidateQueries({ queryKey: filmKey(filmId) })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

// Live view of ONE shot's clip generation, keyed by its generationId (shared
// with the Gallery cache). Polls every 4s while processing; stops the interval
// on any terminal state, and stops on a first-poll error rather than hammering.
// A null generationId (empty shot / title card) simply disables the query.
export function useShotGeneration(generationId: string | null) {
  return useQuery({
    queryKey: ['generation', generationId ?? ''],
    queryFn: () => api<Generation>(`/api/generations/${generationId}`),
    enabled: generationId !== null,
    refetchInterval: (query) => {
      if (query.state.status === 'error' && query.state.data === undefined) return false
      return query.state.data?.status === 'processing' ? GENERATION_POLL_MS : false
    },
  })
}

// Every shot's clip at once (the preview player needs the whole playlist). One
// query per generation over the SHARED ['generation', id] cache — deduped with
// the per-thumb useShotGeneration, which owns the polling. The preview only
// READS the fresher answer, so these queries carry no interval (the mounted
// ShotThumbs keep the cache live). Returns a lookup keyed by generationId (only
// succeeded rows carry a playable mediaUrl; the caller skips the rest).
export function useShotGenerations(generationIds: string[]): Record<string, Generation> {
  const results = useQueries({
    queries: generationIds.map((id) => ({
      queryKey: ['generation', id],
      queryFn: () => api<Generation>(`/api/generations/${id}`),
    })),
  })
  const byId: Record<string, Generation> = {}
  results.forEach((result, index) => {
    const id = generationIds[index]
    if (id && result.data) byId[id] = result.data
  })
  return byId
}
