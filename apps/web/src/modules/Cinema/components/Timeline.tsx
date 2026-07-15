// apps/web/src/modules/Cinema/components/Timeline.tsx
// The film strip: a compact, RESIZABLE band between the title row and the
// workspace. v6 reshaped its chrome around one idea — the band is an index, so
// its default cost is minimal and everything else is summoned on demand:
//   * AUTHORING (add shot · title card · storyboard) collapsed from three
//     always-visible buttons into ONE "+" trigger that opens an actions dialog.
//     Three pills over the strip claimed a whole chrome row for actions used a
//     few times per film; a dialog costs one click and zero standing pixels.
//   * HEIGHT is user-controlled, two ways that drive ONE value: a preset Select
//     (S/M/L) for the deliberate choice and a drag separator on the bottom edge
//     for the direct one. The value lives in a CSS custom property (--tl-h) the
//     thumbs read, so resizing re-renders nothing but this component.
//   * The per-thumb move/delete cluster is a hover/focus overlay now (see
//     ShotThumb) — at rest the band is pure footage.
// Selection is lifted to the editor (single source), so the rail and the
// inspector always agree on which shot is active.
import { useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FilmDetail, StyleId } from '@opencreate/contracts'
import { Button, Card, Modal, Select } from 'shared/ui'
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

// Tile heights (px) behind the three presets. M is the default and matches the
// v5 fixed size, so the rework changes nothing until the user touches the dial.
const SIZE_PRESETS = { s: 48, m: 64, l: 88 } as const
type SizePreset = keyof typeof SIZE_PRESETS
// Explicit key list (not Object.keys) so the preset scan needs no type cast
const PRESET_KEYS: SizePreset[] = ['s', 'm', 'l']
const isPreset = (value: string): value is SizePreset => PRESET_KEYS.some((k) => k === value)

// Drag/keyboard bounds: below 40px a 16:9 tile stops reading as footage; above
// 120px the "index" starts competing with the stage it indexes.
const MIN_H = 40
const MAX_H = 120
const KEY_STEP = 8

// The rail publishes the tile height as a CSS custom property; ShotThumb sizes
// itself with h-[var(--tl-h)]. Typed as a CSSProperties extension so no `as`
// cast is needed anywhere.
type RailStyle = CSSProperties & { '--tl-h': string }

