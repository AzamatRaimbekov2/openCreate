// apps/web/src/modules/Canvas/model/useRunBranch.ts
// "Run branch" — ADR canvas-mode D5: execution is CLIENT-ORCHESTRATED and spend
// stays explicit. The client topo-sorts what the target actually needs, prices it,
// asks ONCE with an itemized total, then runs the nodes one at a time. Auto-cascade
// was rejected precisely because one edit must never trigger N unconfirmed charges;
// this file is the opposite of that — nothing here starts without a confirmed plan.
//
// Three halves:
//   1. PURE planning (`collectBranch`, `estimateBranchCredits`, `buildBranchPlan`)
//      — unit-testable with plain objects, no React, no cache reaching.
//   2. A tiny module STORE holding the live run so every node can see it.
//   3. The `useRunBranch` hook: the sequential submit → poll → next loop.
//
// The money rules live in the planner, not in the loop: by the time `run()` starts,
// the user has already agreed to a specific list at a specific price.
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeKind,
  CreateGenerationInput,
  Generation,
} from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { ApiClientError } from 'shared/libs/apiClient'
import type { CanvasModelOption } from './types'
import { useCanvasStore } from './canvasStore'
import {
  absorbGeneration,
  buildRunInput,
  composeNodePrompt,
  findCharacterParent,
  findMediaParent,
  shouldRetrySubmit,
} from './useNodeGeneration'

// Kinds that a branch can actually execute. `character`, `upload`, `prompt` and
// `note` never run — they are graph furniture, not jobs (spec §4 node table;
// the prompt card joins that list by ADR canvas-prompt-node D5, which is why it
// can never appear as a priced row in the plan).
const RUNNABLE_KINDS: readonly CanvasNodeKind[] = ['image', 'video']

// Poll cadence and ceiling, matching the per-node poller (Generator rules): a
// generation that has not settled in 20 minutes is treated as stuck rather than
// polled forever, which would pin a branch open for the rest of the session.
const POLL_INTERVAL_MS = 4000
const POLL_BUDGET_MS = 20 * 60 * 1000

// Why a plan cannot run. Machine codes, never prose: the dialog maps them to
// localized copy (design.md §9 — the UI never renders a raw reason string).
export type BranchBlockReason =
  // no prompt / no model on some node in the chain
  | 'config'
  // a character is wired into some node but nobody has been cast
  | 'character'
  // some node's media parent can never produce an output during THIS run
  // (an upload today; phase 4 makes uploads citable)
  | 'parent'
  // everything the target needs already exists — there is nothing to charge for
  | 'nothingToRun'

// One priced row of the plan. `credits` is null when the node's model is not in
// the catalog (a stale document): a null price is not a price, so the dialog
// disables the confirm rather than inventing a number (SpendConfirmModal's law).
export type BranchItem = {
  nodeId: string
  kind: CanvasNodeKind
  modelName: string | null
  credits: number | null
}

export type BranchPlan =
  | { ok: true; nodeIds: string[]; items: BranchItem[]; total: number | null }
  | { ok: false; nodeId: string; reason: BranchBlockReason }

// A node is SATISFIED when its newest run succeeded: its output exists, so the
// branch neither re-runs it nor pays for anything behind it. Deliberately the
// LATEST id and not "any succeeded id in history" — a node whose last attempt
// failed must re-run, even though an older version of it once worked.
function isSatisfied(
  node: CanvasNode,
  generationStatus: Readonly<Record<string, Generation['status'] | undefined>>,
): boolean {
  const latest = node.generationIds[node.generationIds.length - 1]
  return latest !== undefined && generationStatus[latest] === 'succeeded'
}

