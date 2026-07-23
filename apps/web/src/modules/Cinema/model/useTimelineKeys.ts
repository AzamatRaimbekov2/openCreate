// apps/web/src/modules/Cinema/model/useTimelineKeys.ts
// Editor-scoped keyboard control for the CinemaStudio timeline (NLE Phase 4).
// One `keydown` listener drives the shared clock and the split mutation:
//   Space        → play/pause
//   ←/→          → step the playhead one frame (±1/30s), clamped to the film
//   Shift+←/→    → jump to the previous / next shot boundary
//   Home/End     → seek to the film start / end
//   S            → split the shot UNDER the playhead (POST /shots/:id/split)
//
// SCOPING is the load-bearing rule: the shortcuts must NOT fire while the user is
// typing (the composer is a text field) or while a control that OWNS these keys is
// focused (the ruler slider handles its own ←/→/Home/End). `isSuppressedTarget`
// gates on `document.activeElement`, so a global listener stays safe. The clock is
// read via `getState()` in the handler (fresh, no stale closure, no re-subscribe
// per playhead tick). The listener is removed on unmount — no leak.
import { useEffect } from 'react'
import type { Shot } from '@opencreate/contracts'
import { useTimelineClock } from './timelineClock'
import {
  clipBoundariesMs,
  nextBoundaryMs,
  prevBoundaryMs,
  splitTargetAt,
  totalDurationMs,
} from './timelineGeometry'
import { useSplitShot } from './shotsApi'

// One frame at 30fps — the fine step for ←/→. Rounded to whole ms (the playhead
// is integer ms) so repeated presses do not accumulate a fractional drift.
const FRAME_STEP_MS = Math.round(1000 / 30)

// Should this key event be IGNORED because the focus owns it? Text entry (the
// composer, any input/textarea/select/contenteditable) and the ruler slider (it
// has its own ←/→/Home/End scrub) — everything else is fair game.
function isSuppressedTarget(element: Element | null): boolean {
  if (element === null) return false
  const tag = element.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((element as HTMLElement).isContentEditable) return true
  return element.getAttribute('role') === 'slider'
}

export function useTimelineKeys(filmId: string, shots: Shot[]): void {
  const splitShot = useSplitShot()
  const splitMutate = splitShot.mutate

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isSuppressedTarget(document.activeElement)) return
      const clock = useTimelineClock.getState()
      const total = totalDurationMs(shots)
      switch (event.key) {
        case ' ':
          clock.toggle()
          break
        case 'ArrowLeft':
          clock.seek(
            event.shiftKey
              ? prevBoundaryMs(clipBoundariesMs(shots), clock.playheadMs)
              : clock.playheadMs - FRAME_STEP_MS,
            total,
          )
          break
        case 'ArrowRight':
          clock.seek(
            event.shiftKey
              ? nextBoundaryMs(clipBoundariesMs(shots), clock.playheadMs)
              : clock.playheadMs + FRAME_STEP_MS,
            total,
          )
          break
        case 'Home':
          clock.seek(0, total)
          break
        case 'End':
          clock.seek(total, total)
          break
        case 's':
        case 'S': {
          const target = splitTargetAt(shots, clock.playheadMs)
          if (target !== null) splitMutate({ filmId, shotId: target.shotId, atMs: target.atMs })
          break
        }
        default:
          return
      }
      // Only after we've decided to handle it — don't swallow other keys.
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filmId, shots, splitMutate])
}
