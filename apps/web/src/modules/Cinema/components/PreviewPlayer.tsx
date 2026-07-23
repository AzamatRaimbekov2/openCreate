// apps/web/src/modules/Cinema/components/PreviewPlayer.tsx
// The editor STAGE — a PLAYHEAD-DRIVEN preview (NLE Phase 1, ADR
// docs/wiki/decisions/cinema-nle-timeline.md). It is NOT an encoder and NOT the
// old sequential index player: it reads the ONE timeline clock, resolves which
// clip the playhead sits on (`clipAtMs`), mounts that clip's <video>/<img>/slate,
// and seeks the video to the offset WITHIN it — frame-accurate, so clicking a
// tile or scrubbing the ruler makes the picture jump. The server ffmpeg render is
// still authoritative; the caveat line says so.
//
// PLAY is a requestAnimationFrame loop that advances the clock's `playheadMs` by
// real elapsed time; at a clip boundary `clipAtMs` returns the next shot and the
// <video key> swaps; at the film end it parks + pauses. The rAF is cancelled on
// pause AND on unmount — a leaked frame loop is the #1 review risk here, so the
// loop is the only place timers live (the clock store itself stays timer-free).
//
// v4 layout (unchanged): ONE `Card surface="well" padding="none"` — the media
// fills the stage edge-to-edge (`object-contain` letterboxes the film's real
// aspect), the transport hangs off it as a hairline footer, and the region has no
// visible heading (a stage, not a panel) but keeps an accessible name.
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Shot, ShotTitle } from '@opencreate/contracts'
import { Card } from 'shared/ui'
import { useShotGenerations } from '../model/shotGeneration'
import { useTimelineClock } from '../model/timelineClock'
import { clipAtMs, totalDurationMs } from '../model/timelineGeometry'
import { PauseIcon, PlayIcon } from './icons'

const TITLE_POSITION = {
  top: 'items-start',
  center: 'items-center',
  bottom: 'items-end',
} as const

// The resolved current clip: media if the shot's generation is ready, else a
// slate (so the preview never stalls on a not-yet-rendered clip or a title card).
type PlayClip = {
  key: string
  kind: 'video' | 'image' | 'slate'
  src: string | undefined
  title: ShotTitle | null
}

export type PreviewPlayerProps = {
  shots: Shot[]
}

