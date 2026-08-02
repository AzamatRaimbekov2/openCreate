// apps/web/src/modules/Gallery/components/GenerationDetail.tsx
// THE VIEWER for a succeeded generation: a full-screen sheet split into a media
// STAGE and an information COLUMN, with every action behind one ⋯ menu.
//
// v2 (2026-08-02, owner request "модалка на весь экран … удобная и красивая",
// plus "блок с информацией промта и модели"). What the lg sheet got wrong:
//  · a 9:16 clip in a max-w-5xl / max-h-[70dvh] box still played small, with
//    the sheet's own padding eating the little height it had;
//  · the meta line said "35 credits · 31 Jul" and nothing else — not WHICH
//    MODEL made it, which is the single fact a user comparing providers came
//    for, and the prompt sat in the same 14px mist as the timestamp;
//  · the actions were an icon rail directly under the media, so Delete — the
//    one irreversible action here — was a stray click away from the artwork.
//
// The layout is a two-pane grid, not a stack: at ≥lg the stage takes the room
// and the column is a fixed 22rem of text beside it. Below lg they stack and
// the whole sheet scrolls, because a 380px-wide split is two unusable columns.
//
// The STAGE is deliberately dumb: one `well` plate, `object-contain`, media
// centred. A video here KEEPS its native `controls` — the poster plate in the
// grid dropped them precisely so that playing a clip means opening this view,
// and this is where the player belongs.
//
// Actions come from useGenerationActions — the same list the card's overflow
// menu renders. Neither view owns the rules.
import { useTranslation } from 'react-i18next'
import type { Generation } from '@opencreate/contracts'
import { Badge, Card, Menu, Modal } from 'shared/ui'
import type { MenuItem } from 'shared/ui'
import type { GalleryModelOption } from './GalleryFilterBar'
import { DotsIcon } from './icons'
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
  // The catalog's id→name pairs, injected by the route. Gallery must not import
  // the Generator's catalog query (cross-module law), so the ROUTE — which
  // already holds the catalog for the composer and the filter bar — hands the
  // names down. Absent (or the model retired) → the raw id is shown: a model
  // that no longer exists is still the honest answer to "what made this".
  models?: GalleryModelOption[]
}

// One fact of the information column: a label above its value. A <dl> would be
// the semantic choice for the pair, and it IS what this renders — the component
// only exists so the six rows cannot drift apart in spacing or type scale.
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-mist-dim">{label}</dt>
      {/* tabular-nums: the values are mostly numerals (cost, duration, dates)
          and a proportional mono digit set makes a stacked list look jittery */}
      <dd className="text-sm text-white tabular-nums">{value}</dd>
    </div>
  )
}

