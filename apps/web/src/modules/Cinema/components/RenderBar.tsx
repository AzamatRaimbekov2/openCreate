// apps/web/src/modules/Cinema/components/RenderBar.tsx
// The export STATUS STRIP (v7). The standing "Экспорт · Собрать mp4" card is
// gone — the trigger moved into the film header's ⋯ menu (owner request), and
// this component now renders NOTHING until an export is actually happening.
// A block that exists to hold one button is chrome; a strip that appears with
// the work and carries its progress/result is information.
//
// PURE PRESENTATION since v7: the render row arrives as a prop (FilmEditor owns
// the kick-off mutation and the poll — the header menu needs the same state to
// hide "Собрать mp4" while one is in flight, so the state had to live above
// both). Four things it can show:
//   starting  → the kick-off POST is in flight (no row yet)
//   processing → determinate progress + percent
//   succeeded  → the green Download link (a served /media/<id>.mp4)
//   failed / kick-off failed → a CALM localized retry (never raw ffmpeg text)
import { useTranslation } from 'react-i18next'
import type { FilmRender } from '@opencreate/contracts'
import { Card, ErrorState, Progress } from 'shared/ui'
import { DownloadIcon } from './icons'

export type RenderBarProps = {
  // The tracked render row (the poll result). undefined = none yet.
  render: FilmRender | undefined
  // True while the kick-off POST is in flight (menu item fired, no row yet)
  isStarting: boolean
  // The kick-off POST itself failed before any render row existed
  hasStartError: boolean
  // Re-fire the export — retry after a failed render or a failed kick-off
  onRetry: () => void
}

export function RenderBar({ render, isStarting, hasStartError, onRetry }: RenderBarProps) {
  const { t } = useTranslation()

  // Idle: no strip at all — the export lives in the header menu until it runs
  if (!render && !isStarting && !hasStartError) return null

  return (
    // Glass, because the strip floats over the stage's dark well and the
    // specular top edge is what separates the two.
    <Card>
      <section aria-label={t('cinema.render.title')} className="flex flex-col gap-3">
        <span className="text-xs text-mist-dim">{t('cinema.render.title')}</span>

        {/* Kick-off in flight or processing — a determinate bar + percent
            (progress may be null early; the bar shows 0 until the first poll) */}
        {isStarting || render?.status === 'processing' ? (
          <div className="flex flex-col gap-1.5">
            <Progress value={render?.progress ?? 0} label={t('cinema.render.processing')} />
            <p role="status" className="text-xs text-glow-amber">
              {t('cinema.render.processing')}
              {render?.progress != null ? ` · ${render.progress}%` : ''}
            </p>
          </div>
        ) : null}

        {/* Succeeded — the download link (a served /media/<id>.mp4) */}
        {render?.status === 'succeeded' && render.mediaUrl ? (
          <a
            href={render.mediaUrl}
            download
            className="inline-flex min-h-8 items-center justify-center gap-2 self-start rounded-full border border-white/10 bg-specimen-green/20 px-4 py-1 text-xs font-medium text-glow-green shadow-pill transition-colors duration-200 hover:bg-specimen-green/35 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            <DownloadIcon />
            {t('cinema.render.download')}
          </a>
        ) : null}

        {/* Failed render OR failed kick-off — never the raw server text; one
            calm localized retry re-fires the export through the same path the
            menu item uses */}
        {render?.status === 'failed' || hasStartError ? (
          <ErrorState message={t('cinema.render.failed')} onRetry={onRetry} />
        ) : null}
      </section>
    </Card>
  )
}
