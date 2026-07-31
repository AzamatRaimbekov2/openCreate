// apps/web/src/modules/Gallery/components/GenerationDetail.tsx
// Detail view for a succeeded generation: the media at full size on a glass
// sheet, the prompt and meta beneath it, and the action set as an icon rail.
//
// THE BUG THIS FIXES: the old sheet was `max-w-lg` with a plain `<img className=
// "w-full">`. A 9:16 portrait therefore rendered ~512px wide and ~910px tall —
// taller than most viewports, with no scroll, so its bottom was simply gone.
// Now the media box is height-capped (max-h-[70dvh]) and the image is
// object-contain inside it: the whole frame always fits, letterboxed on the
// abyss well, whatever its aspect ratio.
//
// Actions come from useGenerationActions — the same list the card's overflow
// menu renders, painted here as icons. Neither view owns the rules.
import { useTranslation } from 'react-i18next'
import type { Generation } from '@opencreate/contracts'
import { Card, Modal } from 'shared/ui'
import type { MenuItem } from 'shared/ui'
import { useGenerationActions } from './useGenerationActions'

export type GenerationDetailProps = {
  // The generation to present — callers only open it for succeeded items
  generation: Generation
  // Controlled visibility
  isOpen: boolean
  // Called on Escape, overlay click, and the close button
  onClose: () => void
  // Refill the composer from this generation (see useGenerationActions)
  onRegenerate?: (generation: Generation) => void
}

export function GenerationDetail({
  generation,
  isOpen,
  onClose,
  onRegenerate,
}: GenerationDetailProps) {
  const { t, i18n } = useTranslation()
  // exactOptionalPropertyTypes: passing `onRegenerate: undefined` is not the
  // same as omitting the key, so spread it conditionally
  const { actions, confirmDialog } = useGenerationActions({
    generation,
    ...(onRegenerate ? { onRegenerate } : {}),
  })

  const mediaUrl = generation.mediaUrls[0]
  // Locale-aware timestamp — follows the active language, not the browser
  const createdAt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(generation.createdAt))

  const handleAction = (item: MenuItem) => {
    item.onSelect()
    // Regenerating fills the composer behind this dialog — staying open would
    // hide the very input the user now wants. Delete only OPENS a confirmation,
    // so it must NOT close here; download leaves the user looking at their work.
    if (item.id === 'regenerate') onClose()
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('gallery.detail.title')}
        size="lg"
        surface="glass"
        hideHeader
      >
        {/* `overflow-y-auto` completes the pair this body already had half of
            (design.md §6 Modal law). The MEDIA is bounded — max-h-[70dvh] shrinks
            it with the viewport — but the PROMPT below is not: contracts allow
            2000 characters, which wraps to more height than the panel has left,
            and without the scroller that pushes the action rail past the bottom
            while the wheel scrolls the page behind the overlay. The actions scroll
            WITH the content here rather than being pinned: this is a read-mostly
            detail sheet (the Templates canon), not a form with one outcome. */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {mediaUrl ? (
            // The media well: a height-capped box on the recessed abyss step,
            // one surface step BELOW the glass sheet holding it — the frosted
            // sheet floats, the user's work is sunk into it. object-contain
            // (never object-cover): this view exists to show the honest full
            // frame the square card had to crop. Everything passed through
            // className here is layout (sizing, centering, clipping); the
            // surface itself is Card's to own.
            <Card
              surface="well"
              padding="none"
              className="flex max-h-[70dvh] min-h-0 items-center justify-center overflow-hidden"
            >
              {generation.type === 'video' ? (
                <video controls src={mediaUrl} className="max-h-[70dvh] w-auto max-w-full" />
              ) : (
                <img
                  src={mediaUrl}
                  alt={generation.prompt}
                  className="max-h-[70dvh] w-auto max-w-full object-contain"
                />
              )}
            </Card>
          ) : null}

          {/* Prompt + meta on the left, the icon rail on the right — the caption
              row is where a user reads what they made and then acts on it */}
          <div className="flex items-start justify-between gap-4 px-1">
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-mist">{generation.prompt}</p>
              <p className="mt-1 text-xs text-mist-dim">
                {t('gallery.cost', { count: generation.costCredits })} · {createdAt}
              </p>
            </div>

            {/* Icon rail. Each button carries its label as the accessible name
                AND a native tooltip — an icon-only control with no name is
                unusable by screen reader and unguessable by everyone else. */}
            <div className="flex shrink-0 items-center gap-1">
              {actions
                .filter((action) => action.isAvailable !== false)
                .map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => handleAction(action)}
                    aria-label={action.label}
                    title={action.label}
                    className={`flex size-10 items-center justify-center rounded-full border border-white/10 transition-colors duration-200 hover:bg-ridge focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
                      action.variant === 'danger'
                        ? 'text-glow-red'
                        : 'text-mist-dim hover:text-white'
                    }`}
                  >
                    {action.icon}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </Modal>
      {/* Rendered OUTSIDE the Modal above: two nested dialogs would have their
          focus traps fighting over Tab. Both portal to <body> anyway. */}
      {confirmDialog}
    </>
  )
}
