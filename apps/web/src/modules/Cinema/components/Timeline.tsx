// apps/web/src/modules/Cinema/components/Timeline.tsx
// The TRACKS panel (v7 + v8 NLE): a real edit-bay timeline at the bottom of the
// editor. Three horizontal layers share ONE time scale — `zoom` px/sec from the
// timeline clock (Phase 2) — inside one horizontally-scrolling well, so they can
// never drift apart:
//   RULER — a scrub slider with m:ss timecode ticks at a zoom-chosen interval;
//   VIDEO LANE — the ordered shots, each tile as WIDE as its duration (a 10s
//     beat visibly costs twice a 5s one — proportional width is what makes a
//     strip read as a timeline instead of a thumbnail row);
//   AUDIO LANE — the film's sound directly beneath the footage: music beds as
//     bars running from their start to the film's end, voiceovers as chips at
//     the exact offset they will play (shot-attached lines sit under their
//     beat). Hover a track to delete it.
// Authoring stays behind ONE "+" dialog (v6), which now also adds MUSIC and
// VOICEOVER — the «Звук» card died with v7; sound is a track, not a sidebar.
// The "+" TRIGGER lives INSIDE the rail as a dashed icon+label tile after the
// last shot (owner directive 2026-07-17): the affordance sits where the result
// will appear, and the panel wears no chrome row at all — no «Таймлайн» title
// (the tracks say what they are), no size Select (the drag/keyboard separator
// is the one resize control).
// Selection is lifted to the editor (single source), so the lane and the
// composer always agree on which shot is active.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { AudioKind, CatalogAudioModel, FilmDetail, Shot, StyleId } from '@opencreate/contracts'
import { Button, Card, Modal, Select } from 'shared/ui'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { useAddAudioTrack, useAudioGenerations, useDeleteAudio } from '../model/audioApi'
import { useAddShot, useDeleteShot, useReorderShots, useSplitShot } from '../model/shotsApi'
import { useTimelineClock } from '../model/timelineClock'
import {
  followScroll,
  formatTimecode,
  msToPx,
  pxToMs,
  rulerTicks,
  shotWidthPx,
  splitTargetAt,
  totalDurationMs,
} from '../model/timelineGeometry'
import { useShotDrag } from '../model/useShotDrag'
import { shotStartMs } from '../model/voiceoverApi'
import { ShotThumb } from './ShotThumb'
import { ShotTileAffordances } from './ShotTileAffordances'
import { TimelineToolbar } from './TimelineToolbar'
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

// The default tile height (px) — the retired size Select's «M» preset; the
// drag/keyboard separator below the well is the one resize control now.
const DEFAULT_TILE_H = 64

// Drag/keyboard bounds for the tile height.
const MIN_H = 40
const MAX_H = 120
const KEY_STEP = 8

// Keyboard scrub step on the ruler slider (Phase 1): 1s per arrow press.
const SEEK_STEP_MS = 1000

// The scroll body's p-2 padding in px (0.5rem) — the playhead cursor and the
// auto-follow cursor x both offset by it so they line up with the ruler's tick 0.
const CONTENT_PAD_PX = 8

// The video lane's inter-tile gap in px (Tailwind gap-0.5). The reorder DECISION
// ignores it (2px is below a slot), but the drop indicator adds it back so the
// line sits on the real rendered slot boundary.
const LANE_GAP_PX = 2

// The scroll body publishes the tile height AND the timeline's total width as
// CSS custom properties; the lanes and the ruler read them, so every layer is
// exactly as long as the film. Typed extension → no `as` cast.
type BodyStyle = CSSProperties & { '--tl-h': string; '--tl-w': string }
// Each shot slot carries its own duration-proportional width.
type SlotStyle = CSSProperties & { '--shot-w': string }

// What the "+" dialog is currently showing: the action menu, or one of the
// audio mini-forms (ported from the retired AudioTracks card).
type AddView = 'menu' | 'music' | 'voiceover'

type AddTileProps = {
  // Visible + accessible name of the trigger («Добавить») — icon alone reads
  // as decoration, icon+word reads as a control
  label: string
  onClick: () => void
}

