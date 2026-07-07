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
import { Badge, Button, ErrorState, Modal, Progress } from 'shared/ui'
import { useDeleteGeneration, useLiveGeneration } from '../model/generationsApi'
import { GenerationDetail } from './GenerationDetail'

export type GenerationCardProps = {
  // List item from the ['generations'] cache — the card keeps it live itself
  generation: Generation
}

export function GenerationCard({ generation: seed }: GenerationCardProps) {
  const { t } = useTranslation()
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  // Delete is destructive AND paid — the icon opens this confirmation first;
  // the mutation (and its optimistic cache removal) fires only on confirm
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  // Poll while processing; render list data once terminal (no extra requests).
  // The hook also reports the two ways polling can stop early (QA findings
  // 1-2): isStalled (20-min budget spent) and isPollError (the GET itself
  // failed with nothing fetched yet) — refresh() is the manual poll for both.
  const { generation, isStalled, isPollError, refresh, isRefreshing } = useLiveGeneration(seed)
  const deleteMutation = useDeleteGeneration()

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
          {/* Safety blocks carry the machine-readable errorCode — render OUR
              localized copy; the raw provider message is not user copy */}
          {generation.errorCode === 'content_blocked' ? (
            <p className="text-xs text-mist-dim">{t('gallery.contentBlocked')}</p>
          ) : generation.errorMessage ? (
            <p className="text-xs text-mist-dim">{generation.errorMessage}</p>
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
            <DeleteButton
              isPending={deleteMutation.isPending}
              // The icon never deletes directly — it only asks the question
              onDelete={() => setIsDeleteConfirmOpen(true)}
            />
          </div>
        </footer>
      ) : null}

      {/* Blocking confirmation for the destructive action (frontend-error-ux):
          Modal role="alertdialog" on the steel sheet; the danger specimen pill
          confirms, the ghost pill cancels. Closing first keeps the exchange
          snappy — the optimistic removal makes the card vanish right after. */}
      <Modal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        title={t('gallery.deleteConfirm.title')}
        role="alertdialog"
      >
        <div className="flex flex-col gap-6">
          {/* Terminal voice: one quiet mist sentence states the consequence —
              permanence is the fact the user is confirming, not a scare line */}
          <p className="text-sm leading-relaxed text-mist">
            {t('gallery.deleteConfirm.description')}
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setIsDeleteConfirmOpen(false)}
            >
              {t('gallery.deleteConfirm.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setIsDeleteConfirmOpen(false)
                deleteMutation.mutate(generation.id)
              }}
            >
              {t('gallery.deleteConfirm.confirm')}
            </Button>
          </div>
        </div>
      </Modal>

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

type DeleteButtonProps = {
  // Disables the button and swaps the icon for a spinner while deleting
  isPending: boolean
  // Opens the confirmation alertdialog — the mutation itself only fires there
  onDelete: () => void
}

// Destructive action as a quiet ICON button in the glow-red icon accent
// (stage 3 — design.md §2 files #ff2056 under "icons/status only"): a red
// PILL on every figure shouted destructiveness across the whole grid, while
// the icon keeps delete findable but proportionate. The aria-label preserves
// the exact accessible name the old pill had; 40px hit area per the a11y law.
function DeleteButton({ isPending, onDelete }: DeleteButtonProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={isPending}
      aria-busy={isPending || undefined}
      aria-label={t('gallery.delete')}
      className="flex size-10 items-center justify-center rounded-full text-glow-red transition-colors duration-200 hover:bg-ridge focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? (
        // Same spinner anatomy as Button's — the button announces aria-busy
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        // Inline currentColor trash glyph — never an OS emoji (closed triad)
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="M6 7l1 13h10l1-13" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      )}
    </button>
  )
}