export function Timeline({ film, selectedShotId, onSelectShot, onOpenStoryboard }: TimelineProps) {
  const { t } = useTranslation()
  const addShot = useAddShot()
  const deleteShot = useDeleteShot()
  const reorder = useReorderShots()

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [tileHeight, setTileHeight] = useState<number>(SIZE_PRESETS.m)
  // Pointer-drag bookkeeping: the height at pointerdown plus the pointer's
  // start Y — each move event derives the new height from the DELTA, so the
  // tile tracks the pointer 1:1 instead of accelerating.
  const [dragFrom, setDragFrom] = useState<{ y: number; height: number } | null>(null)

  const filmId = film.film.id
  const shots = film.shots
  const shotIds = shots.map((shot) => shot.id)
  const defaultStyleId: StyleId | null = film.film.defaultStyleId

  // The preset the current height corresponds to; a dragged in-between value
  // matches none and the Select shows its "custom" placeholder instead.
  const activePreset: SizePreset | 'custom' =
    PRESET_KEYS.find((k) => SIZE_PRESETS[k] === tileHeight) ?? 'custom'

  const clamp = (px: number) => Math.min(MAX_H, Math.max(MIN_H, px))

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

  // Every dialog action closes the dialog first — the action's own feedback
  // (selection, the storyboard modal) must not appear behind a stale sheet.
  const choose = (action: () => void) => () => {
    setIsAddOpen(false)
    action()
  }

  const handleSeparatorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The separator sits on the band's BOTTOM edge: down = grow, up = shrink,
    // exactly the direction the edge itself would travel under the pointer.
    if (event.key === 'ArrowDown') setTileHeight((h) => clamp(h + KEY_STEP))
    else if (event.key === 'ArrowUp') setTileHeight((h) => clamp(h - KEY_STEP))
    else return
    event.preventDefault()
  }

  const handleDragStart = (event: PointerEvent<HTMLDivElement>) => {
    // Capture keeps move/up events arriving even when the pointer leaves the
    // 12px handle mid-drag — without it every fast drag "drops" the edge.
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragFrom({ y: event.clientY, height: tileHeight })
  }

  const handleDragMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragFrom === null) return
    setTileHeight(clamp(dragFrom.height + (event.clientY - dragFrom.y)))
  }

  const handleDragEnd = () => setDragFrom(null)

  const isBusy = addShot.isPending || reorder.isPending
  const railStyle: RailStyle = { '--tl-h': `${tileHeight}px` }

  return (
    <section aria-label={t('cinema.timeline.title')} className="flex flex-col gap-2">
      {/* Chrome row: the strip's name, then the two dials — size + the one "+"
          trigger. Nothing here scrolls with the rail. */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs text-mist-dim">{t('cinema.timeline.title')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* w-36 keeps the Select a quiet rail chip; its caption row is the
              same 11px voice as the strip's own heading */}
          <div className="w-36">
            <Select
              label={t('cinema.timeline.size')}
              options={[
                { value: 's', label: t('cinema.timeline.sizeS') },
                { value: 'm', label: t('cinema.timeline.sizeM') },
                { value: 'l', label: t('cinema.timeline.sizeL') },
              ]}
              value={activePreset}
              onChange={(preset) => {
                if (isPreset(preset)) setTileHeight(SIZE_PRESETS[preset])
              }}
              placeholder={t('cinema.timeline.sizeCustom')}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('cinema.timeline.add')}
            onClick={() => setIsAddOpen(true)}
          >
            <PlusIcon />
          </Button>
        </div>
      </header>

      {/* The rail: a recessed well the shots sit inside. Empty films get a hint
          here, not a control — authoring lives in the "+" dialog. */}
      <Card surface="well" padding="none">
        {shots.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-mist-dim">{t('cinema.timeline.empty')}</p>
        ) : (
          <ul className="flex items-start gap-2 overflow-x-auto p-2" style={railStyle}>
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

        {/* The resize edge: a real keyboard-operable separator, not a styled
            div. Value/min/max mirror the tile height so assistive tech hears
            the same number the drag changes. touch-none stops the browser from
            treating a vertical drag as a page scroll on touchpads/screens. */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('cinema.timeline.resize')}
          aria-valuemin={MIN_H}
          aria-valuemax={MAX_H}
          aria-valuenow={tileHeight}
          tabIndex={0}
          onKeyDown={handleSeparatorKeyDown}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          className="group flex h-3 cursor-row-resize touch-none items-center justify-center focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          {/* The visible grip — brightens under the pointer/focus so the edge
              advertises itself without claiming attention at rest */}
          <span
            aria-hidden="true"
            className="h-1 w-10 rounded-full bg-white/10 transition-colors duration-200 group-hover:bg-white/25 group-focus-visible:bg-white/25"
          />
        </div>
      </Card>

      {/* The actions dialog behind the "+" trigger: three rows, one per way of
          putting something on the timeline. Rows are ghost pills at md — the
          dialog is an overlay, not band chrome, so it keeps the full hit area. */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title={t('cinema.timeline.add')}>
        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            className="justify-start"
            onClick={choose(addEmpty)}
            disabled={isBusy}
          >
            <PlusIcon />
            {t('cinema.timeline.addShot')}
          </Button>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={choose(addTitleCard)}
            disabled={isBusy}
          >
            <TextCardIcon />
            {t('cinema.timeline.addTitle')}
          </Button>
          <Button variant="ghost" className="justify-start" onClick={choose(onOpenStoryboard)}>
            <StoryboardIcon />
            {t('cinema.storyboard.cta')}
          </Button>
        </div>
      </Modal>
    </section>
  )
}
