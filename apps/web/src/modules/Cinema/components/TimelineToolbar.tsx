// apps/web/src/modules/Cinema/components/TimelineToolbar.tsx
// The timeline's compact tool cluster (extracted from Timeline.tsx in Phase 4 to
// keep that file from growing). Right-aligned hairline tool buttons — the ONLY
// chrome the "no chrome row" panel wears, because a 10-minute NLE needs them:
//   SPLIT (Phase 4) — cut the selected shot at the playhead; disabled unless the
//     playhead sits strictly inside it (so it never fires a no-op on a boundary).
//   ZOOM out / fit / in (Phase 2) — the shared px/sec scale + fit-to-window.
// Purely presentational: every action + the `canSplit` gate is decided by Timeline
// (which owns the clock, the selection and the mutations) and passed in.
import { useTranslation } from 'react-i18next'
import { ExpandIcon, ScissorsIcon, ZoomInIcon, ZoomOutIcon } from './icons'

export type TimelineToolbarProps = {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onSplit: () => void
  // The playhead is strictly inside the selected shot — otherwise splitting is a
  // no-op and the control is disabled.
  canSplit: boolean
}

// Shared hairline tool-button shape (the ShotThumb-overlay precedent): compact,
// `hover:bg-ridge`, portal focus ring.
const TOOL_BUTTON =
  'grid size-7 place-items-center rounded-full border border-white/10 text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-mist-dim'

export function TimelineToolbar({ onZoomIn, onZoomOut, onFit, onSplit, canSplit }: TimelineToolbarProps) {
  const { t } = useTranslation()
  return (
    <div role="group" aria-label={t('cinema.timeline.zoom')} className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onSplit}
        disabled={!canSplit}
        aria-label={t('cinema.timeline.split')}
        className={TOOL_BUTTON}
      >
        <ScissorsIcon />
      </button>
      <button type="button" onClick={onZoomOut} aria-label={t('cinema.timeline.zoomOut')} className={TOOL_BUTTON}>
        <ZoomOutIcon />
      </button>
      <button type="button" onClick={onFit} aria-label={t('cinema.timeline.fit')} className={TOOL_BUTTON}>
        <ExpandIcon />
      </button>
      <button type="button" onClick={onZoomIn} aria-label={t('cinema.timeline.zoomIn')} className={TOOL_BUTTON}>
        <ZoomInIcon />
      </button>
    </div>
  )
}