// Topo-sorted list of the runs the target needs, dependencies first, target last.
//
// The walk STOPS at a satisfied node: it is excluded AND so is everything behind
// it. That is a money decision, not an optimization — the literal reading ("all
// ancestors minus the succeeded ones") would re-run a grandparent whose child is
// already done, and that child will never re-run to consume the fresh output, so
// the user would be charged for an image nobody reads.
//
// No cycle guard is needed: `edgeRules.canConnect` refuses cycle-closing edges at
// drag time AND at write time, so a stored graph is acyclic by construction. The
// `seen` set is here for DIAMONDS (two paths to one ancestor), not for loops.
export function collectBranch(
  targetId: string,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  generationStatus: Readonly<Record<string, Generation['status'] | undefined>> = {},
): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const order: string[] = []
  const seen = new Set<string>()

  const visit = (id: string): void => {
    if (seen.has(id)) return
    seen.add(id)
    const node = byId.get(id)
    if (!node) return
    if (!RUNNABLE_KINDS.includes(node.kind)) return
    if (isSatisfied(node, generationStatus)) return
    // Parents first — that is what makes the returned order runnable as-is.
    for (const edge of edges) {
      if (edge.targetNodeId === id) visit(edge.sourceNodeId)
    }
    order.push(id)
  }

  visit(targetId)
  return order
}

// Could this node run once the nodes PLANNED BEFORE IT have succeeded? That is a
// different question from `buildRunInput`'s (which asks "can it run right now"),
// and the difference is the whole point of a branch: a child whose parent has
// never produced anything is fine, as long as the parent is in the plan.
function blockerFor(
  node: CanvasNode,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  generationStatus: Readonly<Record<string, Generation['status'] | undefined>>,
  planned: ReadonlySet<string>,
): BranchBlockReason | null {
  // The COMPOSED prompt (ADR canvas-prompt-node D3) — the plan must ask exactly
  // the question buildRunInput asks, or a node fed by a wired template blocks
  // the whole branch while its own Generate button runs it fine.
  const prompt = composeNodePrompt(node, nodes, edges)
  if (prompt.length < 2 || !node.config.modelId) return 'config'

  const characterParent = findCharacterParent(node.id, nodes, edges)
  if (characterParent && !characterParent.config.entityId) return 'character'

  const mediaParent = findMediaParent(node.id, nodes, edges)
  if (mediaParent) {
    const hasOutput = mediaParent.generationIds.some(
      (id) => generationStatus[id] === 'succeeded',
    )
    // An upload has no generation to cite (phase 4), and a non-planned parent
    // with no output will still have none when this node's turn comes.
    if (mediaParent.kind === 'upload') return 'parent'
    if (!hasOutput && !planned.has(mediaParent.id)) return 'parent'
  }
  return null
}

// Itemized cost. Image models are flat; a video bills per duration, and the row
// must show the duration the node is actually SET to — advertising the cheapest
// clip while a longer one is selected is the same lie the node cards refuse.
export function estimateBranchCredits(
  nodeIds: readonly string[],
  nodes: readonly CanvasNode[],
  models: readonly CanvasModelOption[],
): { items: BranchItem[]; total: number | null } {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const items: BranchItem[] = nodeIds.flatMap((nodeId) => {
    const node = byId.get(nodeId)
    if (!node) return []
    const model = models.find((candidate) => candidate.id === node.config.modelId)
    let credits: number | null = null
    if (model) {
      if (node.kind === 'video') {
        const duration = node.config.duration ?? model.durationOptions?.[0]
        credits = model.creditsByDuration?.[String(duration)] ?? model.credits
      } else {
        credits = model.credits
      }
    }
    return [{ nodeId, kind: node.kind, modelName: model?.name ?? null, credits }]
  })
  // One unknown price makes the TOTAL unknown. Summing the rest would print a
  // number smaller than the real charge.
  const total = items.some((item) => item.credits === null)
    ? null
    : items.reduce((sum, item) => sum + (item.credits ?? 0), 0)
  return { items, total }
}

// The live statuses the plan depends on come from the shared ['generation', id]
// cache — the same entry every node poller writes. Read here (not inside the pure
// functions) so planning stays a pure function of plain data.
function statusSnapshot(
  nodes: readonly CanvasNode[],
  queryClient: QueryClient,
): Record<string, Generation['status'] | undefined> {
  const statuses: Record<string, Generation['status'] | undefined> = {}
  for (const node of nodes) {
    for (const id of node.generationIds) {
      statuses[id] = queryClient.getQueryData<Generation>(['generation', id])?.status
    }
  }
  return statuses
}

