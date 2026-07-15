// apps/web/src/modules/Soul/model/soulApi.ts
// TanStack Query layer for Soul Studio. Same discipline as
// modules/Entities/model/entitiesApi.ts — a soul character IS an entity, so this
// talks to the SAME endpoints and writes the SAME cache keys:
//
//   ['entities']          the library list (shared with modules/Entities)
//   ['entity', id]        one entity's detail (the soul card)
//   ['generations']       the shared feed (a portrait/video shows up in Gallery)
//   ['generation', id]    one generation, polled (shared with Gallery/Cinema)
//   ['me']                the balance — every paid action invalidates it
//
// The cache is also the SEAM: Soul must not import Entities, Gallery or Generator
// (cross-module law), and it does not need to — writing their keys is how the
// balance chip, the library and the feed stay in lockstep with what happened here.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import type {
  CreateEntityInput,
  CreateGenerationInput,
  Entity,
  EntityList,
  Generation,
  GenerationList,
  PortraitView,
  PortraitsResponse,
  Soul,
  UpdateEntityInput,
} from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { imageToDataUri } from './imageToDataUri'

const ENTITIES_KEY = ['entities'] as const
const entityKey = (id: string) => ['entity', id] as const
const generationKey = (id: string) => ['generation', id] as const

// Poll cadence for a soul's video, matching the Gallery/Cinema interval — they
// share the ['generation', id] cache entry, so a different cadence would only
// mean two components fighting over the same row.
const GENERATION_POLL_MS = 4000

// `description` is DERIVED from the soul server-side (entity.ts invariant), so a
// soul request must not carry one. Omitting it from the contract input — rather
// than sending '' — is the type-level statement of that: there is nothing the
// client could send that would be right.
export type CreateSoulInput = Omit<CreateEntityInput, 'description'> & { soul: Soul }
export type UpdateSoulInput = Pick<UpdateEntityInput, 'name' | 'soul'>

// The soul characters, filtered out of the shared entity list. `select` runs on
// the cached data, so /soul and /entities keep ONE fetch between them — the
// generic library still shows objects, places and uploads; Soul Studio shows only
// what the constructor made.
export function useSoulCharacters() {
  return useQuery({
    queryKey: ENTITIES_KEY,
    queryFn: () => api<EntityList>('/api/entities'),
    select: (list: EntityList) => list.items.filter((entity) => entity.soul != null),
  })
}

// One character, by id — the soul card's own read. A missing/foreign id fails
// with a not_found ApiClientError, which the card renders as a calm error state
// rather than a blank screen.
export function useSoulEntity(entityId: string) {
  return useQuery({
    queryKey: entityKey(entityId),
    queryFn: () => api<Entity>(`/api/entities/${entityId}`),
  })
}

// Creating a character is FREE — no generation, no credits. The portraits are a
// separate, priced act (see useMintPortraits). That split is the whole cost UX.
export function useCreateSoul() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSoulInput) =>
      api<Entity>('/api/entities', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (entity) => {
      queryClient.setQueryData(entityKey(entity.id), entity)
      void queryClient.invalidateQueries({ queryKey: ENTITIES_KEY })
    },
  })
}

export function useUpdateSoul() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSoulInput }) =>
      api<Entity>(`/api/entities/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (entity) => {
      // The server re-derived `description` from the new soul — seed the card with
      // the row it actually wrote, don't keep the one we guessed
      queryClient.setQueryData(entityKey(entity.id), entity)
      void queryClient.invalidateQueries({ queryKey: ENTITIES_KEY })
    },
  })
}

// Mint N portraits. SYNCHRONOUS: images resolve inline and come back ALREADY
// ATTACHED to the entity, so there is no window in which the client could crash
// holding a paid, orphaned portrait. Credits were charged by the generation
// service (the one money path) — hence the ['me'] invalidation.
//
// A per-view `error` is NOT a failed mutation: the other views may have
// succeeded, and the failed one was already refunded. The caller renders it.
export function useMintPortraits() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, views }: { id: string; views: PortraitView[] }) =>
      api<PortraitsResponse>(`/api/entities/${id}/portraits`, {
        method: 'POST',
        body: JSON.stringify({ views }),
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(entityKey(response.entity.id), response.entity)
      void queryClient.invalidateQueries({ queryKey: ENTITIES_KEY })
      // Portraits are ordinary generations: they belong in the feed, and they cost
      void queryClient.invalidateQueries({ queryKey: ['generations'] })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

// Prepend a fresh generation into the shared infinite feed so the video also
// appears in /library. Same shape the Generator and Cinema use — duplicated
// rather than imported, because a module may not reach into another module.
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

export type AnimateSoulVars = {
  // The portrait that becomes the first frame — always a photo the user owns
  imageUrl: string
  // The rest of the request, minus the image (which this hook reads and encodes)
  input: Omit<CreateGenerationInput, 'inputImage'>
}

// "Оживить" — an explicit, priced action (35–140 credits), never automatic. It is
// a PLAIN generation: no new endpoint, no new money path. The only Soul-specific
// step is turning the primary portrait into the data URI the contract wants.
export function useAnimateSoul() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ imageUrl, input }: AnimateSoulVars) => {
      const inputImage = await imageToDataUri(imageUrl)
      return api<Generation>('/api/generations', {
        method: 'POST',
        body: JSON.stringify({ ...input, inputImage } satisfies CreateGenerationInput),
      })
    },
    onSuccess: (generation) => {
      // Seed the poll cache so the card can show progress without a first fetch
      queryClient.setQueryData(generationKey(generation.id), generation)
      queryClient.setQueryData<InfiniteData<GenerationList>>(['generations'], (old) =>
        prependToGenerations(old, generation),
      )
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

// Live view of the soul's video. Video arrives as a processing row (202) and is
// polled to a terminal state; the interval stops on success, failure, and on a
// first-poll error (hammering a broken endpoint helps nobody).
export function useSoulVideo(generationId: string | null) {
  return useQuery({
    queryKey: generationKey(generationId ?? ''),
    queryFn: () => api<Generation>(`/api/generations/${generationId ?? ''}`),
    enabled: generationId !== null,
    refetchInterval: (query) => {
      if (query.state.status === 'error' && query.state.data === undefined) return false
      return query.state.data?.status === 'processing' ? GENERATION_POLL_MS : false
    },
  })
}
