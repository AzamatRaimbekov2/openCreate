// apps/web/src/modules/Shorts/model/useBatchRun.ts
// The Shorts batch runner (ADR shorts-studio §3, §7).
//
// It is `useRunBranch` reshaped, and the reshaping is one word: PARALLEL.
// Portraits on a canvas are sequential because each view references the previous
// one; a shorts batch is N independent films × M independent beats, and nothing
// in it depends on anything else. So the loop becomes a small worker pool, and
// the interesting engineering moves from ordering to BOUNDING.
//
// Everything else is inherited deliberately rather than re-derived:
//
//   · A MODULE STORE, not React state and not the document store. useRunBranch
//     explains both rejections and both apply here. Component state dies when the
//     board unmounts — and this run outlives a navigation, because it is spending
//     money the whole time. The film document store is worse: every mutator there
//     marks the film dirty, and a poll ticking is not a document edit.
//   · A CANCEL TOKEN OUTSIDE REACT, checked BEFORE every submit. A re-render must
//     not be what stops a run that spends money, and each run gets its own token
//     so a cancel can never stop a later run by accident.
//   · ONE unpriceable item makes the total null — that rule lives in batchPlan.ts,
//     upstream of here. By the time `start` is called the user has already agreed
//     to a specific list at a specific price.
//   · The submit RETRY ALLOWLIST is imported from Cinema, not restated. Retrying
//     content_blocked / validation_failed cannot help, and retrying
//     insufficient_credits would re-cost the attempt.
//
// THE CAP, and what "in flight" means here. Four (ADR §7). A worker owns its beat
// from the submit through to a TERMINAL POLL, rather than releasing the slot the
// moment the row exists. That is the load-bearing detail: releasing early would
// bound submits at four but leave forty clips polling at ~15 req/min each, which
// is the entire 300/min global budget spent on asking. Holding the slot bounds
// both — four submits against the 20/min route limit, four pollers against the
// wall — and a batch larger than the cap does not fail, it queues behind it.
//
// FAILURE IS PER ITEM AND NEVER ABORTS THE BATCH (§3, following ExtractStage).
// The runner refunds nothing, ever: `generations.create` has already refunded
// internally by the time an error reaches this file, and a second refund here
// would be a bug that pays people twice.
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import type {
  AspectRatio,
  CatalogModel,
  CreateGenerationInput,
  FilmDetail,
  Generation,
  Shot,
} from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { composeShotClipInput, shouldRetrySubmit } from 'modules/Cinema'
import type { BatchRunItem } from './boardStatus'
import { isGeneratedBeat } from './boardStatus'
import { filmKey } from './batchApi'

// ADR §7. Not a tuning knob: 20/min on POST /api/generations, 300/min globally
// per IP, ~15 req/min per polling clip. Raising it needs the ADR changed first.
//
// It also caps POLLERS, not just submits, because a worker holds its slot until
// its clip settles — see the arithmetic at the `pollToTerminal` call in `runOne`,
// which is where someone trying to make this "faster" will end up.
export const MAX_IN_FLIGHT = 4

// Poll cadence and ceiling, matching every other poller in the app. A clip that
// has not settled in twenty minutes is stuck, not slow — polling it forever
// would pin a worker slot shut for the rest of the session.
const POLL_INTERVAL_MS = 4000
const POLL_BUDGET_MS = 20 * 60 * 1000

// One beat to run, carrying everything the submit needs. The shot travels WITH
// the item so the pool never reaches back into a cache mid-run: the films were
// created moments ago and their shots are drafts — there is nothing newer to read.
export type BatchWorkItem = {
  filmId: string
  filmTitle: string
  filmAspect: AspectRatio
  shot: Shot
}

