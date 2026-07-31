// apps/web/src/modules/Styles/model/api.ts
// The Style Studio's whole data layer: the registry read, the three owner-scoped
// writes, and the preview run. It exists so the components never touch `fetch`
// and never decide when a preview is finished.
//
// ONE KEY, TWO SOURCES. `['styles']` holds the server's union of the seven
// builtin styles and the caller's own rows (ADR style-studio D1/D5). Nothing
// here knows which side a row came from — `builtin` on the row is the only
// distinction, and it is the server's answer, not a client inference.
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type {
  CreateStyleInput,
  Generation,
  Style,
  StyleList,
  UpdateStyleInput,
} from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

const STYLES_KEY = ['styles'] as const

// The scene every style preview renders. Deliberately NEUTRAL — a figure, a
// place and a light source, with no aesthetic words of its own — because the
// whole point is that the only thing separating two previews is the style's own
// fragment. A prompt that already said "cinematic" or "neon" would flatter every
// style equally and tell the user nothing about the one they just wrote.
export const STYLE_PREVIEW_PROMPT =
  'a lone figure standing on a bridge above a wide city, looking out at the skyline, early evening light'

// Where a preview goes when the style recommends nothing: the cheapest image
// model in the catalog (1 credit). A preview is a sanity check, not a delivery.
export const PREVIEW_FALLBACK_MODEL_ID = 'flux-schnell'

// Matches every other poller in the app (Canvas useNodeGeneration, Cinema
// useShotGeneration) so the shared ['generation', id] cache entry has one cadence.
const PREVIEW_POLL_INTERVAL_MS = 4000

// Rewrite the cached registry in place. `old` undefined means the list was never
// loaded (a write from a surface that never rendered it) — returning it untouched
// is what stops a single write from fabricating a one-item registry that would
// flash the wrong contents and then be replaced (the Creator absorb precedent).
function writeStyles(queryClient: QueryClient, apply: (items: Style[]) => Style[]): void {
  queryClient.setQueryData<StyleList>(STYLES_KEY, (old) =>
    old ? { ...old, items: apply(old.items) } : old,
  )
}

export function useStyles() {
  return useQuery({
    queryKey: STYLES_KEY,
    queryFn: () => api<StyleList>('/api/styles'),
  })
}

// The three writes ABSORB their answer instead of invalidating: the server hands
// back the whole row it just wrote, so a refetch would throw that away and add a
// round-trip to the moment the user is watching (the same discipline the Creator
// module documents). Every picker in the app reads this one cache, so a style
// created here is selectable in Cinema before the next render.
export function useCreateStyle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStyleInput) =>
      api<Style>('/api/styles', { method: 'POST', body: JSON.stringify(input) }),
    // APPEND, not prepend: the builtin seven lead the list server-side, and a new
    // style landing above them would reorder the row a user was just reading.
    onSuccess: (created) => writeStyles(queryClient, (items) => [...items, created]),
  })
}

export function useUpdateStyle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStyleInput }) =>
      api<Style>(`/api/styles/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (updated) =>
      writeStyles(queryClient, (items) =>
        items.map((style) => (style.id === updated.id ? updated : style)),
      ),
  })
}

export function useDeleteStyle() {
  const queryClient = useQueryClient()
  return useMutation({
    // 204 No Content — the api helper tolerates an empty body
    mutationFn: (id: string) => api<void>(`/api/styles/${id}`, { method: 'DELETE' }),
    onSuccess: (_answer, id) =>
      writeStyles(queryClient, (items) => items.filter((style) => style.id !== id)),
  })
}

// The generation this preview is waiting on. Held as ONE object so the style and
// its run can never drift apart mid-flight.
type PendingPreview = {
  styleId: string
  generationId: string
}

// Generate a style's sample image. This is an ORDINARY paid generation (ADR D6 —
// the registry itself never charges): submit through the money path, poll the
// shared generation cache, and on success CITE the run on the style (canvas-mode
// D1 — a style cites a generation, it never owns the file).
export function useStylePreview() {
  const queryClient = useQueryClient()
  const attach = useUpdateStyle()
  const [pending, setPending] = useState<PendingPreview | null>(null)

  const submit = useMutation({
    mutationFn: (style: Style) =>
      api<Generation>('/api/generations', {
        method: 'POST',
        body: JSON.stringify({
          // The style's own advice first — a style built for a video model still
          // previews as an image, so this is only honoured when it names one the
          // catalog has; the server refuses anything else before charging.
          modelId: style.recommendedModelId ?? PREVIEW_FALLBACK_MODEL_ID,
          prompt: STYLE_PREVIEW_PROMPT,
          // The whole point: the server resolves this id through the registry and
          // composes the style's fragments in — exactly as a real generation does.
          promptPreset: { styleId: style.id },
          aspectRatio: '1:1',
        }),
      }),
    onSuccess: (generation, style) => {
      // Seed the entry every poller in the app shares, and refresh the balance
      // chip — a preview costs credits like any other run.
      queryClient.setQueryData(['generation', generation.id], generation)
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      setPending({ styleId: style.id, generationId: generation.id })
    },
  })

  const generationId = pending?.generationId ?? null
  const poll = useQuery({
    queryKey: ['generation', generationId ?? ''],
    enabled: generationId !== null,
    queryFn: () => api<Generation>(`/api/generations/${generationId}`),
    refetchInterval: (query) => {
      // A first-poll error stops the interval instead of hammering a dead id.
      if (query.state.status === 'error' && query.state.data === undefined) return false
      return query.state.data?.status === 'processing' ? PREVIEW_POLL_INTERVAL_MS : false
    },
    // TanStack pauses interval refetches on a hidden tab, and this app disables
    // refetchOnWindowFocus globally — together, a preview started and then tabbed
    // away from would spin forever (the Creator transcript's live finding).
    refetchIntervalInBackground: true,
  })

  // The run succeeded: cite it on the style. A reaction to an EXTERNAL event (the
  // provider finishing), which is the one thing an effect is still for — and it
  // fires exactly once, because the deps only reach this combination once.
  //
  // Note what this does NOT do: it never clears `pending`. Clearing would be a
  // setState inside an effect (banned by react-hooks/set-state-in-effect, and a
  // needless extra render); the flight is DERIVED from the polled status below
  // instead. A settled `pending` costs nothing — `refetchInterval` already
  // returned false, so the query is parked, not looping.
  const status = poll.data?.status
  const attachPreview = attach.mutate
  useEffect(() => {
    if (pending === null || status !== 'succeeded') return
    attachPreview({ id: pending.styleId, input: { previewGenerationId: pending.generationId } })
  }, [pending, status, attachPreview])

  // The run is over when it reported a terminal status, or when the id never
  // answered at all (a dead generation must not spin a button forever).
  const isSettled =
    status === 'succeeded' || status === 'failed' || (poll.isError && poll.data === undefined)

  return {
    start: submit.mutate,
    // Which style is mid-preview: the one being submitted, then the one being
    // polled. Non-null through the WHOLE flight, so one card shows one spinner.
    pendingStyleId: submit.isPending
      ? (submit.variables?.id ?? null)
      : pending !== null && !isSettled
        ? pending.styleId
        : null,
    // A submit that never became a run (no credits, unknown model). The poll's own
    // failures are the generation's business and read off the row itself.
    error: submit.error,
    reset: submit.reset,
  } as const
}
