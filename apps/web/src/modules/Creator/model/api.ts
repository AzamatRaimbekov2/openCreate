// apps/web/src/modules/Creator/model/api.ts
// Typed /api/creator calls + TanStack Query hooks. Query keys:
// ['creator-sessions'] (the rail) and ['creator-session', id] (one transcript).
//
// The server owns the whole story: every POST answers 202 with the transcript SO
// FAR (the agent's turn runs detached, for minutes), so a mutation's job is to
// WRITE that answer into the cache — never to invalidate and refetch what it was
// just handed. The poll below then carries the conversation forward.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { CreatorSession, CreatorSessionDetail, CreatorSessionList } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { toast } from 'shared/ui'

// 2s, not the 4s the generation pollers use: a turn emits a step message every
// few seconds (a tool call, not a provider render), and a chat that lags its own
// progress by four seconds reads as frozen.
export const CREATOR_POLL_INTERVAL_MS = 2000

// The shape of the poll decision, narrowed from TanStack's query state so the
// rule below can be tested without a live query.
export type SessionPollState = {
  status: 'pending' | 'error' | 'success'
  data: CreatorSessionDetail | undefined
}

// WHEN a transcript is still moving. `running` is the obvious one; `awaiting_confirm`
// is the subtle one and it is deliberate: the gate can be left without THIS tab
// acting (a second tab confirms, a new message resets the budget, the stale
// reaper fails the turn), and a stopped poll would leave a live «Подтвердить»
// button hanging over a dead plan.
export function sessionPollInterval(state: SessionPollState): number | false {
  // A first load that errored has no id worth retrying on a timer — the
  // ErrorState's retry is the way back (canvas useNodeGeneration precedent).
  if (state.status === 'error' && state.data === undefined) return false
  const status = state.data?.status
  return status === 'running' || status === 'awaiting_confirm' ? CREATOR_POLL_INTERVAL_MS : false
}

// Everything a 202 does to the cache, in one place: the transcript replaces the
// detail entry, and the rail row is upserted from it — prepended when the
// session is new (the newest conversation leads), updated IN PLACE otherwise so
// the list does not reshuffle under the user mid-turn. An unloaded rail is left
// alone: fabricating a one-item list would flash a wrong "you have 1 session".
export function absorbSessionDetail(queryClient: QueryClient, detail: CreatorSessionDetail): void {
  queryClient.setQueryData(['creator-session', detail.id], detail)
  // The rail speaks summaries, so the row is built FIELD BY FIELD rather than by
  // stripping `messages` off the detail: an explicit pick is checked against the
  // CreatorSession contract, so a field added to the detail later cannot silently
  // leak into the list cache.
  const summary: CreatorSession = {
    id: detail.id,
    title: detail.title,
    status: detail.status,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  }
  queryClient.setQueryData<CreatorSessionList>(['creator-sessions'], (old) => {
    if (!old) return old
    const known = old.items.some((item) => item.id === summary.id)
    return {
      items: known
        ? old.items.map((item) => (item.id === summary.id ? summary : item))
        : [summary, ...old.items],
    }
  })
}

// A 409 is an expected STATE RACE, not a failure: the poll simply had not caught
// up when the click landed (a turn had already started, or the plan was already
// answered elsewhere). So it is a QUIET INFO toast plus a refetch that makes the
// UI agree with the server — never an error screen over a conversation that is
// perfectly fine. Anything else falls through to the surface's own inline copy.
function useTurnErrorHandler(sessionId: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  return (error: unknown) => {
    if (!(error instanceof ApiClientError) || error.code !== 'conflict') return
    toast.info({
      title: t('creator.busy.title'),
      description: t('creator.busy.description'),
      // Collapses a double-click into one notice
      dedupeKey: `creator-busy:${sessionId}`,
    })
    void queryClient.invalidateQueries({ queryKey: ['creator-session', sessionId] })
  }
}

export function useCreatorSessions() {
  return useQuery({
    queryKey: ['creator-sessions'],
    queryFn: () => api<CreatorSessionList>('/api/creator/sessions'),
  })
}

// One conversation, polled while it moves. `null` = nothing selected yet (a
// fresh visit with an empty rail), which keeps the hook unconditional.
export function useCreatorSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['creator-session', sessionId ?? ''],
    enabled: sessionId !== null,
    queryFn: () => api<CreatorSessionDetail>(`/api/creator/sessions/${sessionId}`),
    refetchInterval: (query) => sessionPollInterval(query.state),
    // An agent turn runs for MINUTES and users tab away while it works. TanStack
    // pauses interval refetches in hidden tabs by default, and this app disables
    // refetchOnWindowFocus globally — together that froze a backgrounded
    // transcript on «агент работает…» FOREVER (found live 2026-07-30: the
    // interval callback armed and never ticked; document.visibilityState was
    // 'hidden'). Background polling keeps the story moving; sessionPollInterval
    // still stops it the moment the session settles, so an idle chat costs zero.
    refetchIntervalInBackground: true,
  })
}

export function useCreateCreatorSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (message: string) =>
      api<CreatorSessionDetail>('/api/creator/sessions', {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
    onSuccess: (detail) => absorbSessionDetail(queryClient, detail),
  })
}

export function usePostCreatorMessage(sessionId: string) {
  const queryClient = useQueryClient()
  const onTurnError = useTurnErrorHandler(sessionId)
  return useMutation({
    mutationFn: (message: string) =>
      api<CreatorSessionDetail>(`/api/creator/sessions/${sessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
    onSuccess: (detail) => absorbSessionDetail(queryClient, detail),
    onError: onTurnError,
  })
}

// THE BUDGET GATE's click. No body — the plan being confirmed is the one in the
// transcript, so there is nothing for the client to choose or tamper with.
export function useConfirmCreatorPlan(sessionId: string) {
  const queryClient = useQueryClient()
  const onTurnError = useTurnErrorHandler(sessionId)
  return useMutation({
    mutationFn: () =>
      api<CreatorSessionDetail>(`/api/creator/sessions/${sessionId}/confirm`, { method: 'POST' }),
    onSuccess: (detail) => {
      absorbSessionDetail(queryClient, detail)
      // The confirmed turn spends credits — the balance chip must not keep
      // quoting the pre-run number while the agent works.
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    onError: onTurnError,
  })
}

// Re-exported for the components: a rail row and a transcript are the two shapes
// they render, and importing them from here keeps the module's data vocabulary
// in one file.
export type { CreatorSession, CreatorSessionDetail }
