// apps/web/src/modules/Cinema/components/ShotThumb.tsx
// One shot on the timeline strip: a 16:9 tile that reflects its clip's LIVE
// status (via the shared ['generation', id] cache). The tile is the select
// target. v6 — the strip is resizable and the tile follows the rail's
// `--tl-h` custom property (height in px, width from aspect-video), so the
// thumb has NO fixed width of its own any more.
//
// The move/delete cluster is a HOVER/FOCUS OVERLAY on the tile (a scrim bar on
// the bottom edge), not a standing row beneath it: at rest the strip is pure
// footage. The buttons stay in the DOM (screen readers and Tab reach them
// always) and are revealed by group-hover/group-focus-within; pointer-events
// are gated with the opacity, so an invisible Delete can never eat a click
// aimed at the tile. They are SIBLINGS of the tile button, absolutely
// positioned over it — nesting them inside would be invalid HTML.
//
// Four visual states mirror the generation lifecycle so a strip is never a row
// of grey boxes: no clip → placeholder · processing → amber skeleton · ready →
// media · failed → red.
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

// Overlay control: compact (size-6 — it rides on the tile, not in a toolbar),
// bright text on the scrim, disabled = dimmed with no hover step.
// pointer-events are gated PER BUTTON, not on the bar: the bar's empty
// background must pass clicks through to the tile beneath it (a click on the
// tile's bottom third is a SELECT, not a miss), while a visible button still
// takes its own click. Base none + group-hover/focus-within auto = clickable
// exactly while visible.
const CTRL_EVENTS =
  'pointer-events-none group-focus-within:pointer-events-auto group-hover:pointer-events-auto'
const CTRL = `${CTRL_EVENTS} grid size-6 place-items-center rounded-full text-mist transition-colors duration-200 hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-mist`

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
    // `group` scopes the hover/focus reveal; `relative` anchors the overlay.
    // Height comes from the rail's --tl-h (fallback = the M preset), width
    // follows via aspect-video — the strip resizes by repainting one variable.
    <div className="group relative h-[var(--tl-h,64px)] shrink-0">
      {/* The tile — the select target. Amber ring when selected (kit convention) */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        aria-label={t('cinema.shot.select', { index })}
        className={`relative aspect-video h-full overflow-hidden rounded-lg border bg-abyss transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
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
            <TextCardIcon className="size-5" />
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

        {/* Duration chip, top-right (the bottom edge belongs to the hover
            controls now — stacking both there made each unreadable) */}
        <span className="absolute top-1 right-1 rounded-full bg-void/70 px-1.5 text-[10px] font-medium text-mist">
          {t('cinema.shot.seconds', { count: seconds })}
        </span>

        {/* Title badge (if any) rides INSIDE the tile since v6 — a row under a
            variable-height tile made the strip ragged. Status said in text. */}
        {shot.title ? (
          <span className="pointer-events-none absolute bottom-1 left-1.5 z-10 max-w-[85%] truncate">
            <Badge variant="accent">{shot.title.text}</Badge>
          </span>
        ) : null}
      </button>

      {/* Move/delete overlay: a scrim bar on the tile's bottom edge, revealed
          on hover or when any of its buttons holds focus. The BAR itself never
          takes pointer events — its empty background is still the tile, and a
          click there must select the shot; only the buttons (visible ones, via
          CTRL_EVENTS) catch their own clicks. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-between rounded-b-lg bg-void/80 px-1 py-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <div className="flex items-center">
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
          className={`${CTRL_EVENTS} grid size-6 place-items-center rounded-full text-mist transition-colors duration-200 hover:bg-white/15 hover:text-glow-red focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none`}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}