// Pure over (graph, catalog, cache): what would running this branch cost, and can
// it run at all? Exported for tests; the hook calls it with the live store.
export function buildBranchPlan(
  targetId: string,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  models: readonly CanvasModelOption[],
  queryClient: QueryClient,
): BranchPlan {
  const generationStatus = statusSnapshot(nodes, queryClient)
  const nodeIds = collectBranch(targetId, nodes, edges, generationStatus)
  if (nodeIds.length === 0) return { ok: false, nodeId: targetId, reason: 'nothingToRun' }

  const byId = new Map(nodes.map((node) => [node.id, node]))
  // Walk in RUN order and grow the planned set as we go, so "my parent runs
  // before me" is decided by position in the plan, not by mere membership.
  const planned = new Set<string>()
  for (const nodeId of nodeIds) {
    const node = byId.get(nodeId)
    if (!node) return { ok: false, nodeId, reason: 'config' }
    const reason = blockerFor(node, nodes, edges, generationStatus, planned)
    if (reason) return { ok: false, nodeId, reason }
    planned.add(nodeId)
  }

  const { items, total } = estimateBranchCredits(nodeIds, nodes, models)
  return { ok: true, nodeIds, items, total }
}

// ── The live run ─────────────────────────────────────────────────────────────
// A module store, NOT node data: the run state changes several times per node,
// and node data identity is part of the editor's React Flow cache key (a data
// object rebuilt mid-run would re-create every RF node object and re-introduce
// the v12 focus-loss flicker). It is also NOT canvasStore: every mutator there
// marks the document dirty, and a run in progress is not a document edit —
// autosave must not fire because a poll ticked.
export type BranchRunState = {
  status: 'idle' | 'running' | 'done' | 'failed'
  // The node currently submitting/polling — its card shows the live status
  activeNodeId: string | null
  // Everything this run will touch; nodes use it to disable their own Generate
  nodeIds: string[]
  // Where it stopped, and why (machine code — the node renders its own copy)
  failedNodeId: string | null
  errorCode: string | null
}

const IDLE: BranchRunState = {
  status: 'idle',
  activeNodeId: null,
  nodeIds: [],
  failedNodeId: null,
  errorCode: null,
}

const useBranchRunStore = create<BranchRunState & { set: (patch: Partial<BranchRunState>) => void }>(
  (set) => ({ ...IDLE, set: (patch) => set(patch) }),
)

// Interruption lives OUTSIDE React state on purpose: the loop is a plain async
// function, and a re-render is not what should be able to stop it. Each run gets
// its own token, so a cancel can never stop a later run by accident.
let activeRun: { cancelled: boolean } | null = null

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Submit ONE node, honouring the shared retry policy. The predicate is imported
// rather than re-stated (see useNodeGeneration.shouldRetrySubmit for why the
// policy is shared but the loop is not).
async function submitWithRetry(
  queryClient: QueryClient,
  nodeId: string,
  input: CreateGenerationInput,
): Promise<Generation> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const generation = await api<Generation>('/api/generations', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      absorbGeneration(queryClient, nodeId, generation)
      return generation
    } catch (error) {
      if (!shouldRetrySubmit(attempt, error)) throw error
      await sleep(Math.min(1000 * 2 ** attempt, 4000))
    }
  }
}

// Poll ONE generation to a terminal state through the SHARED cache entry, so the
// node's own `useNodeGeneration` subscription re-renders from the same data (no
// second source of truth for "how is this run doing"). Returns the terminal
// generation, or null when the run was interrupted or ran out of budget.
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