// Every payable beat of every film, in film-then-beat order.
//
// TWO EXCLUSIONS, both of them money rules:
//   · a title card has no model and no prompt — it costs nothing and there is
//     nothing to submit;
//   · a beat that ALREADY cites a generation is skipped. Re-running it would
//     charge a second time for a clip that exists. This is `useRunBranch`'s
//     "satisfied node" rule, restated for a flat list: re-rolling one beat is a
//     per-item act with its own price on its own button, never a batch default.
export function collectBatchWork(films: readonly FilmDetail[]): BatchWorkItem[] {
  return films.flatMap((detail) =>
    detail.shots
      .filter((shot) => isGeneratedBeat(shot) && shot.generationId === null)
      .map((shot) => ({
        filmId: detail.film.id,
        filmTitle: detail.film.title,
        filmAspect: detail.film.aspectRatio,
        shot,
      })),
  )
}

export type BatchRunStatus = 'idle' | 'running' | 'done' | 'cancelled'

export type BatchRunState = {
  status: BatchRunStatus
  // Every beat this run touches, in submit order. The board reads it as an
  // OVERLAY on the derived truth (boardStatus.ts) — never as the truth itself.
  items: BatchRunItem[]
}

const IDLE: BatchRunState = { status: 'idle', items: [] }

type BatchRunStore = BatchRunState & {
  begin: (items: BatchRunItem[]) => void
  finish: (status: BatchRunStatus) => void
  patch: (shotId: string, patch: Partial<BatchRunItem>) => void
  reset: () => void
}

const useBatchRunStore = create<BatchRunStore>((set) => ({
  ...IDLE,
  begin: (items) => set({ status: 'running', items }),
  // A cancel already wrote 'cancelled'; the pool draining afterwards must not
  // overwrite it with 'done'.
  finish: (status) =>
    set((state) => (state.status === 'cancelled' ? state : { ...state, status })),
  patch: (shotId, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.shotId === shotId ? { ...item, ...patch } : item)),
    })),
  reset: () => set(IDLE),
}))

// Interruption lives OUTSIDE React state on purpose (useRunBranch's reasoning):
// the pool is plain async functions, and a re-render is not what should be able
// to stop one. Its presence is also the "one run at a time" guard — two
// overlapping runs would interleave submits and make the confirmed total a lie.
let activeRun: { cancelled: boolean } | null = null

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Test seam: drop the store AND any live token between specs.
export function resetBatchRun(): void {
  activeRun = null
  useBatchRunStore.getState().reset()
}

// Submit ONE beat, honouring the shared retry policy. The predicate is imported
// from Cinema rather than re-stated so there is exactly one answer in the app to
// "is this failure worth repeating".
async function submitWithRetry(input: CreateGenerationInput): Promise<Generation> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await api<Generation>('/api/generations', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    } catch (error) {
      if (!shouldRetrySubmit(attempt, error)) throw error
      await sleep(Math.min(1000 * 2 ** attempt, 4000))
    }
  }
}

// Point the shot at its new clip, and ABSORB the answer into the shared
// ['film', id] entry instead of invalidating it. Four workers invalidating one
// film detail would refetch the whole composite four times mid-run; the PATCH
// already returns the shot, so the board updates from the response it has.
async function linkShot(
  queryClient: QueryClient,
  filmId: string,
  shotId: string,
  generationId: string,
): Promise<void> {
  await api<Shot>(`/api/films/${filmId}/shots/${shotId}`, {
    method: 'PATCH',
    body: JSON.stringify({ generationId }),
  })
  queryClient.setQueryData<FilmDetail>(filmKey(filmId), (old) =>
    old
      ? {
          ...old,
          shots: old.shots.map((shot) => (shot.id === shotId ? { ...shot, generationId } : shot)),
        }
      : old,
  )
}

// Poll ONE generation to a terminal state through the SHARED ['generation', id]
// entry, so the board's own subscribers re-render off the same data — N watchers
// of one clip cost one poll, not N (ADR §7). Returns null when the run was
// cancelled or the budget ran out.
async function pollToTerminal(
  queryClient: QueryClient,
  generationId: string,
  run: { cancelled: boolean },
): Promise<Generation | null> {
  const startedAt = Date.now()
  for (;;) {
    const generation = await queryClient.fetchQuery({
      queryKey: ['generation', generationId],
      queryFn: () => api<Generation>(`/api/generations/${generationId}`),
      staleTime: 0,
    })
    if (generation.status === 'succeeded' || generation.status === 'failed') return generation
    if (run.cancelled) return null
    if (Date.now() - startedAt > POLL_BUDGET_MS) return null
    await sleep(POLL_INTERVAL_MS)
  }
}

