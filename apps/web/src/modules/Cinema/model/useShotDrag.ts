// apps/web/src/modules/Cinema/model/useShotDrag.ts
// The Phase-3 on-timeline editing engine: TRIM (drag a tile's edges to change its
// [trimStartMs, durationMs] window) and REORDER (drag a tile to a new slot). It
// owns the pointer session and commits through the EXISTING mutations
// (`useUpdateShot` PATCH, `useReorderShots` POST) — no new endpoints.
//
// WHY A HOOK. Timeline is already a large file, and the drag DECISIONS are pure
// (they live in `timelineGeometry`). This hook is the thin, testable glue between
// the pointer and those decisions: it captures the drag origin, listens on the
// WINDOW (so a drag that leaves the tile still tracks — jsdom lacks
// setPointerCapture, so window listeners are also what makes it testable), snaps,
// previews live, and commits on release. The listeners are removed on pointer-up
// AND on unmount — no leak (the #1 review risk, same as the rAF loop).
//
// The final window/slot is recomputed from the pointer-UP event (not read from
// preview state) so there is no stale-closure race between the live preview and
// the commit.
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { Shot } from '@opencreate/contracts'
import {
  clipBoundariesMs,
  dropIndexForX,
  moveItem,
  pxToMs,
  shotWidthPx,
  snapMs,
  windowFromEdge,
} from './timelineGeometry'
import { useReorderShots, useUpdateShot } from './shotsApi'

// A shot must keep at least this long (ms) — a floor so a trim can never collapse
// a tile to nothing; the schema's positive-int is not a usable minimum.
const MIN_SHOT_DURATION_MS = 500
// The contract's hard cap on a shot's duration (createShotInputSchema).
const MAX_SHOT_DURATION_MS = 60_000
// Snap radius (px): a trimmed edge within this of a clip boundary or the playhead
// jumps to it. Small — snapping should assist, not fight, fine adjustments.
const SNAP_PX = 8

export type TrimEdge = 'start' | 'end'
// The live, uncommitted trim window shown while dragging (Timeline widens the tile
// to match). Null when no trim is in flight.
export type TrimPreview = { shotId: string; trimStartMs: number; durationMs: number }

type TrimSession = { kind: 'trim'; shotId: string; edge: TrimEdge; startClientX: number; orig: TrimPreview }
type ReorderSession = { kind: 'reorder'; shotId: string; index: number }
type Session = TrimSession | ReorderSession

export type UseShotDrag = {
  beginTrim: (shotId: string, edge: TrimEdge, event: ReactPointerEvent) => void
  beginReorder: (shotId: string, event: ReactPointerEvent) => void
  // The tile currently being trimmed, at its live (uncommitted) window.
  trimPreview: TrimPreview | null
  // The slot a reorder would drop into (for the drop indicator). Null when idle.
  dropIndex: number | null
  isDragging: boolean
}

export function useShotDrag(
  filmId: string,
  shots: Shot[],
  zoom: number,
  playheadMs: number,
  laneRef: RefObject<HTMLElement | null>,
): UseShotDrag {
  const updateShot = useUpdateShot()
  const reorder = useReorderShots()
  const updateMutate = updateShot.mutate
  const reorderMutate = reorder.mutate

  const sessionRef = useRef<Session | null>(null)
  const [dragKind, setDragKind] = useState<'trim' | 'reorder' | null>(null)
  const [trimPreview, setTrimPreview] = useState<TrimPreview | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const beginTrim = (shotId: string, edge: TrimEdge, event: ReactPointerEvent) => {
    const shot = shots.find((candidate) => candidate.id === shotId)
    if (shot === undefined) return
    // Stop the pointerdown from selecting the tile or starting a text selection.
    event.preventDefault()
    event.stopPropagation()
    const orig: TrimPreview = { shotId, trimStartMs: shot.trimStartMs, durationMs: shot.durationMs }
    sessionRef.current = { kind: 'trim', shotId, edge, startClientX: event.clientX, orig }
    setTrimPreview(orig)
    setDragKind('trim')
  }

  const beginReorder = (shotId: string, event: ReactPointerEvent) => {
    const index = shots.findIndex((candidate) => candidate.id === shotId)
    if (index < 0) return
    event.preventDefault()
    event.stopPropagation()
    sessionRef.current = { kind: 'reorder', shotId, index }
    setDropIndex(index)
    setDragKind('reorder')
  }

  useEffect(() => {
    if (dragKind === null) return
    // Snapshot the layout for this drag — none of these change mid-drag (no zoom/
    // scroll/play/mutation happens while a pointer is held), so a stale closure is
    // not a risk and the effect subscribes ONCE per drag, not per frame.
    const targets = [...clipBoundariesMs(shots), playheadMs]
    const widths = shots.map((shot) => shotWidthPx(shot.durationMs, zoom))

    // The window the moving edge resolves to at a given pointer x (delta → snap →
    // bounds). Shared by the live preview and the commit so they cannot disagree.
    const windowAt = (session: TrimSession, clientX: number) => {
      const deltaMs = pxToMs(clientX - session.startClientX, zoom)
      const origMovingMs =
        session.edge === 'start'
          ? session.orig.trimStartMs
          : session.orig.trimStartMs + session.orig.durationMs
      const snapped = snapMs(origMovingMs + deltaMs, targets, zoom, SNAP_PX)
      return windowFromEdge(session.orig, session.edge, snapped, {
        minDurationMs: MIN_SHOT_DURATION_MS,
        maxDurationMs: MAX_SHOT_DURATION_MS,
      })
    }
    const dropAt = (clientX: number) => {
      const laneLeft = laneRef.current?.getBoundingClientRect().left ?? 0
      return dropIndexForX(widths, clientX - laneLeft)
    }

    const onMove = (event: PointerEvent) => {
      const session = sessionRef.current
      if (session === null) return
      if (session.kind === 'trim') {
        setTrimPreview({ shotId: session.shotId, ...windowAt(session, event.clientX) })
      } else {
        setDropIndex(dropAt(event.clientX))
      }
    }
    const onUp = (event: PointerEvent) => {
      const session = sessionRef.current
      sessionRef.current = null
      setDragKind(null)
      setTrimPreview(null)
      setDropIndex(null)
      if (session === null) return
      if (session.kind === 'trim') {
        // Recompute from the UP event (not preview state) — no stale race.
        const win = windowAt(session, event.clientX)
        if (win.trimStartMs !== session.orig.trimStartMs || win.durationMs !== session.orig.durationMs) {
          updateMutate({
            filmId,
            shotId: session.shotId,
            input: { trimStartMs: win.trimStartMs, durationMs: win.durationMs },
          })
        }
      } else {
        const target = dropAt(event.clientX)
        if (target !== session.index) {
          reorderMutate({ filmId, shotIds: moveItem(shots.map((shot) => shot.id), session.index, target) })
        }
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragKind, shots, zoom, playheadMs, filmId, laneRef, updateMutate, reorderMutate])

  return { beginTrim, beginReorder, trimPreview, dropIndex, isDragging: dragKind !== null }
}
