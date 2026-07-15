// apps/web/src/modules/Cinema/components/PreviewPlayer.tsx
// A simple, robust sequential DOM player — NOT an encoder. It plays the shots'
// media back-to-back on one canvas: a video advances on 'ended', an image/title
// slate advances on a durationMs timer (cleaned up on every step). This is an
// APPROXIMATION of the timeline; the server ffmpeg render is authoritative, and
// the UI says so. No wasm, no crossfade compositing — deliberately (ADR).
//
// v4 layout: the player is the STAGE — the one thing you look at. It is a single
// `Card surface="well"` with `padding="none"` so the media runs edge to edge and
// the transport controls hang off it as a hairline footer. It carries no visible
// heading on purpose: a hero that announces itself is a panel, not a stage (the
// region still has an accessible name for screen readers).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AspectRatio, Shot, ShotTitle } from '@opencreate/contracts'
import { Card } from 'shared/ui'
import { useShotGenerations } from '../model/shotGeneration'
import { PauseIcon, PlayIcon } from './icons'

const ASPECT_CLASS: Record<AspectRatio, string> = {
  '16:9': 'aspect-video',
  '1:1': 'aspect-square',
  '9:16': 'aspect-[9/16]',
}

const TITLE_POSITION = {
  top: 'items-start',
  center: 'items-center',
  bottom: 'items-end',
} as const

// One resolved timeline step: media if the clip is ready, else a slate.
type PlayClip = {
  key: string
  kind: 'video' | 'image' | 'slate'
  src: string | undefined
  durationMs: number
  title: ShotTitle | null
}

export type PreviewPlayerProps = {
  shots: Shot[]
  filmAspect: AspectRatio
}

export function PreviewPlayer({ shots, filmAspect }: PreviewPlayerProps) {
  const { t } = useTranslation()
  const generationIds = shots.map((shot) => shot.generationId).filter((id): id is string => id !== null)
  const clipsById = useShotGenerations(generationIds)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [index, setIndex] = useState(0)

  // Resolve each shot to a playable step. A ready generation → its media; a
  // title card or a not-yet-ready clip → a slate (so preview never stalls).
  const playlist = useMemo<PlayClip[]>(
    () =>
      shots.map((shot) => {
        const generation = shot.generationId ? clipsById[shot.generationId] : undefined
        const media = generation?.status === 'succeeded' ? generation.mediaUrls[0] : undefined
        const kind: PlayClip['kind'] = media
          ? generation?.type === 'video'
            ? 'video'
            : 'image'
          : 'slate'
        return { key: shot.id, kind, src: media, durationMs: shot.durationMs, title: shot.title }
      }),
    [shots, clipsById],
  )

  const clip = playlist[index]

  // Advance one step, stopping (and rewinding) at the end.
  const goNext = () => {
    if (index + 1 < playlist.length) setIndex(index + 1)
    else {
      setIsPlaying(false)
      setIndex(0)
    }
  }

  // Non-video steps advance on a timer; the video step advances on 'ended'.
  useEffect(() => {
    if (!isPlaying || !clip || clip.kind === 'video') return
    const timer = setTimeout(goNext, clip.durationMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goNext closes over index intentionally
  }, [isPlaying, index, clip?.kind, clip?.durationMs])

  // Drive the <video> element's play/pause imperatively (autoplay is blocked
  // mid-sequence otherwise). muted keeps autoplay policy happy.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) void video.play().catch(() => undefined)
    else video.pause()
  }, [isPlaying, index])

  const togglePlay = () => {
    if (playlist.length === 0) return
    // Restart from the top if we ended on the last frame
    if (!isPlaying && index >= playlist.length) setIndex(0)
    setIsPlaying((prev) => !prev)
  }

  return (
    // The well IS the stage: `overflow-hidden` lets the media reach the card's
    // rounded corners, so nothing frames the picture but the card itself.
    <Card surface="well" padding="none" className="overflow-hidden">
      <section aria-label={t('cinema.preview.title')}>
        {/* The canvas — sized to the film's real output shape, CAPPED at 42svh
            (v5): uncapped, a 16:9 canvas in the ~1000px stage column is ~580px
            tall and single-handedly pushes the export bar and audio below the
            fold. When the cap bites, the box is wider than the film's aspect and
            object-contain letterboxes the media inside the dark well — the same
            thing a real monitor does with an off-shape source. */}
        <div className={`relative max-h-[42svh] w-full ${ASPECT_CLASS[filmAspect]}`}>
          {clip ? (
            <>
              {clip.kind === 'video' && clip.src ? (
                <video
                  key={clip.key}
                  ref={videoRef}
                  src={clip.src}
                  muted
                  playsInline
                  onEnded={goNext}
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
            onClick={togglePlay}
            disabled={playlist.length === 0}
            aria-label={isPlaying ? t('cinema.preview.pause') : t('cinema.preview.play')}
            className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-specimen-amber/20 text-lumen-amber shadow-pill transition-colors duration-200 hover:bg-specimen-amber/35 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:opacity-50"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          {playlist.length > 0 ? (
            <span className="text-xs text-mist-dim">
              {t('cinema.preview.position', {
                current: Math.min(index + 1, playlist.length),
                total: playlist.length,
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
