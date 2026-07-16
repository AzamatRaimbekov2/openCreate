// apps/web/src/modules/Cinema/components/Timeline.tsx
// The TRACKS panel (v7): a real edit-bay timeline at the bottom of the editor.
// Three horizontal layers share ONE time scale (PX_PER_SEC) inside one
// horizontally-scrolling well, so they can never drift apart:
//   RULER — second ticks with labels every 5s;
//   VIDEO LANE — the ordered shots, each tile as WIDE as its duration (a 10s
//     beat visibly costs twice a 5s one — proportional width is what makes a
//     strip read as a timeline instead of a thumbnail row);
//   AUDIO LANE — the film's sound directly beneath the footage: music beds as
//     bars running from their start to the film's end, voiceovers as chips at
//     the exact offset they will play (shot-attached lines sit under their
//     beat). Hover a track to delete it.
// Authoring stays behind ONE "+" dialog (v6), which now also adds MUSIC and
// VOICEOVER — the «Звук» card died with v7; sound is a track, not a sidebar.
// The strip height is user-controlled (size Select + drag separator, v6).
// Selection is lifted to the editor (single source), so the lane and the
// composer always agree on which shot is active.
import { useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { AudioKind, CatalogAudioModel, FilmDetail, StyleId } from '@opencreate/contracts'
import { Button, Card, Modal, Select } from 'shared/ui'
import { useAddAudioTrack, useDeleteAudio } from '../model/audioApi'
import { useAddShot, useDeleteShot, useReorderShots } from '../model/shotsApi'
import { ShotThumb } from './ShotThumb'
import { MicIcon, MusicIcon, PlusIcon, StoryboardIcon, TextCardIcon, TrashIcon } from './icons'

export type TimelineProps = {
  film: FilmDetail
  // Audio catalog models (route seam) — the "+" dialog's music/voice forms
  audioModels: CatalogAudioModel[]
  // The film template's recommended music bed; pre-fills the music form
  musicPrompt?: string | null
  selectedShotId: string | null
  onSelectShot: (shotId: string | null) => void
  // Opens the storyboard modal (owned by the editor)
  onOpenStoryboard: () => void
}

// One horizontal time scale for every layer. 24px/s puts a 5s clip at 120px —
// readable footage, and a whole 60s film still fits ~1.5 laptop widths.
const PX_PER_SEC = 24

// Tile heights (px) behind the three presets. M is the default.
const SIZE_PRESETS = { s: 48, m: 64, l: 88 } as const
type SizePreset = keyof typeof SIZE_PRESETS
const PRESET_KEYS: SizePreset[] = ['s', 'm', 'l']
const isPreset = (value: string): value is SizePreset => PRESET_KEYS.some((k) => k === value)

// Drag/keyboard bounds for the tile height.
const MIN_H = 40
const MAX_H = 120
const KEY_STEP = 8

// The scroll body publishes the tile height AND the timeline's total width as
// CSS custom properties; the lanes and the ruler read them, so every layer is
// exactly as long as the film. Typed extension → no `as` cast.
type BodyStyle = CSSProperties & { '--tl-h': string; '--tl-w': string }
// Each shot slot carries its own duration-proportional width.
type SlotStyle = CSSProperties & { '--shot-w': string }

// What the "+" dialog is currently showing: the action menu, or one of the
// audio mini-forms (ported from the retired AudioTracks card).
type AddView = 'menu' | 'music' | 'voiceover'

export function Timeline({
  film,
  audioModels,
  musicPrompt = null,
  selectedShotId,
  onSelectShot,
  onOpenStoryboard,
}: TimelineProps) {
  const { t } = useTranslation()
  const addShot = useAddShot()
  const deleteShot = useDeleteShot()
  const reorder = useReorderShots()
  const addTrack = useAddAudioTrack()
  const deleteAudio = useDeleteAudio()

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addView, setAddView] = useState<AddView>('menu')
  const [audioPrompt, setAudioPrompt] = useState('')
  const [voice, setVoice] = useState('')
  const [tileHeight, setTileHeight] = useState<number>(SIZE_PRESETS.m)
  const [dragFrom, setDragFrom] = useState<{ y: number; height: number } | null>(null)

  const filmId = film.film.id
  const shots = film.shots
  const shotIds = shots.map((shot) => shot.id)
  const defaultStyleId: StyleId | null = film.film.defaultStyleId

  const musicModel = audioModels.find((model) => model.audioKind === 'music')
  const ttsModel = audioModels.find((model) => model.audioKind === 'tts')
  const voices = ttsModel?.voices ?? []

  // The film's total length in seconds — the shared width of every layer.
  // Simple sum (crossfade overlaps are a render subtlety, not a lane concern);
  // a minimum keeps the ruler/lanes visible on an empty film.
  const totalSec = Math.max(
    shots.reduce((sum, shot) => sum + shot.durationMs, 0) / 1000,
    8,
  )
  const totalPx = Math.ceil(totalSec * PX_PER_SEC)

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
    if (shotId === selectedShotId) onSelectShot(null)
  }

  const closeAdd = () => {
    setIsAddOpen(false)
    // Reset AFTER closing so a reopened dialog always starts at the menu
    setAddView('menu')
  }

  // Every menu action closes the dialog first — its feedback must not appear
  // behind a stale sheet.
  const choose = (action: () => void) => () => {
    closeAdd()
    action()
  }

  // Switch the dialog to an audio mini-form; the template's suggestion is a
  // DEFAULT, not a decision — it lands in the field, editable before spending.
  const openAudioForm = (kind: AddView & AudioKind) => {
    setAudioPrompt(kind === 'music' ? (musicPrompt ?? '') : '')
    setVoice(voices[0] ?? '')
    setAddView(kind)
  }

  const submitAudio = () => {
    const model = addView === 'voiceover' ? ttsModel : musicModel
    if (addView === 'menu' || !model || audioPrompt.trim().length < 2) return
    addTrack.mutate(
      {
        filmId,
        kind: addView,
        modelId: model.id,
        prompt: audioPrompt.trim(),
        ...(addView === 'voiceover' && voice ? { voice } : {}),
      },
      { onSuccess: closeAdd },
    )
  }

  const handleSeparatorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') setTileHeight((h) => clamp(h + KEY_STEP))
    else if (event.key === 'ArrowUp') setTileHeight((h) => clamp(h - KEY_STEP))
    else return
    event.preventDefault()
  }

  const handleDragStart = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragFrom({ y: event.clientY, height: tileHeight })
  }
  const handleDragMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragFrom === null) return
    setTileHeight(clamp(dragFrom.height + (event.clientY - dragFrom.y)))
  }
  const handleDragEnd = () => setDragFrom(null)

  const isBusy = addShot.isPending || reorder.isPending
  const bodyStyle: BodyStyle = { '--tl-h': `${tileHeight}px`, '--tl-w': `${totalPx}px` }

  // Ruler labels every 5s, a tick every second
  const seconds = Array.from({ length: Math.ceil(totalSec) + 1 }, (_v, i) => i)

  // Position an audio item on the shared time scale
  const leftPxOf = (startMs: number) => Math.round((startMs / 1000) * PX_PER_SEC)
  // A shot-attached voiceover is named by the beat it voices (see AudioTracks
  // history: eight identical «Озвучка» rows were a guessing game)
  const audioLabel = (kind: AudioKind, shotId: string | null) => {
    const beat = shotId ? shotIds.indexOf(shotId) : -1
    return beat >= 0 ? t('cinema.audio.shotLine', { beat: beat + 1 }) : t(`cinema.audio.kind.${kind}`)
  }

  return (
    <section aria-label={t('cinema.timeline.title')} className="flex flex-col gap-2">
      {/* Chrome row: the panel's name, the size dial, the one "+" trigger */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs text-mist-dim">{t('cinema.timeline.title')}</h2>
        <div className="flex flex-wrap items-center gap-2">
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

      {/* The tracks well: ruler + video lane + audio lane share one horizontal
          scroll and one time scale, so they cannot drift apart */}
      <Card surface="well" padding="none">
        <div className="overflow-x-auto">
          <div className="min-w-full p-2" style={bodyStyle}>
            {/* RULER — decorative (the lanes carry the semantics); ticks every
                second, a numeral every 5s anchor the eye to real time */}
            <div aria-hidden="true" className="relative mb-1 h-4 w-[var(--tl-w)]">
              {seconds.map((s) => (
                <span
                  key={s}
                  className={`absolute bottom-0 border-l ${
                    s % 5 === 0 ? 'h-3 border-white/25' : 'h-1.5 border-white/10'
                  }`}
                  style={{ left: `${s * PX_PER_SEC}px` }}
                >
                  {s % 5 === 0 ? (
                    <span className="absolute -top-0.5 left-1 text-[9px] leading-none text-mist-dim">
                      {s}s
                    </span>
                  ) : null}
                </span>
              ))}
            </div>

            {/* VIDEO LANE — each slot as wide as its clip is long */}
            {shots.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-mist-dim">
                {t('cinema.timeline.empty')}
              </p>
            ) : (
              <ul className="flex items-start gap-0.5">
                {shots.map((shot, index) => {
                  const slotStyle: SlotStyle = {
                    '--shot-w': `${Math.max(Math.round((shot.durationMs / 1000) * PX_PER_SEC), 56)}px`,
                  }
                  return (
                    // shrink-0 lives on the flex child (the <li>), not the thumb
                    <li key={shot.id} className="w-[var(--shot-w)] shrink-0" style={slotStyle}>
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
                  )
                })}
              </ul>
            )}

            {/* AUDIO LANE — the film's sound, on the same clock as the footage.
                Music beds run from their start to the film's end (their real
                length lives in the media, which the client does not know);
                voiceovers are chips at the exact offset they play. */}
            <div className="relative mt-1 h-9 w-[var(--tl-w)] rounded-md bg-void/40">
              {film.audio.length === 0 ? (
                <p className="absolute inset-0 flex items-center px-2 text-[10px] text-mist-dim/70">
                  {t('cinema.audio.empty')}
                </p>
              ) : (
                film.audio.map((track) => (
                  <div
                    key={track.id}
                    className={`group absolute inset-y-1 flex items-center gap-1.5 truncate rounded border px-2 text-[10px] ${
                      track.kind === 'music'
                        ? 'right-1 border-glow-amber/40 bg-specimen-amber/25 text-lumen-amber'
                        : 'border-glow-green/40 bg-specimen-green/20 text-glow-green'
                    }`}
                    style={{ left: `${leftPxOf(track.startMs) + 8}px` }}
                  >
                    {track.kind === 'music' ? <MusicIcon className="size-3" /> : <MicIcon className="size-3" />}
                    <span className="truncate">{audioLabel(track.kind, track.shotId)}</span>
                    {/* Delete on hover/focus — same reveal contract as the thumbs */}
                    <button
                      type="button"
                      onClick={() => deleteAudio.mutate({ filmId, audioId: track.id })}
                      aria-label={t('cinema.audio.remove')}
                      className="pointer-events-none grid size-4 shrink-0 place-items-center rounded-full text-current opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 hover:text-glow-red focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
                    >
                      <TrashIcon className="size-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* The height edge: a real keyboard-operable separator (v6) */}
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
          <span
            aria-hidden="true"
            className="h-1 w-10 rounded-full bg-white/10 transition-colors duration-200 group-hover:bg-white/25 group-focus-visible:bg-white/25"
          />
        </div>
      </Card>

      {/* The "+" dialog: every way of putting something on the timeline —
          footage, a title card, a storyboard, and (v7) SOUND. The audio rows
          switch the dialog to a mini-form instead of closing it. */}
      <Modal isOpen={isAddOpen} onClose={closeAdd} title={t('cinema.timeline.add')}>
        {addView === 'menu' ? (
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
            {musicModel ? (
              <Button variant="ghost" className="justify-start" onClick={() => openAudioForm('music')}>
                <MusicIcon />
                {t('cinema.audio.addMusic')}
              </Button>
            ) : null}
            {ttsModel ? (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => openAudioForm('voiceover')}
              >
                <MicIcon />
                {t('cinema.audio.addVoice')}
              </Button>
            ) : null}
          </div>
        ) : (
          // The audio mini-form (ported from the retired AudioTracks card):
          // prompt (music bed / spoken text), a voice for TTS, then Generate —
          // one charged action that creates the clip AND files the track.
          <div className="flex flex-col gap-2">
            <input
              value={audioPrompt}
              onChange={(event) => setAudioPrompt(event.target.value)}
              placeholder={
                addView === 'voiceover'
                  ? t('cinema.audio.voicePlaceholder')
                  : t('cinema.audio.musicPlaceholder')
              }
              aria-label={
                addView === 'voiceover'
                  ? t('cinema.audio.voicePlaceholder')
                  : t('cinema.audio.musicPlaceholder')
              }
              className="rounded-lg border border-white/10 bg-steel px-3 py-1.5 text-xs text-mist placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
            />
            {addView === 'voiceover' && voices.length > 0 ? (
              <Select
                label={t('cinema.audio.voice')}
                options={voices.map((value) => ({ value, label: value }))}
                value={voice}
                onChange={setVoice}
              />
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAddView('menu')}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={submitAudio}
                isLoading={addTrack.isPending}
                disabled={audioPrompt.trim().length < 2 || addTrack.isPending}
              >
                {t('cinema.audio.generate')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
