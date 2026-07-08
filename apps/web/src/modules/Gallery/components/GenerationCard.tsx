// apps/web/src/modules/Gallery/components/GenerationCard.tsx
// One generation as a FIGURE (v3 terminal, stage 3): a SQUARE abyss tile is
// the plate (8px radius, the recessed surface step reserved for user media —
// the same square-tile language as the landing's specimen grid, so library
// and landing read as one product), the prompt is a quiet mono caption below
// it, and the meta/actions row closes it over a white/10 hairline — no card
// wrapper (the user's work is the hero, not a box).
// Live states (the list's Empty state is the grid's): processing →
// stepped-pulse tile + Progress + mono percent, with two honest sub-states —
// stalled (20-min polling budget spent: amber note + manual refresh) and
// poll-error (the status GET failed: ErrorState + retry); succeeded →
// playable video or image (image opens the detail modal) + a green "ready"
// chip; failed → glow-red hairline tile, failure reason, "credits refunded" chip.
// Status triad (design.md v3 §2): processing=amber, succeeded=green,
// failed=red. Delete is a glow-red ICON button (#ff2056 = the sparing
// icon-accent rule) — destructive intent without a loud pill on every figure.
// A paid generation never dies in one click: the icon only opens a blocking
// confirmation alertdialog; the optimistic mutation fires on explicit confirm.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Generation } from '@opencreate/contracts'
import { Badge, Button, ErrorState, Progress } from 'shared/ui'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { useLiveGeneration } from '../model/generationsApi'
import { DeleteGenerationAction } from './DeleteGenerationAction'
import { GenerationDetail } from './GenerationDetail'

export type GenerationCardProps = {
  // List item from the ['generations'] cache — the card keeps it live itself
  generation: Generation
}

export function GenerationCard({ generation: seed }: GenerationCardProps) {
  const { t } = useTranslation()
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  // Poll while processing; render list data once terminal (no extra requests).
  // The hook also reports the two ways polling can stop early (QA findings
  // 1-2): isStalled (20-min budget spent) and isPollError (the GET itself
  // failed with nothing fetched yet) — refresh() is the manual poll for both.
  const { generation, isStalled, isPollError, refresh, isRefreshing } = useLiveGeneration(seed)

  const mediaUrl = generation.mediaUrls[0]
  const progress = generation.progress ?? 0
  const isFailed = generation.status === 'failed'

  return (
    <article className="flex flex-col gap-3">
      {generation.status === 'processing' ? (
        isPollError ? (
          // The status check itself failed (network/500) — never leave the
          // card frozen at "Generating N%": say it and offer a retry that
          // restarts the poll query (frontend-error-ux: error + recovery)
          <ErrorState message={t('gallery.pollFailed')} onRetry={refresh} />
        ) : (
          <>
            {/* Stepped-pulse media tile — the same surface-ladder loading pulse
                as Skeleton (animate-skeleton, never a gradient shimmer); square
                like every gallery plate, so the grid never jumps between states */}
            <div
              aria-hidden="true"
              className="aspect-square w-full animate-skeleton rounded-lg bg-abyss"
            />
            <div className="flex items-center gap-3">
              <Progress value={progress} label={t('gallery.processing')} />
              {/* Mono weight-400 percent in the processing AMBER — the number IS
                  the status, so it wears the triad's processing color */}
              <span className="text-lg leading-none font-normal text-glow-amber">{progress}%</span>
            </div>
            {isStalled ? (
              // 20 minutes past createdAt the automatic poll stops (bounded
              // polling); the card says so honestly in the processing AMBER —
              // nothing failed yet, so red would lie. The ghost pill runs ONE
              // manual poll; role="status" announces the change politely.
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-xs text-glow-amber">{t('gallery.stalled')}</span>
                <Button
                  variant="ghost"
                  onClick={refresh}
                  isLoading={isRefreshing}
                >
                  {t('gallery.refresh')}
                </Button>
              </div>
            ) : null}
          </>
        )
      ) : null}

      {generation.status === 'succeeded' && mediaUrl ? (
        generation.type === 'video' ? (
          // The square tile letterboxes non-square footage on the abyss plate
          // (the recessed step) — the full frame lives in the detail modal
          <video
            controls
            src={mediaUrl}
            preload="metadata"
            aria-label={generation.prompt}
            className="aspect-square w-full rounded-lg bg-abyss"
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
            {/* object-cover crops to the square tile — honest full frame is
                one click away in the detail modal */}
            <img
              src={mediaUrl}
              alt={generation.prompt}
              loading="lazy"
              className="aspect-square w-full rounded-lg bg-abyss object-cover"
            />
          </button>
        )
      ) : null}

      {generation.status === 'succeeded' ? (
        <div>
          {/* The green READY chip — the triad's succeeded color, said in text
              so the status is never color-only (a11y rule) */}
          <Badge variant="success">{t('gallery.ready')}</Badge>
        </div>
      ) : null}

      {isFailed ? (
        <>
          {/* Quiet square abyss tile framed by the glow-red hairline — the
              border + text carry the FAILED status together (never color alone) */}
          <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-glow-red bg-abyss">
            <span className="text-sm font-medium text-glow-red">{t('gallery.failed')}</span>
          </div>
          {/* The PRIMARY reason is always OUR copy, keyed by the machine-
              readable errorCode (errorCopy map; unknown/missing → generic) —
              raw server text never leads (QA finding 3, design.md §9) */}
          <p className="text-xs text-mist">{t(errorCodeMessageKey(generation.errorCode))}</p>
          {/* The raw provider detail may follow as the quiet secondary mono
              line — EXCEPT safety blocks, whose moderation strings are not
              user copy at all (recorded review decision, 2026-07-07) */}
          {generation.errorMessage && generation.errorCode !== 'content_blocked' ? (
            <p className="text-xs break-words text-mist-dim">{generation.errorMessage}</p>
          ) : null}
          <div>
            {/* The charge was refunded server-side — say so explicitly (the
                refund note the failed state promises) */}
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
          <div className="flex items-center gap-1">
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
            {/* Icon + confirmation + mutation, shared with the table row so a
                paid generation can never die in one click in either view */}
            <DeleteGenerationAction generationId={generation.id} />
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