export function GenerationDetail({
  generation,
  isOpen,
  onClose,
  onRegenerate,
  models,
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
  // The catalog name when the route handed one down, the id otherwise
  const modelName =
    models?.find((model) => model.id === generation.modelId)?.name ?? generation.modelId

  const handleAction = (item: MenuItem) => {
    item.onSelect()
    // Editing fills the composer behind this dialog — staying open would hide
    // the very input the user now wants. Delete only OPENS a confirmation, so it
    // must NOT close here; download leaves the user looking at their work.
    if (item.id === 'regenerate') onClose()
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('gallery.detail.title')}
        size="full"
        surface="glass"
        hideHeader
      >
        {/* THE CHROME CLUSTER, and why it is absolutely positioned rather than
            living in the column below. The sheet's close button is drawn by
            Modal itself at `top-6 right-6`, floating over the content. The ⋯
            first sat in the information column's header row, which put two
            identical 40px circles side by side with ZERO gap and a 4px
            vertical offset — measured in the running app, and exactly the
            "кривая вёрстка" the owner reported. Anchoring the ⋯ to the SAME
            corner at the SAME `top-6` makes them one cluster: aligned to the
            pixel, 8px apart (24 + 40 = 64px is where the close button ends,
            so 4.5rem is the first offset that clears it by the §13.1 minimum).
            The panel is `relative`, so this hangs off the sheet, not off the
            scrolling column — chrome must not scroll away with the text. */}
        <div className="absolute top-6 right-[4.5rem] z-10">
          <Menu
            label={t('gallery.actions.label')}
            // The shared list, wrapped one level so this view can add its own
            // "…and then close the sheet" rule without the action set learning
            // that a viewer exists
            items={actions.map((action) => ({
              ...action,
              onSelect: () => handleAction(action),
            }))}
            triggerClassName="flex size-10 items-center justify-center rounded-full border border-white/10 bg-void/60 text-mist-dim backdrop-blur transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            <DotsIcon />
          </Menu>
        </div>

        {/* min-h-0 on the flex child is the half that does the work: the sheet
            is a fixed-height flex column, and without it this grid refuses to
            shrink below its content, so the stage would push the sheet's
            bottom past the viewport (design.md §6 Modal law). */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_22rem] lg:overflow-hidden">
          {mediaUrl ? (
            // The media stage: a recessed step BELOW the frosted sheet holding
            // it — the sheet floats, the user's work is sunk into it.
            // object-contain, never object-cover: this view exists to show the
            // honest full frame the square card had to crop. Everything passed
            // through className is layout; the surface is Card's to own.
            <Card
              surface="well"
              padding="none"
              className="flex min-h-0 items-center justify-center overflow-hidden"
            >
              {generation.type === 'video' ? (
                // `controls` lives HERE, not on the grid plate: this is the
                // screen where a clip is meant to be watched, and the native
                // bar is the right control set at full size. autoPlay is safe
                // under the browsers' autoplay policy — opening this sheet took
                // a click, which is the user activation they ask for; if a
                // policy still refuses, the controls are right there.
                <video
                  controls
                  autoPlay
                  src={mediaUrl}
                  aria-label={generation.prompt}
                  className="max-h-full w-auto max-w-full"
                />
              ) : (
                <img
                  src={mediaUrl}
                  alt={generation.prompt}
                  className="max-h-full w-auto max-w-full object-contain"
                />
              )}
            </Card>
          ) : null}

          {/* The information column. It owns its OWN scroller at ≥lg (the grid
              above stops scrolling there) because the prompt may be 2000
              characters: the text scrolls, the media never moves. The right
              gutter is wider than the left (`lg:pr-3 lg:pl-1`) so the text has
              breathing room against the sheet's edge; the header row adds
              `lg:pr-28` to stay clear of the floating ⋯ / ✕ cluster above it —
              on a stacked layout the cluster sits over the MEDIA instead, so
              the clearance is only bought where it is needed. */}
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-1 lg:pt-6 lg:pr-3 lg:pl-1">
            <div className="flex flex-col items-start gap-2 lg:pr-28">
              <h2 className="text-sm font-normal text-mist-dim">{t('gallery.detail.info')}</h2>
              {/* Status said in a word, never by color alone (a11y §8).
                  It used to be hardcoded to "ready" — true while this sheet only
                  opened for succeeded generations, and a flat contradiction now
                  that a FAILED card opens it to reach the provider response. */}
              {generation.status === 'failed' ? (
                <Badge variant="danger">{t('gallery.failed')}</Badge>
              ) : (
                <Badge variant="success">{t('gallery.ready')}</Badge>
              )}
            </div>

            {/* THE FAILURE DETAIL, and the reason a failed card is clickable at
                all. The provider's own words used to render inline on the grid
                tile, where one long message ("DeepInfra request failed: TypeError
                (UND_ERR_HEADERS_TIMEOUT)") stretched its row and knocked every
                neighbouring card out of alignment. They belong here: this sheet
                scrolls, a grid cell does not.

                A safety block is the ONE exception — moderation strings are not
                user copy at any depth (recorded review decision 2026-07-07), so
                the localized reason on the card is all there is to say. */}
            {generation.status === 'failed' &&
            generation.errorMessage &&
            generation.errorCode !== 'content_blocked' ? (
              <Card surface="well" padding="md" className="shrink-0">
                <p className="text-xs text-mist-dim">{t('gallery.detail.errorDetail')}</p>
                {/* break-words + font-mono: provider text is machine output —
                    unbroken tokens, error codes and occasionally a URL. */}
                <p className="mt-1 font-mono text-xs leading-relaxed break-words text-mist-dim">
                  {generation.errorMessage}
                </p>
              </Card>
            ) : null}

            {/* The prompt block: the one long-form field, so it gets a plate of
                its own rather than being another <dl> row. Reading back what
                you asked for is why most people open this view at all. */}
            <Card surface="well" padding="md" className="shrink-0">
              <p className="text-xs text-mist-dim">{t('gallery.detail.prompt')}</p>
              {/* break-words: a pasted prompt can carry a 300-character URL,
                  which would otherwise widen the column past the sheet */}
              <p className="mt-1 text-sm leading-relaxed break-words text-mist">
                {generation.prompt}
              </p>
            </Card>

            <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-3">
              <InfoRow label={t('gallery.detail.model')} value={modelName} />
              <InfoRow label={t('gallery.detail.type')} value={t(`generator.type.${generation.type}`)} />
              {generation.params.aspectRatio ? (
                <InfoRow
                  label={t('gallery.detail.aspect')}
                  value={generation.params.aspectRatio}
                />
              ) : null}
              {generation.params.duration ? (
                <InfoRow
                  label={t('gallery.detail.duration')}
                  value={t('gallery.seconds', { value: generation.params.duration })}
                />
              ) : null}
              <InfoRow
                label={t('gallery.detail.cost')}
                value={t('gallery.cost', { count: generation.costCredits })}
              />
              {/* The timestamp is the one value that does not fit a 160px
                  half-column ("31 июл. 2026 г., 17:25" wrapped mid-date), so it
                  takes the full row instead of wrapping under its own label */}
              <div className="col-span-2">
                <InfoRow label={t('gallery.detail.created')} value={createdAt} />
              </div>
            </dl>
          </div>
        </div>
      </Modal>
      {/* Rendered OUTSIDE the Modal above: two nested dialogs would have their
          focus traps fighting over Tab. Both portal to <body> anyway. */}
      {confirmDialog}
    </>
  )
}