export function useRunBranch() {
  const queryClient = useQueryClient()
  const state = useBranchRunStore()

  // `models` is a PARAMETER, not something this hook fetches: the catalog reaches
  // the Canvas module only through the route seam (as node data), because the
  // module may not import modules/Generator. The caller is a node, and a node
  // already holds exactly this array.
  const buildPlan = useCallback(
    (targetId: string, models: readonly CanvasModelOption[] = []): BranchPlan => {
      const { nodes, edges } = useCanvasStore.getState()
      return buildBranchPlan(targetId, nodes, edges, models, queryClient)
    },
    [queryClient],
  )

  const cancel = useCallback(() => {
    if (activeRun) activeRun.cancelled = true
    useBranchRunStore.getState().set(IDLE)
  }, [])

  const run = useCallback(
    async (plan: Extract<BranchPlan, { ok: true }>): Promise<void> => {
      const thisRun = { cancelled: false }
      activeRun = thisRun
      const canvasId = useCanvasStore.getState().canvasId
      useBranchRunStore.getState().set({
        status: 'running',
        nodeIds: plan.nodeIds,
        activeNodeId: plan.nodeIds[0] ?? null,
        failedNodeId: null,
        errorCode: null,
      })

      for (const nodeId of plan.nodeIds) {
        // Two ways a run stops being wanted: an explicit cancel, or the board
        // being left (the route's reset() nulls canvasId). Checked BEFORE every
        // charge, because the point is to not spend money nobody asked for.
        if (thisRun.cancelled) return
        if (useCanvasStore.getState().canvasId !== canvasId) return

        // FRESH store read per node — the previous iteration appended a
        // generation id to its node, and this node's input cites it. A snapshot
        // taken before the loop would cite nothing and submit a plain t2i.
        const { nodes, edges } = useCanvasStore.getState()
        const node = nodes.find((candidate) => candidate.id === nodeId)
        if (!node) return
        const input = buildRunInput(node, nodes, edges, statusSnapshot(nodes, queryClient))
        if (!input) {
          useBranchRunStore.getState().set({
            status: 'failed',
            activeNodeId: null,
            failedNodeId: nodeId,
            errorCode: 'not_runnable',
          })
          return
        }

        useBranchRunStore.getState().set({ activeNodeId: nodeId })
        let generation: Generation
        try {
          generation = await submitWithRetry(queryClient, nodeId, input)
        } catch (error) {
          // The node itself shows nothing for a submit that never created a row,
          // so the branch state carries the reason (insufficient credits is the
          // one users hit most).
          useBranchRunStore.getState().set({
            status: 'failed',
            activeNodeId: null,
            failedNodeId: nodeId,
            errorCode: error instanceof ApiClientError ? error.code : 'internal_error',
          })
          return
        }

        const terminal = await pollToTerminal(queryClient, generation.id, thisRun)
        if (terminal === null) return
        if (terminal.status === 'failed') {
          // Spec: the failed node shows its own error card (with the refund chip);
          // downstream never starts. The branch stops here, quietly.
          useBranchRunStore.getState().set({
            status: 'failed',
            activeNodeId: null,
            failedNodeId: nodeId,
            errorCode: terminal.errorCode ?? 'provider_error',
          })
          return
        }
      }

      useBranchRunStore.getState().set({ status: 'done', activeNodeId: null })
    },
    [queryClient],
  )

  return { buildPlan, run, cancel, state }
}

// Is this node part of a branch that is running right now? Nodes call this to
// disable their own Generate (a second charge for a node the queue is about to
// submit is exactly the double-spend the confirm dialog exists to prevent).
export function useIsBranchBusy(nodeId: string): boolean {
  return useBranchRunStore(
    (branch) => branch.status === 'running' && branch.nodeIds.includes(nodeId),
  )
}

// Is ANY branch running? The "Run branch" pill uses it: two overlapping queues
// would interleave submits and make the confirmed total meaningless.
export function useIsBranchRunning(): boolean {
  return useBranchRunStore((branch) => branch.status === 'running')
}

// The machine code for a branch failure ON THIS NODE, or null. It exists because
// a submit that never created a generation row — `insufficient_credits` above all
// — leaves the node with no failed run to render, and a queue that stops without
// saying why is indistinguishable from one that finished.
export function useBranchNodeError(nodeId: string): string | null {
  return useBranchRunStore((branch) =>
    branch.status === 'failed' && branch.failedNodeId === nodeId ? branch.errorCode : null,
  )
}