// Run one beat end to end. It NEVER throws: a rejection here would take down the
// worker that owns it and, with it, every beat still queued behind that worker.
async function runOne(
  queryClient: QueryClient,
  item: BatchWorkItem,
  model: CatalogModel,
  run: { cancelled: boolean },
): Promise<void> {
  const { patch } = useBatchRunStore.getState()
  patch(item.shot.id, { status: 'submitting' })

  let generation: Generation
  try {
    generation = await submitWithRetry(composeShotClipInput(item.shot, model, item.filmAspect))
  } catch (error) {
    // A submit that was REFUSED created no generation row, so there is nothing to
    // poll and nothing was charged. The code is recorded against this beat alone
    // and the batch carries on — insufficient_credits mid-batch is the case this
    // exists for, and it must not look like the runner silently stopped.
    patch(item.shot.id, {
      status: 'failed',
      errorCode: error instanceof ApiClientError ? error.code : 'internal_error',
    })
    return
  }

  // Seed the shared cache before anything can subscribe to it, and record the id
  // on the item: shot.generationId is one request behind, and without this the
  // beat blinks back to "draft" next to a clip already paid for.
  queryClient.setQueryData(['generation', generation.id], generation)
  patch(item.shot.id, { status: 'processing', generationId: generation.id })
  // The balance moved. Refreshing it per submit is ~N extra requests across a
  // run measured in minutes — cheap, against a stale balance on the product's
  // largest spend, which is not.
  void queryClient.invalidateQueries({ queryKey: ['me'] })

  try {
    await linkShot(queryClient, item.filmId, item.shot.id, generation.id)
  } catch {
    // The clip exists and is paid for; only the citation failed. Keep going and
    // let the poll settle it — the board reads the id off the run item meanwhile.
  }

  // ─────────────────────────────────────────────────────────────────────────
  // THIS AWAIT IS WHY A BATCH IS SLOW, AND IT IS DELIBERATE. READ THE
  // ARITHMETIC BEFORE YOU MOVE IT.
  //
  // The worker's slot is held here, through the poll, instead of being released
  // as soon as the generation row exists. Releasing early is the obvious
  // speed-up and it is the wrong trade:
  //
  //   · 40 clips × ~15 req/min each (one poll per 4s) = ~600 req/min
  //   · the global wall is 300 req/min per IP
  //
  // So an "optimised" runner does not make a large batch faster — it makes the
  // WHOLE APP fail, for this user, on every route, while the batch runs. Holding
  // the slot bounds polling at 4 × ~15 = ~60 req/min and submits at 4 against
  // the 20/min route limit, and a batch bigger than the cap simply queues.
  //
  // Throughput is the cheaper thing to lose (owner call, 2026-08-20, confirming
  // ADR §7's strict reading). Changing this needs the ADR changed first.
  // ─────────────────────────────────────────────────────────────────────────
  const terminal = await pollToTerminal(queryClient, generation.id, run)
  if (terminal === null) return
  patch(item.shot.id, {
    status: terminal.status === 'succeeded' ? 'done' : 'failed',
    // A settled failure was already refunded server-side; the code is for copy.
    errorCode: terminal.status === 'failed' ? (terminal.errorCode ?? 'provider_error') : null,
  })
}

// The pool. A shared cursor and up to MAX_IN_FLIGHT workers pulling from it —
// the smallest structure that bounds concurrency without a scheduler, and the
// only place the cancel token is read before a charge.
async function runPool(
  queryClient: QueryClient,
  work: readonly BatchWorkItem[],
  models: readonly CatalogModel[],
  run: { cancelled: boolean },
): Promise<void> {
  let cursor = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      // BEFORE the charge, every time. This is the whole point of the token.
      if (run.cancelled) return
      const item = work[cursor]
      if (!item) return
      cursor += 1
      const model = models.find((candidate) => candidate.id === item.shot.modelId)
      if (!model) {
        // Unreachable past the plan's drift check, which refuses to run when the
        // catalog cannot price the tier. Recorded rather than thrown: a config
        // problem must not take the other beats down with it.
        useBatchRunStore.getState().patch(item.shot.id, {
          status: 'failed',
          errorCode: 'internal_error',
        })
        continue
      }
      await runOne(queryClient, item, model, run)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(MAX_IN_FLIGHT, work.length) }, () => worker()),
  )
}

