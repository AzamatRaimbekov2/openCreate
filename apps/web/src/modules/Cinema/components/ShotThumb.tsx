// apps/web/src/modules/Cinema/components/ShotThumb.tsx
// One shot on the timeline strip: a fixed-width 16:9 tile that reflects its
// clip's LIVE status (via the shared ['generation', id] cache), plus the move/
// delete cluster beneath it. The tile is the select target; the cluster shifts
// the shot left/right (reorder) or removes it. Four visual states mirror the
// generation lifecycle so a strip is never a row of grey boxes:
//   no clip → placeholder · processing → amber skeleton · ready → media · failed → red.
import { useTranslation } from 'react-i18next'
import type { Shot } from '@opencreate/contracts'
import { Badge, Skeleton } from 'shared/ui'
import { useShotGeneration } from '../model/shotGeneration'
import { ChevronLeftIcon, ChevronRightIcon, TextCardIcon, TrashIcon } from './icons'

export type ShotThumbProps = {
  shot: Shot
  // 1-based position shown as the ordinal chip
  index: number
  isSelected: boolean
  onSelect: () => void
  onMoveLeft: () => void
  onMoveRight: () => void
  onDelete: () => void
  // Ends of the strip cannot move further in that direction
  canMoveLeft: boolean
  canMoveRight: boolean
}

const CTRL =
  'grid size-8 place-items-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-mist-dim'

export function ShotThumb({
  shot,
  index,
  isSelected,
  onSelect,
  onMoveLeft,
  onMoveRight,
  onDelete,
  canMoveLeft,
  canMoveRight,
}: ShotThumbProps) {
  const { t } = useTranslation()
  const query = useShotGeneration(shot.generationId)
  const generation = query.data
  const media = generation?.mediaUrls[0]
  const seconds = Math.round(shot.durationMs / 1000)

  return (
    <div className="flex w-40 shrink-0 flex-col gap-1.5">
      {/* The tile — the select target. Amber ring when selected (kit convention) */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        aria-label={t('cinema.shot.select', { index })}
        className={`relative aspect-video w-full overflow-hidden rounded-lg border bg-abyss transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
          isSelected ? 'border-glow-amber ring-1 ring-glow-amber/60' : 'border-white/10'
        }`}
      >
        {/* Ordinal chip — the shot's place in the sequence (portal, decorative) */}
        <span
          aria-hidden="true"
          className="absolute top-1 left-1.5 z-10 text-[11px] font-medium text-portal"
        >
          {index}
        </span>

        {shot.generationId === null ? (
          // No footage: a title card if it has a title, else an empty placeholder
          <span className="grid size-full place-items-center text-mist-dim/60">
            <TextCardIcon className="size-6" />
          </span>
        ) : generation === undefined || generation.status === 'processing' ? (
          // Rendering upstream — skeleton tile (the poll flips this to media)
          <Skeleton className="size-full rounded-none" />
        ) : generation.status === 'failed' ? (
          <span className="grid size-full place-items-center px-2 text-center text-[11px] text-glow-red">
            {t('cinema.shot.failed')}
          </span>
        ) : media && generation.type === 'video' ? (
          // Video first frame (muted, no controls — the strip is a scrubbable index)
          <video src={media} muted playsInline preload="metadata" className="size-full object-cover" />
        ) : media ? (
          <img src={media} alt="" className="size-full object-cover" />
        ) : null}

        {/* Crossfade-in marker on the leading edge */}
        {shot.transition === 'crossfade' ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1 bg-glow-amber/60"
            title={t('cinema.transition.crossfade')}
          />
        ) : null}

        {/* Duration chip, bottom-right */}
        <span className="absolute right-1 bottom-1 rounded-full bg-void/70 px-1.5 text-[10px] font-medium text-mist">
          {t('cinema.shot.seconds', { count: seconds })}
        </span>
      </button>

      {/* Title badge (if any) — status said in text, not color only */}
      {shot.title ? (
        <div className="truncate">
          <Badge variant="accent">{shot.title.text}</Badge>
        </div>
      ) : null}

      {/* Move / delete cluster */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onMoveLeft}
            disabled={!canMoveLeft}
            aria-label={t('cinema.shot.moveLeft')}
            className={CTRL}
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            onClick={onMoveRight}
            disabled={!canMoveRight}
            aria-label={t('cinema.shot.moveRight')}
            className={CTRL}
          >
            <ChevronRightIcon />
          </button>
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('cinema.shot.delete')}
          className="grid size-8 place-items-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-glow-red focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}
