// apps/web/src/modules/Compare/model/verifyStore.ts
// Zustand store for the hidden /verify page — a SINGLE-channel Seedance 2.0 smoke
// test, deliberately narrower than the two-channel /compare-video cost page.
//
// WHY A SECOND STORE INSTEAD OF A FLAG ON THE FIRST. The two pages answer different
// questions and therefore hold different state. The cost page compares channels and
// must keep both panels symmetric; this one runs ONE channel and cares about the
// mechanics — did the request go out, did it come back, what exactly came back. Its
// defining feature is `rawResponse`, which the cost page must never show (a page
// whose job is trustworthy numbers cannot print provider prose) and this page cannot
// work without: on a channel whose success shape has never been observed, "success
// with no video" and "success with the video under an unread key" look identical
// until you see the envelope.
import { create } from 'zustand'
import type { CompareVideoResult } from '@opencreate/contracts'
import { api, ApiClientError } from 'shared/libs/apiClient'
import type { ApiErrorCode } from '@opencreate/contracts'
import type { VideoChannelId } from './videoTypes'

export type VerifyRunState =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'error'; errorCode: ApiErrorCode | null }
  | { status: 'success'; result: CompareVideoResult }

let controller: AbortController | null = null

export type VerifyStore = {
  prompt: string
  channel: VideoChannelId
  run: VerifyRunState
  // Wall time measured in the BROWSER, start of request to arrival of the response.
  // Deliberately separate from the per-panel `durationMs` the server reports: the gap
  // between them is transport plus our own polling overhead, and on a page whose job
  // is "check the machinery" that gap is a fact worth seeing.
  clientMs: number | null
  setPrompt: (prompt: string) => void
  setChannel: (channel: VideoChannelId) => void
  start: () => Promise<void>
  reset: () => void
  abort: () => void
}

// FIXED at 15s / 1080p / Seedance 2.0. This page exists to answer one question —
// "does a full-size Seedance 2.0 render work end to end" — and every knob it does not
// have is a way to accidentally measure something else. The cost page keeps the
// knobs; this one keeps the guarantee.
export const VERIFY_DURATION_SECONDS = 15
export const VERIFY_RESOLUTION = '1080p'
export const VERIFY_MODEL = 'seedance-2-0'

export const useVerifyStore = create<VerifyStore>((set, get) => ({
  prompt: '',
  channel: 'segmind',
  run: { status: 'empty' },
  clientMs: null,

  setPrompt: (prompt) => set({ prompt }),
  setChannel: (channel) => set({ channel }),

  start: async () => {
    const prompt = get().prompt.trim()
    if (!prompt || get().run.status === 'loading') return

    controller?.abort()
    controller = new AbortController()
    const { signal } = controller
    const startedAt = Date.now()

    set({ run: { status: 'loading' }, clientMs: null })

    try {
      const result = await api<CompareVideoResult>('/api/compare/video', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          model: VERIFY_MODEL,
          durationSeconds: VERIFY_DURATION_SECONDS,
          resolution: VERIFY_RESOLUTION,
          // ONE channel per run: a failure must have exactly one suspect, and a
          // 15s/1080p render costs $5+ per channel — racing three would burn $18 to
          // answer a question about one of them.
          channels: [get().channel],
          // The whole point of this page: ask each channel for its raw terminal
          // envelope. Off everywhere else.
          debug: true,
        }),
        signal,
      })
      // THE RACE GUARD: a response from an aborted run must not overwrite the run
      // that replaced it.
      if (signal.aborted) return
      set({ run: { status: 'success', result }, clientMs: Date.now() - startedAt })
    } catch (err) {
      if (signal.aborted) return
      if (err instanceof DOMException && err.name === 'AbortError') return
      set({
        run: {
          status: 'error',
          // The CODE, never the message: the page renders localized copy through the
          // shared errorCopy layer like every other failure in the app.
          errorCode: err instanceof ApiClientError ? err.code : null,
        },
        clientMs: Date.now() - startedAt,
      })
    }
  },

  reset: () => {
    controller?.abort()
    controller = null
    set({ prompt: '', run: { status: 'empty' }, clientMs: null })
  },

  abort: () => {
    controller?.abort()
    controller = null
    // A settled run SURVIVES unmount: it cost real money, and coming back to the page
    // should still show what it bought.
    if (get().run.status === 'loading') set({ run: { status: 'empty' } })
  },
}))