export function useBatchRun() {
  const queryClient = useQueryClient()
  const state = useBatchRunStore()

  // `models` is a PARAMETER, not something this hook fetches — the same seam
  // useRunBranch uses. The catalog reaches this module through the route.
  const start = useCallback(
    async (films: readonly FilmDetail[], models: readonly CatalogModel[]): Promise<void> => {
      // The guard is SYNCHRONOUS and comes before any await: two calls in one
      // tick must not both claim the run.
      if (activeRun) return
      const work = collectBatchWork(films)
      if (work.length === 0) return

      const thisRun = { cancelled: false }
      activeRun = thisRun
      useBatchRunStore.getState().begin(
        work.map((item) => ({
          filmId: item.filmId,
          shotId: item.shot.id,
          status: 'queued' as const,
          generationId: null,
          errorCode: null,
        })),
      )

      try {
        await runPool(queryClient, work, models, thisRun)
      } finally {
        // Only THIS run may release the token, and only its own — a late finish
        // must never clear a token a newer run is holding.
        if (activeRun === thisRun) activeRun = null
        useBatchRunStore.getState().finish('done')
      }
    },
    [queryClient],
  )

  const cancel = useCallback(() => {
    if (activeRun) activeRun.cancelled = true
    useBatchRunStore.getState().finish('cancelled')
  }, [])

  // Re-run ONE beat. A fresh, fully-priced attempt: the previous failure either
  // never charged (a refused submit) or was already refunded (a settled failure),
  // so this is a new purchase and the board says so on the control.
  //
  // Refused while a batch is running — it would be a fifth submit past the cap,
  // and past a total the user confirmed for a different list of beats.
  const retryBeat = useCallback(
    async (shot: Shot, model: CatalogModel, filmAspect: AspectRatio): Promise<void> => {
      if (activeRun) return
      const thisRun = { cancelled: false }
      activeRun = thisRun
      const item: BatchWorkItem = {
        filmId: shot.filmId,
        filmTitle: '',
        filmAspect,
        shot,
      }
      // A beat retried outside its original run has no row yet — give it one, so
      // the chip has something to move.
      const store = useBatchRunStore.getState()
      if (!store.items.some((existing) => existing.shotId === shot.id)) {
        store.begin([
          ...store.items,
          {
            filmId: shot.filmId,
            shotId: shot.id,
            status: 'queued',
            generationId: null,
            errorCode: null,
          },
        ])
      } else {
        store.patch(shot.id, { status: 'queued', generationId: null, errorCode: null })
      }

      try {
        await runOne(queryClient, item, model, thisRun)
      } finally {
        if (activeRun === thisRun) activeRun = null
        useBatchRunStore.getState().finish('done')
      }
    },
    [queryClient],
  )

  return { start, cancel, retryBeat, state }
}

// Is a batch running right now? The Run pill reads it: a second run would
// interleave submits and make the confirmed total meaningless.
export function useIsBatchRunning(): boolean {
  return useBatchRunStore((run) => run.status === 'running')
}

// This beat's row in the live run, or undefined. The board uses it as the
// OVERLAY described in boardStatus.ts — queued / submitting / a submit that
// never created a generation. The cache stays the truth about everything else.
export function useBatchRunItem(shotId: string): BatchRunItem | undefined {
  return useBatchRunStore((run) => run.items.find((item) => item.shotId === shotId))
}

// Every beat row of the live run. Read once per component rather than once per
// beat: a film header needs all of them to count progress, and forty store
// subscriptions to answer one question is forty re-render paths for no gain.
export function useBatchRunItems(): BatchRunItem[] {
  return useBatchRunStore((run) => run.items)
}
