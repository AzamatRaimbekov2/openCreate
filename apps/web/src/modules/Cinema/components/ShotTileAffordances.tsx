// apps/web/src/modules/Cinema/components/ShotTileAffordances.tsx
// The Phase-3 drag affordances that ride ON a timeline tile: two TRIM edges
// (left = in-point, right = out-point) and a REORDER grip. They are SIBLINGS of
// `ShotThumb` inside the lane `<li>` (which is `group relative`), not part of it —
// so `ShotThumb` stays untouched and the tile's centre is still the select target.
// Each is hover/focus-revealed (the strip is pure footage at rest), sits above the
// tile (`z-20`), and starts a pointer drag via the callbacks (the `useShotDrag`
// hook owns the session + commit). Pointer-drag affordances: keyboard reorder
// still lives on ShotThumb's chevrons; keyboard trim is a documented Phase-4 gap.
import { useTranslation } from 'react-i18next'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { TrimEdge } from '../model/useShotDrag'

export type ShotTileAffordancesProps = {
  // 1-based position — names each handle so it is not "trim" twelve times over.
  index: number
  onTrim: (edge: TrimEdge, event: ReactPointerEvent) => void
  onReorder: (event: ReactPointerEvent) => void
}

// A trim edge: a thin ew-resize strip on the tile's left/right, revealed on hover,
// tinting portal when grabbed; the inner bar is the visible grip.
const TRIM_EDGE =
  'absolute inset-y-1 z-20 w-2 cursor-ew-resize opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-portal/40 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none'

export function ShotTileAffordances({ index, onTrim, onReorder }: ShotTileAffordancesProps) {
  const { t } = useTranslation()
  return (
    <>
      <button
        type="button"
        aria-label={t('cinema.shot.trimStart', { index })}
        onPointerDown={(event) => onTrim('start', event)}
        className={`${TRIM_EDGE} left-0 rounded-l-lg`}
      >
        <span aria-hidden="true" className="mx-auto block h-1/2 w-0.5 rounded-full bg-white/70" />
      </button>
      <button
        type="button"
        aria-label={t('cinema.shot.trimEnd', { index })}
        onPointerDown={(event) => onTrim('end', event)}
        className={`${TRIM_EDGE} right-0 rounded-r-lg`}
      >
        <span aria-hidden="true" className="mx-auto block h-1/2 w-0.5 rounded-full bg-white/70" />
      </button>
      {/* Reorder grip — grab, top-centre, revealed on hover; a scrim so it reads
          over any footage beneath it. */}
      <button
        type="button"
        aria-label={t('cinema.shot.reorder', { index })}
        onPointerDown={onReorder}
        className="absolute top-0 left-1/2 z-20 h-2 w-8 -translate-x-1/2 cursor-grab rounded-b bg-void/60 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-void/80 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none active:cursor-grabbing"
      >
        <span aria-hidden="true" className="mx-auto block h-0.5 w-4 rounded-full bg-white/60" />
      </button>
    </>
  )
}
