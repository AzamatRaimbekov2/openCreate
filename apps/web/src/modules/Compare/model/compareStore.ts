// apps/web/src/modules/Compare/model/compareStore.ts
// Zustand store for the hidden /compare page. Generation logic lives HERE as
// plain async actions (NOT in a React hook) — the plan doc's "call
// useParallelGeneration() inside the store" is invalid React (hooks cannot run
// outside a component), and a store action calling a plain service function is
// the idiomatic Zustand shape this codebase already uses.
import { create } from 'zustand'
import { COMPARE_PROVIDERS, runCompareProvider } from './providers'
import type { CompareProviderId, PanelResult } from './types'

const EMPTY_RESULT: PanelResult = { status: 'empty' }
const LOADING_RESULT: PanelResult = { status: 'loading' }

function initialResults(): Record<CompareProviderId, PanelResult> {
  return {
    'flux-dev': EMPTY_RESULT,
    'nano-banana-pro': EMPTY_RESULT,
    'qwen-image-max': EMPTY_RESULT,
  }
}

// Module-scope, NOT store state: no render depends on the controller itself,
// and keeping it out of state avoids pointless notifications on every run.
let controller: AbortController | null = null

export type CompareStore = {
  prompt: string
  // One result per contender — each panel renders its entry independently.
  results: Record<CompareProviderId, PanelResult>
  // True while a full run is in flight (drives the form's disabled state and
  // the elapsed timer). A single-panel retry deliberately does NOT set it —
  // the other panels' results stay interactable.
  isGenerating: boolean
  setPrompt: (prompt: string) => void
  // Fire ALL contenders in parallel. Resolves when every panel has settled.
  generateAll: () => Promise<void>
  // Re-run ONE contender, leaving the others untouched (spec: independent retry).
  retry: (id: CompareProviderId) => Promise<void>
  // Clear prompt + panels and cancel anything in flight.
  reset: () => void
  // Cancel in-flight requests without clearing results (page unmount).
  abort: () => void
}

export const useCompareStore = create<CompareStore>((set, get) => ({
  prompt: '',
  results: initialResults(),
  isGenerating: false,

  setPrompt: (prompt) => set({ prompt }),

  generateAll: async () => {
    const prompt = get().prompt.trim()
    if (!prompt || get().isGenerating) return
    // A new run invalidates the old one — abort so stale responses can't win.
    controller?.abort()
    controller = new AbortController()
    const { signal } = controller

    set({
      isGenerating: true,
      results: {
        'flux-dev': LOADING_RESULT,
        'nano-banana-pro': LOADING_RESULT,
        'qwen-image-max': LOADING_RESULT,
      },
    })

    // Promise.all is safe: runCompareProvider NEVER rejects (it folds every
    // failure into an error PanelResult), so one contender can't sink the run.
    await Promise.all(
      COMPARE_PROVIDERS.map(async ({ id }) => {
        const result = await runCompareProvider(id, prompt, signal)
        // THE RACE GUARD: a result belonging to an aborted run must not
        // overwrite the run that replaced it. Each write re-checks ITS OWN
        // signal — the old run's signal is aborted, the new run's is not.
        if (signal.aborted) return
        set((state) => ({ results: { ...state.results, [id]: result } }))
      }),
    )
    if (!signal.aborted) set({ isGenerating: false })
  },

  retry: async (id) => {
    const prompt = get().prompt.trim()
    if (!prompt) return
    // Reuse the live controller so page-leave still cancels the retry; mint a
    // fresh one only when the previous run was already aborted.
    if (!controller || controller.signal.aborted) controller = new AbortController()
    const { signal } = controller

    set((state) => ({ results: { ...state.results, [id]: LOADING_RESULT } }))
    const result = await runCompareProvider(id, prompt, signal)
    if (signal.aborted) return
    set((state) => ({ results: { ...state.results, [id]: result } }))
  },

  reset: () => {
    controller?.abort()
    controller = null
    set({ prompt: '', results: initialResults(), isGenerating: false })
  },

  abort: () => {
    controller?.abort()
    controller = null
    set({ isGenerating: false })
  },
}))
