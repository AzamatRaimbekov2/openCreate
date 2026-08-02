// apps/web/src/modules/Compare/model/videoCompareStore.ts
// Zustand store for the hidden /compare-video cost page. Same shape as
// compareStore.ts (plain async actions, module-scope AbortController), with one
// structural difference: this page issues ONE request that settles both channels,
// so there is a single run state instead of a record of per-panel results.
//
// WHY ONE REQUEST INSTEAD OF TWO. The comparison's credibility rests on both
// channels receiving byte-identical settings; the server builds that input once
// and races the pipes itself. Two browser requests would let a user edit the form
// mid-flight and produce a receipt whose two halves priced different jobs.
import { create } from 'zustand'
import type { CompareVideoResult } from '@opencreate/contracts'
import { api, ApiClientError } from 'shared/libs/apiClient'
import type { VideoRunState } from './videoTypes'

// The band the server accepts (contracts: 4-15s). The catalog only SELLS 5/10/15,
// but an operator probing a price curve wants the in-between points, so the page
// offers the full range the endpoint will take.
export const VIDEO_DURATIONS = [4, 5, 8, 10, 12, 15] as const
export const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const

// Both channels carry both models. 1.5 Pro exists here as the CHEAP way to verify
// the page itself: a Seedance 2.0 run costs roughly $1.86, a 1.5 Pro run about a
// tenth of that, and checking that the machinery works should not require buying
// the expensive question.
export const VIDEO_MODELS = [
  { id: 'seedance-2-0', label: 'Seedance 2.0', note: 'дорогой — ради него всё и затевалось' },
  { id: 'seedance-1-5-pro', label: 'Seedance 1.5 Pro', note: '≈в 10× дешевле, для проверки' },
] as const

export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number]
export type VideoModelId = (typeof VIDEO_MODELS)[number]['id']

// kie.ai's published credits-per-second, "no video input" column — the row this
// product is always on, because it sends text or an image and never a video.
//
// WHY THIS TABLE IS IN THE UI AT ALL, when the whole page exists to stop trusting
// rate cards: it is not used to REPORT a cost, only to PREDICT one before spending.
// Three runs in a row died on "Credits insufficient" because nothing on screen said
// that flipping 720p → 1080p multiplies the bill by 2.5, and the settings survive a
// "reset" (which only clears the prompt). A receipt still comes from the provider.
const KIE_CREDITS_PER_SECOND: Record<VideoModelId, Record<VideoResolution, number>> = {
  'seedance-2-0': { '480p': 19, '720p': 41, '1080p': 102 },
  // The without-audio row: the product forces `generate_audio: false` everywhere.
  'seedance-1-5-pro': { '480p': 1.75, '720p': 3.5, '1080p': 7.5 },
}

export const KIE_CREDIT_USD = 0.005

// Segmind's published rate: a FLAT $7.00 per million tokens on every resolution.
// Token count comes from the formula OpenRouter publishes and our own DeepInfra
// invoice confirmed to 0.28% — width × height × duration × 24 / 1024.
const SEGMIND_USD_PER_TOKEN = 7.0 / 1_000_000
const PIXELS: Record<VideoResolution, number> = {
  '480p': 854 * 480,
  '720p': 1280 * 720,
  '1080p': 1920 * 1080,
}

// What the NEXT run will cost, per channel, before anything is spent.
//
// EVERY FIGURE HERE IS AN ESTIMATE, and the page says so out loud. It exists purely
// to stop a repeat of the three runs that died on "Credits insufficient" because
// nothing on screen warned that 720p → 1080p multiplies the bill by 2.5. The panels
// afterwards still report what each provider actually billed — and for Segmind, that
// is "no figure stated", because their API returns none.
export function estimateRunCost(
  model: VideoModelId,
  resolution: VideoResolution,
  durationSeconds: number,
): { kieCredits: number; kieUsd: number; segmindUsd: number } {
  const kieCredits = KIE_CREDITS_PER_SECOND[model][resolution] * durationSeconds
  // Seedance 1.5 Pro is a different model with a different rate; only 2.0 is priced
  // at the surveyed $7.00/M, so the estimate is offered for it alone rather than
  // guessing a number for the other.
  const segmindUsd =
    model === 'seedance-2-0'
      ? (PIXELS[resolution] * durationSeconds * 24) / 1024 * SEGMIND_USD_PER_TOKEN
      : 0
  return { kieCredits, kieUsd: kieCredits * KIE_CREDIT_USD, segmindUsd }
}

// Module-scope, NOT store state: no render depends on the controller itself.
let controller: AbortController | null = null

export type VideoCompareStore = {
  prompt: string
  durationSeconds: number
  resolution: VideoResolution
  model: VideoModelId
  run: VideoRunState
  setPrompt: (prompt: string) => void
  setDurationSeconds: (seconds: number) => void
  setResolution: (resolution: VideoResolution) => void
  setModel: (model: VideoModelId) => void
  // Fire the run. Resolves when the server has settled BOTH channels — which is
  // minutes, not seconds, because a real Seedance render is minutes.
  start: () => Promise<void>
  reset: () => void
  // Cancel in flight without clearing a settled result (page unmount).
  abort: () => void
}

export const useVideoCompareStore = create<VideoCompareStore>((set, get) => ({
  prompt: '',
  // 5s / 720p: the cheapest configuration that still exercises the real product
  // path (the catalog pins Seedance 2.0 to 720p). A cost page whose DEFAULT run
  // costs $2.50 is a page nobody presses twice.
  durationSeconds: 5,
  resolution: '720p',
  model: 'seedance-2-0',
  run: { status: 'empty' },

  setPrompt: (prompt) => set({ prompt }),
  setDurationSeconds: (durationSeconds) => set({ durationSeconds }),
  setResolution: (resolution) => set({ resolution }),
  setModel: (model) => set({ model }),

  start: async () => {
    const prompt = get().prompt.trim()
    if (!prompt || get().run.status === 'loading') return

    controller?.abort()
    controller = new AbortController()
    const { signal } = controller

    set({ run: { status: 'loading' } })

    try {
      const result = await api<CompareVideoResult>('/api/compare/video', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          model: get().model,
          durationSeconds: get().durationSeconds,
          resolution: get().resolution,
        }),
        signal,
      })
      // THE RACE GUARD: a response belonging to an aborted run must not overwrite
      // the run that replaced it.
      if (signal.aborted) return
      set({ run: { status: 'success', ...result } })
    } catch (err) {
      if (signal.aborted) return
      // Abort surfaces as a DOMException, not an ApiClientError — leaving the page
      // is not an error worth rendering.
      if (err instanceof DOMException && err.name === 'AbortError') return
      set({
        run: {
          status: 'error',
          // The CODE, not the message. `ApiClientError.message` is sanitized but it
          // is still server prose — the page renders localized copy from this code
          // through the shared errorCopy layer instead. Null when the request never
          // produced an envelope at all (a dropped connection), which the same layer
          // degrades to its generic copy.
          errorCode: err instanceof ApiClientError ? err.code : null,
        },
      })
    }
  },

  reset: () => {
    controller?.abort()
    controller = null
    set({ prompt: '', run: { status: 'empty' } })
  },

  abort: () => {
    controller?.abort()
    controller = null
    // Deliberately does NOT clear a settled run: coming back to the page should
    // still show the last receipt, which cost real money to obtain.
    if (get().run.status === 'loading') set({ run: { status: 'empty' } })
  },
}))
