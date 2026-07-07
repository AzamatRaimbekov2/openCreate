// apps/web/src/modules/Gallery/components/GenerationCard.tsx
// One generation in the grid. Three live states (the list's Empty state is the
// grid's): processing → pulsing media well + Progress %; succeeded → playable
// video or image (image opens the detail modal) with download/delete; failed →
// danger border, failure reason, "credits refunded" badge, delete.
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
    <article
      className={`flex flex-col gap-3 rounded-2xl border bg-white p-3 shadow-sm ${
        isFailed ? 'border-danger' : 'border-ink/10'
      }`}
    >
      {generation.status === 'processing' ? (
        <>
          {/* Pulsing dark media well — the asset is on its way */}
          <div
            aria-hidden="true"
            className={`${aspectClass} w-full animate-pulse rounded-xl bg-media`}
          />
          <div className="flex items-center gap-2">
            <Progress value={progress} label={t('gallery.processing')} />
            <span className="text-xs text-ink-soft">{progress}%</span>
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
            className={`${aspectClass} w-full rounded-xl bg-media`}
          />
        ) : (
          // Images enlarge in the detail modal — the media itself is the button
          <button
            type="button"
            onClick={() => setIsDetailOpen(true)}
            className="rounded-xl focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
          >
            <img
              src={mediaUrl}
              alt={generation.prompt}
              loading="lazy"
              className={`${aspectClass} w-full rounded-xl bg-media object-cover`}
            />
          </button>
        )
      ) : null}

      {isFailed ? (
        <>
          {/* Quiet neutral well — the danger border + text carry the status */}
          <div
            className={`${aspectClass} flex w-full items-center justify-center rounded-xl bg-ink/5`}
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
            {/* The charge was refunded server-side — say so explicitly */}
            <Badge variant="success">{t('gallery.refunded')}</Badge>
          </div>
        </>
      ) : null}

      <p className="line-clamp-2 text-sm text-ink">{generation.prompt}</p>

      {generation.status !== 'processing' ? (
        <footer className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-soft">
            {t('gallery.cost', { count: generation.costCredits })}
          </span>
          <div className="flex items-center gap-1">
            {generation.status === 'succeeded' && mediaUrl ? (
              <a
                href={mediaUrl}
                download
                className="rounded-xl px-3 py-2 text-sm font-medium text-vermillion transition-opacity duration-150 hover:bg-sand focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
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