export function PreviewPlayer({ shots }: PreviewPlayerProps) {
  const { t } = useTranslation()
  const generationIds = shots.map((shot) => shot.generationId).filter((id): id is string => id !== null)
  const clipsById = useShotGenerations(generationIds)
  const videoRef = useRef<HTMLVideoElement>(null)

  // The clock is the source of truth for position + transport; the rAF loop reads
  // fresh state via getState() (below) to avoid stale-closure drift per frame.
  const playheadMs = useTimelineClock((state) => state.playheadMs)
  const isPlaying = useTimelineClock((state) => state.isPlaying)
  const seek = useTimelineClock((state) => state.seek)
  const toggle = useTimelineClock((state) => state.toggle)

  const totalMs = useMemo(() => totalDurationMs(shots), [shots])
  // Which shot the playhead is on, and how far into it (drives video.currentTime).
  const at = useMemo(() => clipAtMs(shots, playheadMs), [shots, playheadMs])

  // Resolve that shot to a playable step. A ready generation → its media; a title
  // card or a still-rendering clip → a slate.
  const clip = useMemo<PlayClip | null>(() => {
    if (at === null) return null
    const shot = shots[at.index]
    if (shot === undefined) return null
    const generation = shot.generationId ? clipsById[shot.generationId] : undefined
    const media = generation?.status === 'succeeded' ? generation.mediaUrls[0] : undefined
    const kind: PlayClip['kind'] = media ? (generation?.type === 'video' ? 'video' : 'image') : 'slate'
    return { key: shot.id, kind, src: media, title: shot.title }
  }, [at, shots, clipsById])

  // SEEK sync: when the user moves the playhead (not while the rAF drives it), pull
  // the <video> to the offset within the current clip. During playback the video
  // runs itself and the rAF is the master clock, so we leave currentTime alone
  // (forcing it every frame would fight the element and stutter).
  useEffect(() => {
    const video = videoRef.current
    if (!video || at === null || clip?.kind !== 'video') return
    if (isPlaying) return
    const target = at.offsetMs / 1000
    if (Math.abs(video.currentTime - target) > 0.05) video.currentTime = target
  }, [at, clip?.kind, isPlaying])

  // Drive the <video> play/pause imperatively (autoplay is blocked mid-sequence).
  // SOUND ON PLAY (Phase 2): the clip carries its own soundtrack, so it is audible
  // WHILE PLAYING and silent while paused/scrubbing — a scrub never blasts audio,
  // and the user's play gesture is the activation that lets unmuted playback start.
  // `muted` is set imperatively (not a JSX prop) so React never re-asserts it over
  // this during the per-frame re-renders while playing. Re-runs on a boundary swap.
  useEffect(() => {
    const video = videoRef.current
    if (!video || clip?.kind !== 'video') return
    video.muted = !isPlaying
    if (isPlaying) void video.play().catch(() => undefined)
    else video.pause()
  }, [isPlaying, clip?.kind, clip?.key])

  // PLAY loop: advance the clock by real elapsed time; swap at boundaries happens
  // for free (clipAtMs re-resolves), and at the film end we park + pause. The
  // cleanup cancels the pending frame on pause/unmount — no leak.
  useEffect(() => {
    if (!isPlaying || totalMs === 0) return
    let raf = 0
    let last: number | null = null
    const tick = (now: number) => {
      if (last === null) last = now
      const elapsed = now - last
      last = now
      const state = useTimelineClock.getState()
      const next = state.playheadMs + elapsed
      if (next >= totalMs) {
        state.seek(totalMs, totalMs)
        state.pause()
        return
      }
      state.seek(next, totalMs)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, totalMs])

  // Frame-accurate mount: a freshly swapped <video> starts at the clip offset once
  // its metadata is known (the effect above cannot set currentTime before load).
  const syncVideoToOffset = () => {
    const video = videoRef.current
    if (video && at !== null && clip?.kind === 'video') video.currentTime = at.offsetMs / 1000
  }

  const handleToggle = () => {
    if (totalMs === 0) return
    // Restart from the top if we are parked at the very end.
    if (!isPlaying && playheadMs >= totalMs) seek(0, totalMs)
    toggle()
  }

  return (
    // The well IS the stage: `overflow-hidden` lets the media reach the card's
    // rounded corners, so nothing frames the picture but the card itself.
    <Card surface="well" padding="none" className="flex min-h-0 flex-1 overflow-hidden">
      <section aria-label={t('cinema.preview.title')} className="flex min-h-0 flex-1 flex-col">
        {/* The canvas FILLS the stage; object-contain letterboxes the film's real
            aspect inside (the box is aspect-agnostic — the media keeps its ratio). */}
        <div className="relative min-h-0 w-full flex-1">
          {clip ? (
            <>
              {clip.kind === 'video' && clip.src ? (
                <video
                  key={clip.key}
                  ref={videoRef}
                  src={clip.src}
                  playsInline
                  onLoadedMetadata={syncVideoToOffset}
                  className="size-full object-contain"
                />
              ) : clip.kind === 'image' && clip.src ? (
                <img key={clip.key} src={clip.src} alt="" className="size-full object-contain" />
              ) : (
                // Slate: a title card, or a clip that has not rendered yet
                <div className="grid size-full place-items-center px-6 text-center">
                  <p className="text-mist">{clip.title?.text ?? t('cinema.preview.placeholder')}</p>
                </div>
              )}
              {/* Title overlay on media clips (the slate already shows its text) */}
              {clip.title && clip.kind !== 'slate' ? (
                <div
                  className={`pointer-events-none absolute inset-0 flex justify-center p-4 ${TITLE_POSITION[clip.title.position]}`}
                >
                  <span className="rounded bg-void/70 px-3 py-1 text-sm text-white">
                    {clip.title.text}
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="grid size-full place-items-center text-sm text-mist-dim">
              {t('cinema.preview.empty')}
            </div>
          )}
        </div>

        {/* Transport strip: chrome hanging off the picture, separated by a
            hairline rather than a gap — one object, not a card plus a toolbar. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 px-3 py-1.5">
          <button
            type="button"
            onClick={handleToggle}
            disabled={shots.length === 0}
            aria-label={isPlaying ? t('cinema.preview.pause') : t('cinema.preview.play')}
            className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-specimen-amber/20 text-lumen-amber shadow-pill transition-colors duration-200 hover:bg-specimen-amber/35 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:opacity-50"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          {shots.length > 0 ? (
            <span className="text-xs text-mist-dim">
              {t('cinema.preview.position', {
                current: Math.min((at?.index ?? 0) + 1, shots.length),
                total: shots.length,
              })}
            </span>
          ) : null}
          {/* Honest caveat — the render is authoritative */}
          <p className="ml-auto text-xs text-mist-dim/70">{t('cinema.preview.approx')}</p>
        </div>
      </section>
    </Card>
  )
}
