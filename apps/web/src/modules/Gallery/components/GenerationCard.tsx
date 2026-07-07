// apps/web/src/modules/Gallery/components/GenerationCard.tsx
// One generation as a FIGURE (v3 terminal): the abyss media well is the plate
// (the recessed surface step reserved for user media), the prompt is a quiet
// mono caption below it, and the meta/actions row closes it over a white/10
// hairline — no card wrapper (the user's work is the hero, not a box).
// Three live states (the list's Empty state is the grid's): processing →
// stepped-pulse well + Progress + mono percent; succeeded → playable video or
// image (image opens the detail modal) with download/delete; failed →
// glow-red hairline well, failure reason, "credits refunded" chip, delete.
// Status triad (design.md v3 §2): processing=amber, succeeded=green, failed=red.
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
          {/* Stepped-pulse media well — the same surface-ladder loading pulse
              as Skeleton (animate-skeleton, never a gradient shimmer); the
              asset is on its way */}
          <div
            aria-hidden="true"
            className={`${aspectClass} w-full animate-skeleton rounded-lg bg-abyss`}
          />
          <div className="flex items-center gap-3">
            <Progress value={progress} label={t('gallery.processing')} />
            {/* Mono weight-400 percent in the processing AMBER — the number IS
                the status, so it wears the triad's processing color */}
            <span className="text-lg leading-none font-normal text-glow-amber">{progress}%</span>
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
            className={`${aspectClass} w-full rounded-lg bg-abyss`}
          />
        ) : (
          // Images enlarge in the detail modal — the media itself is the
          // button. The lift hover (motion-safe only) makes the plate FELT as
          // interactive without any shadow (elevation stays color-only).
          <button
            type="button"
            onClick={() => setIsDetailOpen(true)}
            className="rounded-lg transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none motion-safe:hover:-translate-y-0.5"
          >
            <img
              src={mediaUrl}
              alt={generation.prompt}
              loading="lazy"
              className={`${aspectClass} w-full rounded-lg bg-abyss object-cover`}
            />
          </button>
        )
      ) : null}

      {isFailed ? (
        <>
          {/* Quiet abyss well framed by the glow-red hairline — the border +
              text carry the FAILED status together (never color alone) */}
          <div
            className={`${aspectClass} flex w-full items-center justify-center rounded-lg border border-glow-red bg-abyss`}
          >
            <span className="text-sm font-medium text-glow-red">{t('gallery.failed')}</span>
          </div>
          {/* Safety blocks carry the machine-readable errorCode — render OUR
              localized copy; the raw provider message is not user copy */}
          {generation.errorCode === 'content_blocked' ? (
            <p className="text-xs text-mist-dim">{t('gallery.contentBlocked')}</p>
          ) : generation.errorMessage ? (
            <p className="text-xs text-mist-dim">{generation.errorMessage}</p>
          ) : null}
          <div>
            {/* The charge was refunded server-side — say so explicitly (the
                stamp Badge is the editorial refund mark) */}
            <Badge variant="success">{t('gallery.refunded')}</Badge>
          </div>
        </>
      ) : null}

      {/* The figure caption: the prompt in quiet mono mist under the plate —
          the terminal "fig." voice, not a card body */}
      <p className="line-clamp-2 text-sm leading-snug text-mist">{generation.prompt}</p>

      {generation.status !== 'processing' ? (
        // Meta/actions close the figure over a hairline — cost left, actions right
        <footer className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
          <span className="text-xs text-mist-dim">
            {t('gallery.cost', { count: generation.costCredits })}
          </span>
          <div className="flex items-center gap-3">
            {generation.status === 'succeeded' && mediaUrl ? (
              // Quiet text action: portal blue — the sanctioned prose-link
              // color (v3 §2); downloads are navigation, not status
              <a
                href={mediaUrl}
                download
                className="inline-flex min-h-10 items-center text-sm font-medium text-portal underline decoration-portal/40 underline-offset-4 transition-colors duration-200 hover:decoration-portal focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
              >
                {t('gallery.download')}
              </a>
            ) : null}
            {/* Delete is destructive → the RED specimen pill (v3 triad);
                v2 faked this with a ghost + red text override */}
            <Button
              variant="danger"
              onClick={() => deleteMutation.mutate(generation.id)}
              isLoading={deleteMutation.isPending}
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
