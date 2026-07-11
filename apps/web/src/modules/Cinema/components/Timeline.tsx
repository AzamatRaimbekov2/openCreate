// apps/web/src/modules/Cinema/components/Timeline.tsx
// The film strip: a full-width band under the workspace, the way a real editor
// stacks it. Two parts, and the split is the point —
//   HEADER: the shot-authoring controls (add shot · title card · storyboard).
//   RAIL:   a recessed `Card surface="well"` holding ONLY the ordered ShotThumbs.
// Before v4 the add cluster was pinned to the tail of the rail itself, so a film
// with eight shots scrolled its primary "add shot" affordance off the right edge.
// Controls that create content never live inside the thing that scrolls.
// Selection is lifted to the editor (single source), so the rail and the
// inspector always agree on which shot is active.
import { useTranslation } from 'react-i18next'
import type { FilmDetail, StyleId } from '@opencreate/contracts'
import { Button, Card } from 'shared/ui'
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
      {/* Authoring controls — always on screen, never in the scroll rail */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm text-mist-dim">{t('cinema.timeline.title')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={addEmpty} disabled={isBusy}>
            <PlusIcon />
            {t('cinema.timeline.addShot')}
          </Button>
          <Button variant="ghost" onClick={addTitleCard} disabled={isBusy}>
            <TextCardIcon />
            {t('cinema.timeline.addTitle')}
          </Button>
          <Button variant="ghost" onClick={onOpenStoryboard}>
            <StoryboardIcon />
            {t('cinema.storyboard.cta')}
          </Button>
        </div>
      </header>

      {/* The rail: a recessed well the shots sit inside. Empty films get a hint
          here, not a control — the controls are already above. */}
      <Card surface="well">
        {shots.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-mist-dim">{t('cinema.timeline.empty')}</p>
        ) : (
          <ul className="flex items-start gap-3 overflow-x-auto">
            {shots.map((shot, index) => (
              // shrink-0 lives on the flex child (the <li>), not on the thumb
              <li key={shot.id} className="shrink-0">
                <ShotThumb
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
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}
