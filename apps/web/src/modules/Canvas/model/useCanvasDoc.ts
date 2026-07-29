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
    let timer: ReturnType<typeof setTimeout> | null = null
    // Re-arm on the TRANSITION into dirty only: edits made while already dirty
    // ride the armed timer, so a burst of drags is still one PATCH.
    const unsubscribe = useCanvasStore.subscribe((state, prev) => {
      if (state.saveState !== 'dirty' || prev.saveState === 'dirty') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void flush()
      }, AUTOSAVE_DEBOUNCE_MS)
    })
    return () => {
      unsubscribe()
      if (timer) {
        clearTimeout(timer)
        // Fire-and-forget: the tab may be closing; a lost response is fine,
        // the next open re-loads whatever the server accepted.
        void flush()
      }
    }
  }, [])
}
