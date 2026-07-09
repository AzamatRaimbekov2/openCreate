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
import { Badge, Button, ErrorState, Menu, Progress } from 'shared/ui'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { useLiveGeneration } from '../model/generationsApi'
import { GenerationDetail } from './GenerationDetail'
import { DotsIcon } from './icons'
import { useGenerationActions } from './useGenerationActions'

export type GenerationCardProps = {
  // List item from the ['generations'] cache — the card keeps it live itself
  generation: Generation
  // Refill the composer from this generation. Injected by the route (Gallery
  // must not import the Generator's draft store); absent on /library, where the
  // Regenerate action then simply does not appear.
  onRegenerate?: (generation: Generation) => void
}

export function GenerationCard({ generation: seed, onRegenerate }: GenerationCardProps) {
  const { t } = useTranslation()
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  // Poll while processing; render list data once terminal (no extra requests).
  // The hook also reports the two ways polling can stop early (QA findings
  // 1-2): isStalled (20-min budget spent) and isPollError (the GET itself
  // failed with nothing fetched yet) — refresh() is the manual poll for both.
  const { generation, isStalled, isPollError, refresh, isRefreshing } = useLiveGeneration(seed)
  // The one action set, shared with the detail view's icon rail (and the table
  // row). exactOptionalPropertyTypes: omit the key rather than pass undefined.
  const { actions, confirmDialog } = useGenerationActions({
    generation,
    ...(onRegenerate ? { onRegenerate } : {}),
  })

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
        // `group` scopes the hover that reveals the overflow menu. The menu is
        // ALSO revealed by focus-within, so a keyboard user can reach it — a
        // hover-only affordance is invisible to anyone who never hovers.
        <div className="group relative">
          {generation.type === 'video' ? (
            // The square tile letterboxes non-square footage on the abyss plate
            // (the recessed step) — the full frame lives in the detail modal
            <video
              controls
              src={mediaUrl}
              preload="metadata"
              aria-label={generation.prompt}
              className="aspect-square w-full rounded-xl bg-abyss"
            />
          ) : (
            // Images enlarge in the detail modal — the media itself is the
            // button. The lift hover (motion-safe only) makes the plate FELT as
            // interactive without any shadow (elevation stays color-only).
            <button
              type="button"
              onClick={() => setIsDetailOpen(true)}
              className="block w-full rounded-xl transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none motion-safe:hover:-translate-y-0.5"
            >
              {/* object-cover crops to the square tile — honest full frame is
                  one click away in the detail modal */}
              <img
                src={mediaUrl}
                alt={generation.prompt}
                loading="lazy"
                className="aspect-square w-full rounded-xl bg-abyss object-cover"
              />
            </button>
          )}

          {/* Overflow menu, floating over the media's top-right corner. Always
              in the DOM (never conditionally mounted) so its focus target is
              stable; only its OPACITY is animated. Kept visible on small
              viewports, where "hover" does not exist at all. */}
          <div className="absolute top-2 right-2 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
            <Menu
              label={t('gallery.actions.label')}
              items={actions}
              triggerClassName="flex size-8 items-center justify-center rounded-full border border-white/15 bg-void/60 text-white shadow-lg shadow-black/40 backdrop-blur transition-colors duration-200 hover:bg-void/80 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              <DotsIcon />
            </Menu>
          </div>
        </div>
      ) : null}

      {isFailed ? (
        <>
          {/* Quiet square abyss tile framed by the glow-red hairline — the
              border + text carry the FAILED status together (never color alone).
              It carries the SAME overflow menu as a succeeded plate: a failed
              generation must still be deletable, and its prompt is exactly what
              the user wants to copy or re-run after a safety block. */}
          <div className="group relative flex aspect-square w-full items-center justify-center rounded-xl border border-glow-red bg-abyss">
            <span className="text-sm font-medium text-glow-red">{t('gallery.failed')}</span>
            <div className="absolute top-2 right-2 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
              <Menu
                label={t('gallery.actions.label')}
                items={actions}
                triggerClassName="flex size-8 items-center justify-center rounded-full border border-white/15 bg-void/60 text-white shadow-lg shadow-black/40 backdrop-blur transition-colors duration-200 hover:bg-void/80 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
              >
                <DotsIcon />
              </Menu>
            </div>
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

      {confirmDialog}

      {generation.status === 'succeeded' ? (
        <GenerationDetail
          generation={generation}
          {...(onRegenerate ? { onRegenerate } : {})}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />
      ) : null}
    </article>
  )
}
