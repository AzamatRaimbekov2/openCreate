// apps/web/src/modules/Cinema/components/Timeline.tsx
// The horizontal shot strip and its editing controls. It owns the ordered list
// of ShotThumbs, the reorder-by-buttons logic (swap two ids → POST the new id
// order; the server owns orderIndex), and the "add shot / add title card /
// storyboard" affordances. Selection is lifted to the editor (single source),
// so the inspector and the strip always agree on which shot is active.
import { useTranslation } from 'react-i18next'
import type { FilmDetail, StyleId } from '@opencreate/contracts'
import { Button } from 'shared/ui'
import { useAddShot, useDeleteShot, useReorderShots } from '../model/shotsApi'
import { ShotThumb } from './ShotThumb'
import { PlusIcon, StoryboardIcon, TextCardIcon } from './icons'

export type TimelineProps = {
  film: FilmDetail
  selectedShotId: string | null
  onSelectShot: (shotId: string | null) => void
  // Opens the storyboard modal (owned by the editor)
  onOpenStoryboard: () => void
}

export function Timeline({ film, selectedShotId, onSelectShot, onOpenStoryboard }: TimelineProps) {
  const { t } = useTranslation()
  const addShot = useAddShot()
  const deleteShot = useDeleteShot()
  const reorder = useReorderShots()

  const filmId = film.film.id
  const shots = film.shots
  const shotIds = shots.map((shot) => shot.id)
  const defaultStyleId: StyleId | null = film.film.defaultStyleId

  // Swap two adjacent ids and POST the whole order — the client never computes
  // orderIndex; it only expresses "this one comes before that one".
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= shotIds.length) return
    const next = [...shotIds]
    const a = next[index]
    const b = next[target]
    if (a === undefined || b === undefined) return
    next[index] = b
    next[target] = a
    reorder.mutate({ filmId, shotIds: next })
  }

  const addEmpty = () => {
    // Seed a blank shot with the film's default style so the composer opens ready
    addShot.mutate(
      { filmId, input: defaultStyleId ? { promptPreset: { styleId: defaultStyleId } } : {} },
      { onSuccess: (shot) => onSelectShot(shot.id) },
    )
  }

  const addTitleCard = () => {
    addShot.mutate(
      {
        filmId,
        input: {
          generationId: null,
          title: { text: t('cinema.shot.titleDefault'), position: 'center' },
        },
      },
      { onSuccess: (shot) => onSelectShot(shot.id) },
    )
  }

  const remove = (shotId: string) => {
    deleteShot.mutate({ filmId, shotId })
    // Drop a stale selection so the inspector does not point at a gone shot
    if (shotId === selectedShotId) onSelectShot(null)
  }

  const isBusy = addShot.isPending || reorder.isPending

  return (
    <section aria-label={t('cinema.timeline.title')} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm text-mist-dim">{t('cinema.timeline.title')}</h2>
        <Button variant="ghost" onClick={onOpenStoryboard}>
          <StoryboardIcon />
          {t('cinema.storyboard.cta')}
        </Button>
      </div>

      {/* The strip: a horizontal scroll rail of thumbs + the add controls. Empty
          films still show the controls (and a hint) so the next step is obvious. */}
      <div className="flex items-start gap-3 overflow-x-auto rounded-lg border border-white/10 bg-abyss p-3">
        {shots.length === 0 ? (
          <p className="px-2 py-6 text-sm text-mist-dim">{t('cinema.timeline.empty')}</p>
        ) : (
          shots.map((shot, index) => (
            <ShotThumb
              key={shot.id}
              shot={shot}
              index={index + 1}
              isSelected={shot.id === selectedShotId}
              onSelect={() => onSelectShot(shot.id)}
              onMoveLeft={() => move(index, -1)}
              onMoveRight={() => move(index, 1)}
              onDelete={() => remove(shot.id)}
              canMoveLeft={index > 0}
              canMoveRight={index < shots.length - 1}
            />
          ))
        )}

        {/* Add cluster, pinned to the end of the rail */}
        <div className="flex shrink-0 flex-col gap-2 self-stretch">
          <button
            type="button"
            onClick={addEmpty}
            disabled={isBusy}
            className="flex min-h-10 w-40 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 text-mist-dim transition-colors duration-200 hover:border-white/30 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:opacity-50"
          >
            <PlusIcon />
            <span className="text-xs">{t('cinema.timeline.addShot')}</span>
          </button>
          <button
            type="button"
            onClick={addTitleCard}
            disabled={isBusy}
            className="flex min-h-10 w-40 items-center justify-center gap-1.5 rounded-lg border border-white/10 text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:opacity-50"
          >
            <TextCardIcon />
            <span className="text-xs">{t('cinema.timeline.addTitle')}</span>
          </button>
        </div>
      </div>
    </section>
  )
}
