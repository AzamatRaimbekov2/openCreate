// apps/web/src/modules/Gallery/components/GenerationCard.tsx
// One generation as a magazine FIGURE (stage-3 redesign): the dark media well
// is the plate, the prompt is a serif-italic figure caption printed on the
// cream below it, and the meta/actions row closes it over a hairline — the
// white card wrapper is retired (the user's work is the hero, not a box).
// Three live states (the list's Empty state is the grid's): processing →
// pulsing media well + Progress + serif percent; succeeded → playable video or
// image (image opens the detail modal) with download/delete; failed → danger
// hairline well, failure reason, "credits refunded" stamp, delete.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AspectRatio, Generation } from '@opencreate/contracts'
import { Badge, Button, Progress } from 'shared/ui'
import { useDeleteGeneration, useLiveGeneration } from '../model/generationsApi'
import { GenerationDetail } from './GenerationDetail'

export type GenerationCardProps = {
  // List item from the ['generations'] cache — the card keeps it live itself
  generation: Generation
}

// Media wells keep the generation's real aspect so cards don't jump when the
// asset arrives (CLS). Static map — Tailwind needs literal class names.
const aspectClasses: Record<AspectRatio, string> = {
  '16:9': 'aspect-video',
  '1:1': 'aspect-square',
  '9:16': 'aspect-[9/16]',
}

export function GenerationCard({ generation: seed }: GenerationCardProps) {
  const { t } = useTranslation()
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  // Poll while processing; render list data once terminal (no extra requests)
  const generation = useLiveGeneration(seed)
  const deleteMutation = useDeleteGeneration()

  const aspectClass = aspectClasses[generation.params.aspectRatio]
  const mediaUrl = generation.mediaUrls[0]
  const progress = generation.progress ?? 0
  const isFailed = generation.status === 'failed'

  return (
    <article className="flex flex-col gap-3">
      {generation.status === 'processing' ? (
        <>
          {/* Pulsing dark media well — the asset is on its way */}
          <div
            aria-hidden="true"
            className={`${aspectClass} w-full animate-pulse rounded-sm bg-media`}
          />
          <div className="flex items-center gap-3">
            <Progress value={progress} label={t('gallery.processing')} />
            {/* Serif display percent (brief: "processing state with serif
                percent") — the number is the state, so it gets the numeral voice */}
            <span className="font-display text-lg leading-none font-semibold tracking-tight text-ink">
              {progress}%
            </span>
          </div>
        </>
      ) : null}

      {generation.status === 'succeeded' && mediaUrl ? (
        generation.type === 'video' ? (
          <video
            controls
            src={mediaUrl}
            preload="metadata"
            aria-label={generation.prompt}
            className={`${aspectClass} w-full rounded-sm bg-media`}
          />
        ) : (
          // Images enlarge in the detail modal — the media itself is the
          // button. The print-lift hover (motion-safe only) makes the plate
          // FELT as interactive without any shadow.
          <button
            type="button"
            onClick={() => setIsDetailOpen(true)}
            className="rounded-sm transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:outline-none motion-safe:hover:-translate-y-0.5"
          >
            <img
              src={mediaUrl}
              alt={generation.prompt}
              loading="lazy"
              className={`${aspectClass} w-full rounded-sm bg-media object-cover`}
            />
          </button>
        )
      ) : null}

      {isFailed ? (
        <>
          {/* Quiet neutral well framed by the danger hairline — the border +
              text carry the status together (never color alone) */}
          <div
            className={`${aspectClass} flex w-full items-center justify-center rounded-sm border border-danger bg-ink/5`}
          >
            <span className="text-sm font-medium text-danger">{t('gallery.failed')}</span>
          </div>
          {/* Safety blocks carry the machine-readable errorCode — render OUR
              localized copy; the raw provider message is not user copy */}
          {generation.errorCode === 'content_blocked' ? (
            <p className="text-xs text-ink-soft">{t('gallery.contentBlocked')}</p>
          ) : generation.errorMessage ? (
            <p className="text-xs text-ink-soft">{generation.errorMessage}</p>
          ) : null}
          <div>
            {/* The charge was refunded server-side — say so explicitly (the
                stamp Badge is the editorial refund mark) */}
            <Badge variant="success">{t('gallery.refunded')}</Badge>
          </div>
        </>
      ) : null}

      {/* The figure caption: the prompt in serif italic, printed on the cream
          under the plate — magazine "fig." voice, not a card body */}
      <p className="line-clamp-2 font-display text-sm leading-snug text-ink italic">
        {generation.prompt}
      </p>

      {generation.status !== 'processing' ? (
        // Meta/actions close the figure over a hairline — cost left, actions right
        <footer className="flex items-center justify-between gap-2 border-t border-ink/10 pt-2">
          <span className="text-xs text-ink-soft">
            {t('gallery.cost', { count: generation.costCredits })}
          </span>
          <div className="flex items-center gap-3">
            {generation.status === 'succeeded' && mediaUrl ? (
              // Quiet text action in the editorial idiom: ink + hairline
              // underline that turns vermillion on hover (small vermillion
              // text would break the §2 contrast policy)
              <a
                href={mediaUrl}
                download
                className="inline-flex min-h-10 items-center text-sm font-medium text-ink underline decoration-ink/30 underline-offset-4 transition-colors duration-200 hover:decoration-vermillion focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
              >
                {t('gallery.download')}
              </a>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => deleteMutation.mutate(generation.id)}
              isLoading={deleteMutation.isPending}
              className="text-danger"
            >
              {t('gallery.delete')}
            </Button>
          </div>
        </footer>
      ) : null}

      {generation.status === 'succeeded' ? (
        <GenerationDetail
          generation={generation}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />
      ) : null}
    </article>
  )
}
