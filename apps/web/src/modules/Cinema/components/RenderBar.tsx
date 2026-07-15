// apps/web/src/modules/Cinema/components/RenderBar.tsx
// The export control: POST a render (202 processing), poll it to a terminal
// state, then show a Download link (succeeded) or a calm retry (failed). Owns
// the active render id locally — the editor does not need to know it. The button
// is disabled while a render is in flight (the API also caps concurrency, but a
// disabled button is the honest client-side mirror of that limit).
//
// v4 hierarchy: this is an ACTION BAR, not a panel. It renders as a single glass
// row — caption on the left, the one green pill on the right — and only grows
// when a render is actually running (progress) or has finished (download/retry).
// A titled card here would have given the export button the same visual weight
// as the video you are watching, which is the confusion v4 set out to fix.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, ErrorState, Progress } from 'shared/ui'
import { useCreateRender, useRender } from '../model/rendersApi'
import { DownloadIcon } from './icons'

export type RenderBarProps = {
  filmId: string
  // False when the film has no shots — nothing to render yet
  canRender: boolean
}

export function RenderBar({ filmId, canRender }: RenderBarProps) {
  const { t } = useTranslation()
  const createRender = useCreateRender()
  const [renderId, setRenderId] = useState<string | null>(null)
  const render = useRender(filmId, renderId).data

  const isProcessing = createRender.isPending || render?.status === 'processing'

  const start = () =>
    createRender.mutate(filmId, {
      // Track the new render so useRender begins polling it
      onSuccess: (created) => setRenderId(created.id),
    })

  return (
    // Glass, because the bar floats over the stage's dark well and the specular
    // top edge is what separates the two. No title prop: the caption below is
    // inline chrome, and a heading row would re-introduce panel weight.
    <Card>
      <section aria-label={t('cinema.render.title')} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-mist-dim">{t('cinema.render.title')}</span>
          {/* size="sm" — editor tool chrome (v5 compact pass), same scale as the
              timeline's authoring buttons */}
          <Button
            size="sm"
            onClick={start}
            isLoading={isProcessing}
            disabled={!canRender || isProcessing}
          >
            {t('cinema.render.cta')}
          </Button>
        </div>

        {/* Processing — a determinate bar + percent (progress may be null early) */}
        {render?.status === 'processing' ? (
          <div className="flex flex-col gap-1.5">
            <Progress value={render.progress ?? 0} label={t('cinema.render.processing')} />
            <p role="status" className="text-xs text-glow-amber">
              {t('cinema.render.processing')}
              {render.progress !== null ? ` · ${render.progress}%` : ''}
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

        {/* Failed — never the raw server errorMessage; a calm localized retry */}
        {render?.status === 'failed' ? (
          <ErrorState message={t('cinema.render.failed')} onRetry={start} />
        ) : null}

        {/* The kick-off itself failed (rate limit / conflict) before any render row */}
        {createRender.isError && !render ? (
          <p role="alert" className="text-xs text-glow-red">
            {t('errors.actionFailed')}
          </p>
        ) : null}
      </section>
    </Card>
  )
}