// The one "+" trigger, shaped like the thing it creates: a shot-sized dashed
// ghost tile riding the video lane (height = the same --tl-h the thumbs use).
// It opens the SAME "+" dialog as before — authoring itself stays behind the
// dialog; only the trigger moved into the rail.
function AddTile({ label, onClick }: AddTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[var(--tl-h,64px)] w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 text-mist-dim transition-colors duration-150 hover:border-portal hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
    >
      <PlusIcon />
      <span className="text-[10px] leading-none">{label}</span>
    </button>
  )
}

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

  // Live status of every track on the lane. Since 2026-07-20 a track may be
  // attached while its clip is STILL RENDERING (the server no longer forbids it —
  // audio is async, and forbidding it made attachment impossible). Showing that
  // state is what replaces the removed guard: a pending track must read as
  // pending, and a failed one must say so, because a failed track BLOCKS the
  // export (buildPlan refuses it) and the user would otherwise have no idea why.
  const audioGenerations = useAudioGenerations(film.audio.map((track) => track.generationId))

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addView, setAddView] = useState<AddView>('menu')
  const [audioPrompt, setAudioPrompt] = useState('')
  const [voice, setVoice] = useState('')
  const [tileHeight, setTileHeight] = useState<number>(DEFAULT_TILE_H)
  const [dragFrom, setDragFrom] = useState<{ y: number; height: number } | null>(null)

  // The timeline CLOCK — the ONE playback position (NLE Phase 1). The ruler
  // scrubs it, a tile click jumps it to that shot's start, and the playhead
  // cursor renders at it. Shared (singleton) with PreviewPlayer, which is how
  // selection and the playhead stay unified without prop-drilling. Phase 2 adds
  // `zoom` (px/sec) — the shared scale — plus the zoom/fit actions.
  const playheadMs = useTimelineClock((state) => state.playheadMs)
  const isPlaying = useTimelineClock((state) => state.isPlaying)
  const seek = useTimelineClock((state) => state.seek)
  const zoom = useTimelineClock((state) => state.zoom)
  const zoomIn = useTimelineClock((state) => state.zoomIn)
  const zoomOut = useTimelineClock((state) => state.zoomOut)
  const fitToWindow = useTimelineClock((state) => state.fitToWindow)
  // The horizontal scroll viewport — measured for fit-to-window and auto-follow.
  const scrollRef = useRef<HTMLDivElement>(null)
  // The video lane <ul> — its left edge is the origin the reorder hit-test maps
  // a pointer x against.
  const laneRef = useRef<HTMLUListElement>(null)

  const filmId = film.film.id
  const shots = film.shots
  const shotIds = shots.map((shot) => shot.id)
  const defaultStyleId: StyleId | null = film.film.defaultStyleId
  // The film's REAL length bounds every seek. The ruler is padded to a minimum
  // width (totalSec below), so a click in the empty tail clamps back onto the
  // last frame rather than seeking past the film.
  const filmMs = totalDurationMs(shots)

  // Phase 3 on-timeline editing: the trim/reorder drag engine. It commits through
  // the same shot PATCH / reorder POST the chevrons use — dragging is a second way
  // to reach existing endpoints, not a new capability path.
  const drag = useShotDrag(filmId, shots, zoom, playheadMs, laneRef)

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
  const totalPx = Math.ceil(totalSec * zoom)

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

  // Map a pointer x on the ruler to a time and seek there (click or drag). The
  // rect is viewport-relative, so horizontal scroll is already accounted for —
  // `clientX - rect.left` is the px within the (scrolled) ruler content. No
  // pointer capture (jsdom lacks it): a drag leaving the ruler simply stops.
  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    seek(pxToMs(event.clientX - rect.left, zoom), filmMs)
  }
  const handleScrubMove = (event: PointerEvent<HTMLDivElement>) => {
    // Only while the primary button is held — a bare hover must not scrub.
    if (event.buttons === 0) return
    seekFromPointer(event)
  }
  const handleScrubKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') seek(playheadMs - SEEK_STEP_MS, filmMs)
    else if (event.key === 'ArrowRight') seek(playheadMs + SEEK_STEP_MS, filmMs)
    else if (event.key === 'Home') seek(0, filmMs)
    else if (event.key === 'End') seek(filmMs, filmMs)
    else return
    event.preventDefault()
  }
  // A tile click UNIFIES selection with the playhead (ADR): open the composer on
  // the shot AND jump the preview to its start.
  const selectAndSeek = (shotId: string) => {
    onSelectShot(shotId)
    seek(shotStartMs(shots, shotId), filmMs)
  }
  // Fit-to-window: measure the strip HERE (the store stays DOM-free) and let it
  // compute the px/sec that makes the whole film fit. An unmeasured strip
  // (clientWidth 0, e.g. before layout) falls back to the default scale.
  const handleFit = () => fitToWindow(filmMs, scrollRef.current?.clientWidth ?? 0)

  // Phase 4 SPLIT: the shot under the playhead (strictly inside), which the
  // scissors button cuts ONLY when it is the SELECTED shot (the S-key path in
  // useTimelineKeys splits whatever is under the playhead regardless of selection).
  const splitShot = useSplitShot()
  const splitTarget = splitTargetAt(shots, playheadMs)
  const canSplit = splitTarget !== null && splitTarget.shotId === selectedShotId
  const handleSplit = () => {
    if (splitTarget !== null && canSplit) {
      splitShot.mutate({ filmId, shotId: splitTarget.shotId, atMs: splitTarget.atMs })
    }
  }

  const isBusy = addShot.isPending || reorder.isPending
  // A non-ApiClientError (a thrown TypeError, an offline fetch) still deserves a
  // sentence — 'internal_error' is the honest catch-all rather than silence.
  const addTrackErrorCode =
    addTrack.error instanceof ApiClientError
      ? addTrack.error.code
      : addTrack.error
        ? 'internal_error'
        : null
  const bodyStyle: BodyStyle = { '--tl-h': `${tileHeight}px`, '--tl-w': `${totalPx}px` }
  // The playhead's x on the shared `zoom` scale — the cursor and the ruler ticks
  // read the same mapping, so they cannot drift.
  const playheadPx = msToPx(playheadMs, zoom)

  // Ruler ticks: m:ss labels at a zoom-chosen interval (denser zoomed in). The
  // ruler spans the padded width (totalSec), so a short film still shows a scale.
  const ticks = rulerTicks(totalSec * 1000, zoom)

  // The reorder DROP indicator's x, measured from the video lane's left edge (the
  // same origin the reorder hit-test uses): the summed widths (+ gaps) of the tiles
  // before the target slot. Null unless a reorder drag is live. A tile whose window
  // is being trimmed shows its LIVE previewed duration.
  const widthOf = (shot: Shot) => {
    const preview = drag.trimPreview
    const durationMs = preview !== null && preview.shotId === shot.id ? preview.durationMs : shot.durationMs
    return shotWidthPx(durationMs, zoom)
  }
  const dropLeftPx =
    drag.dropIndex === null
      ? null
      : drag.dropIndex * LANE_GAP_PX +
        shots.slice(0, drag.dropIndex).reduce((sum, shot) => sum + widthOf(shot), 0)

  // AUTO-FOLLOW: during playback keep the playhead in view (a manual scroll while
  // paused is respected — the effect no-ops unless playing). `followScroll` is a
  // pure decision; an unmeasured strip (clientWidth 0) returns null → no jitter.
  useEffect(() => {
    if (!isPlaying) return
    const el = scrollRef.current
    if (el === null) return
    const next = followScroll(playheadPx + CONTENT_PAD_PX, el.scrollLeft, el.clientWidth)
    if (next !== null) el.scrollLeft = next
  }, [isPlaying, playheadPx])

  // Position an audio item on the shared time scale
  const leftPxOf = (startMs: number) => Math.round((startMs / 1000) * zoom)
  // A shot-attached voiceover is named by the beat it voices (see AudioTracks
  // history: eight identical «Озвучка» rows were a guessing game)
  const audioLabel = (kind: AudioKind, shotId: string | null) => {
    const beat = shotId ? shotIds.indexOf(shotId) : -1
    return beat >= 0 ? t('cinema.audio.shotLine', { beat: beat + 1 }) : t(`cinema.audio.kind.${kind}`)
  }

  return (
    // NO chrome row (owner directive 2026-07-17): the panel needs no «Таймлайн»
    // title (tracks read as tracks), no size Select (the separator below is the
    // one resize control), and the "+" moved INSIDE the rail. The aria-label
    // keeps the section's accessible name.
    <section aria-label={t('cinema.timeline.title')} className="flex flex-col gap-2">
      {/* The tool cluster (Phase 4): split + zoom, extracted so Timeline stays
          leaner. The ONLY chrome the panel wears (the "+"/size row was retired). */}
      <TimelineToolbar
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={handleFit}
        onSplit={handleSplit}
        canSplit={canSplit}
      />

      {/* The tracks well: ruler + video lane + audio lane share one horizontal
          scroll and one time scale, so they cannot drift apart */}
      <Card surface="well" padding="none">
        <div ref={scrollRef} className="overflow-x-auto">
          {/* `relative` anchors the playhead cursor to the same coordinate space
              the ruler/lanes use; p-2 = 0.5rem, which the cursor's `left` offsets
              by so it lines up with tick 0. */}
          <div className="relative min-w-full p-2" style={bodyStyle}>
            {/* PLAYHEAD cursor — a thin portal line at the clock's position (design
                token, NOT a gradient). aria-hidden + pointer-events-none: it is a
                readout, and the ruler beneath owns the scrub. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-2 bottom-2 z-10 w-px bg-portal"
              style={{ left: `calc(0.5rem + ${playheadPx}px)` }}
            />

            {/* RULER — a SCRUB SLIDER: click/drag seeks the clock, arrows nudge it.
                The ticks are m:ss timecodes at a zoom-chosen interval (denser when
                zoomed in), decorative — aria-valuenow/max expose the position as
                TIME in ms, so tests assert time, not pixels. */}
            <div
              role="slider"
              aria-label={t('cinema.timeline.scrub')}
              aria-valuemin={0}
              aria-valuemax={filmMs}
              aria-valuenow={Math.round(playheadMs)}
              tabIndex={0}
              onPointerDown={seekFromPointer}
              onPointerMove={handleScrubMove}
              onKeyDown={handleScrubKeyDown}
              className="relative mb-1 h-4 w-[var(--tl-w)] cursor-pointer touch-none focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              {ticks.map((tickMs) => (
                <span
                  key={tickMs}
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 h-3 border-l border-white/25"
                  style={{ left: `${msToPx(tickMs, zoom)}px` }}
                >
                  <span className="absolute -top-0.5 left-1 text-[9px] leading-none text-mist-dim">
                    {formatTimecode(tickMs)}
                  </span>
                </span>
              ))}
            </div>

            {/* VIDEO LANE — each slot as wide as its clip is long. The "+"
                dialog's TRIGGER rides the lane itself (owner directive
                2026-07-17): a dashed icon+label tile right where the next shot
                will land — the affordance beats a bare "+" lost in chrome. It
                is a SIBLING of the <ul>, not a listitem: the list stays "the
                shots", screen readers and tests count footage only. */}
            {shots.length === 0 ? (
              <div className="flex items-center gap-3">
                <AddTile label={t('cinema.timeline.add')} onClick={() => setIsAddOpen(true)} />
                <p className="text-xs text-mist-dim">{t('cinema.timeline.empty')}</p>
              </div>
            ) : (
              <div className="relative flex items-start gap-0.5">
                <ul ref={laneRef} className="flex items-start gap-0.5">
                  {shots.map((shot, index) => {
                    // The slot is as wide as the shot is long — or its LIVE trimmed
                    // width while its edge is being dragged (drag.trimPreview).
                    const slotStyle: SlotStyle = { '--shot-w': `${widthOf(shot)}px` }
                    return (
                      // `group relative` scopes the affordances' hover-reveal and
                      // anchors them; shrink-0 lives on the flex child, not the thumb
                      <li
                        key={shot.id}
                        className="group relative w-[var(--shot-w)] shrink-0"
                        style={slotStyle}
                      >
                        <ShotThumb
                          shot={shot}
                          index={index + 1}
                          isSelected={shot.id === selectedShotId}
                          onSelect={() => selectAndSeek(shot.id)}
                          onMoveLeft={() => move(index, -1)}
                          onMoveRight={() => move(index, 1)}
                          onDelete={() => remove(shot.id)}
                          canMoveLeft={index > 0}
                          canMoveRight={index < shots.length - 1}
                        />
                        {/* Phase 3: trim edges + reorder grip ride the tile */}
                        <ShotTileAffordances
                          index={index + 1}
                          onTrim={(edge, event) => drag.beginTrim(shot.id, edge, event)}
                          onReorder={(event) => drag.beginReorder(shot.id, event)}
                        />
                      </li>
                    )
                  })}
                </ul>
                <AddTile label={t('cinema.timeline.add')} onClick={() => setIsAddOpen(true)} />
                {/* DROP INDICATOR — a green insert line at the target slot while a
                    reorder drag is live (green = "drop here", distinct from the
                    portal playhead). aria-hidden: it mirrors the pointer. */}
                {dropLeftPx !== null ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-glow-green"
                    style={{ left: `${dropLeftPx}px` }}
                  />
                ) : null}
              </div>
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
                film.audio.map((track) => {
                  // undefined = the poll has not answered yet. That is the LOADING
                  // state and shows no word at all — guessing "rendering" before we
                  // know would be a claim, not a status.
                  const status = audioGenerations[track.generationId]?.status
                  const isPending = status === 'processing'
                  const isFailed = status === 'failed'
                  // Failure OVERRIDES the kind colour: a broken track is not a
                  // music track that happens to be red, it is a blocker.
                  const tone = isFailed
                    ? 'border-glow-red/40 bg-specimen-red/20 text-lumen-red'
                    : track.kind === 'music'
                      ? 'border-glow-amber/40 bg-specimen-amber/25 text-lumen-amber'
                      : 'border-glow-green/40 bg-specimen-green/20 text-glow-green'
                  return (
                    <div
                      key={track.id}
                      // Pending reads as provisional: a dashed edge and reduced
                      // opacity, so the lane never looks finished before it is.
                      className={`group absolute inset-y-1 flex items-center gap-1.5 truncate rounded border px-2 text-[10px] ${tone} ${
                        track.kind === 'music' ? 'right-1' : ''
                      } ${isPending ? 'border-dashed opacity-75' : ''}`}
                      style={{ left: `${leftPxOf(track.startMs) + 8}px` }}
                      // The WHY, on hover/focus: pending delays the export, failed
                      // stops it. Both are things the user can act on.
                      title={
                        isPending
                          ? t('cinema.audio.status.pendingHint')
                          : isFailed
                            ? t('cinema.audio.status.failedHint')
                            : undefined
                      }
                    >
                      {track.kind === 'music' ? (
                        <MusicIcon className="size-3" />
                      ) : (
                        <MicIcon className="size-3" />
                      )}
                      <span className="truncate">{audioLabel(track.kind, track.shotId)}</span>
                      {/* Status is NEVER colour-only (design.md §8): the WORD
                          carries it and the tint only reinforces. Ready shows
                          nothing — a badge on every finished track is noise on a
                          lane that is mostly finished tracks. */}
                      {isPending || isFailed ? (
                        <span role="status" className="shrink-0 opacity-90">
                          {isPending
                            ? t('cinema.audio.status.processing')
                            : t('cinema.audio.status.failed')}
                        </span>
                      ) : null}
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
                  )
                })
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
            {/* The attach can fail for reasons the user can do nothing about from
                here (a rejected charge, a network blip). Before this it failed
                SILENTLY — the spinner stopped and the dialog just sat there, which
                is how the 2026-07-20 attach bug stayed invisible for so long.
                Localized via errorCodeMessageKey; the server's own words never
                reach the screen. */}
            {addTrackErrorCode !== null ? (
              <p role="alert" className="text-xs text-glow-red">
                {t(errorCodeMessageKey(addTrackErrorCode))}
              </p>
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
