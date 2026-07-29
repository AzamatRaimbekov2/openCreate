// apps/web/src/modules/Canvas/model/useCanvasDoc.ts
// The autosave loop (spec §3: "saved" / amber "not saved · retry").
// First debounced autosave in the codebase — every prior save is an explicit
// button (ShotInspector) — because a node editor mutates on every drag and a
// button per drag is absurd. The loop watches the store's dirty flag via
// subscribe (no re-render per keystroke), waits for quiet, PATCHes the FULL
// document (last-write-wins, single owner), and flushes on unmount so closing
// the tab mid-edit loses at most the debounce window.
import { useEffect } from 'react'
import { useCanvasStore } from './canvasStore'
import { saveCanvas } from './api'

export const AUTOSAVE_DEBOUNCE_MS = 1500
// I4: spec §7 promises "retry with backoff" on a failed save — the amber
// "not saved · retry" pill was the ONLY recovery path before this, so a
// canvas that fails to save with no further edits sat silently unsaved until
// the user noticed and clicked it. 5s, doubling on each further failure,
// capped at 30s; reset to the base delay by a real success OR by a fresh
// edit (which pre-empts the backoff with the normal short debounce anyway).
export const RETRY_BASE_MS = 5000
export const RETRY_MAX_MS = 30000

// Snapshot the current doc as the PATCH body.
function currentDoc() {
  const s = useCanvasStore.getState()
  return {
    title: s.title,
    viewport: s.viewport,
    nodes: s.nodes,
    edges: s.edges,
  }
}

async function flush() {
  const s = useCanvasStore.getState()
  if (!s.canvasId || (s.saveState !== 'dirty' && s.saveState !== 'error')) return
  useCanvasStore.getState().markSaving()
  try {
    await saveCanvas(s.canvasId, currentDoc())
    useCanvasStore.getState().markSaved()
  } catch {
    // Local state stays; the header shows amber "not saved" with a retry that
    // calls retrySave() below. No toast storm — autosave fails quietly.
    useCanvasStore.getState().markSaveError()
  }
}

// Manual retry for the header's "not saved · retry" affordance.
export function retrySave() {
  void flush()
}

export function useCanvasAutosave() {
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    // Retry-backoff state for the CURRENT failure streak. attempt resets to 0
    // whenever the streak ends (a real success, or a fresh edit pre-empting it
    // with the short debounce below) — never carries across two unrelated
    // failures.
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryAttempt = 0
    const clearRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      retryAttempt = 0
    }
    // Arms (or leaves armed) the backoff timer for the failure streak.
    // Idempotent while a timer is already pending — repeated 'error'
    // notifications for the SAME failure (e.g. two markSaveError calls with
    // no state change in between) must not restart the delay.
    const armRetry = () => {
      if (retryTimer) return
      const delay = Math.min(RETRY_BASE_MS * 2 ** retryAttempt, RETRY_MAX_MS)
      retryTimer = setTimeout(() => {
        retryTimer = null
        retryAttempt += 1
        void flush()
      }, delay)
    }

    const unsubscribe = useCanvasStore.subscribe((state, prev) => {
      // Debounced autosave — re-arm on the TRANSITION into dirty only: edits
      // made while already dirty ride the armed timer, so a burst of drags is
      // still one PATCH. This also covers an edit made DURING the error
      // backoff window: it flips saveState to 'dirty' too, so it rides the
      // short debounce instead of waiting out the longer backoff.
      if (state.saveState === 'dirty' && prev.saveState !== 'dirty') {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          debounceTimer = null
          void flush()
        }, AUTOSAVE_DEBOUNCE_MS)
      }
      // Retry backoff — armed on ENTERING 'error', cleared by anything that
      // ends the streak. Left untouched while 'saving' (mid-attempt, whether
      // that attempt came from the debounce or from this very backoff) so a
      // renewed failure keeps doubling instead of resetting to the base delay.
      if (state.saveState === 'error') {
        armRetry()
      } else if (state.saveState === 'saved' || (state.saveState === 'dirty' && prev.saveState === 'error')) {
        clearRetry()
      }
    })
    return () => {
      unsubscribe()
      if (debounceTimer) clearTimeout(debounceTimer)
      if (retryTimer) clearTimeout(retryTimer)
      // Fire-and-forget: the tab may be closing; a lost response is fine,
      // the next open re-loads whatever the server accepted.
      void flush()
    }
  }, [])
}
