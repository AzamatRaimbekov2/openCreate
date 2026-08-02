// apps/web/src/modules/Gallery/components/GenerationCard.tsx
// One generation as a FIGURE: a SQUARE plate carries the media, the prompt is
// a quiet mono caption below it, and the actions ride the plate's corner.
//
// v4 SURFACE CHOICE — why the plate is a `well` and NOT the default frosted
// glass: a thumbnail in a grid IS the content. Frosting a card around a photo
// adds a lit edge, a blur and a drop shadow to something the eye is trying to
// read as an image — chrome competing with the hero. `surface="well"` is the
// recessed step media sits INSIDE (the same fog-bordered tile language as the
// landing's specimen grid), and `padding="none"` lets the frame reach the edge.
// Glass belongs to chrome that floats OVER media (the composer, a modal), not
// to the media itself.
// Live states (the list's Empty state is the grid's): processing →
// stepped-pulse tile + Progress + mono percent, with two honest sub-states —
// stalled (20-min polling budget spent: amber note + manual refresh) and
// poll-error (the status GET failed: ErrorState + retry); succeeded → an image
// or a video POSTER (both open the full-screen detail viewer — see the video
// branch below for why the inline player was retired);
// failed → glow-red hairline tile, failure reason, "credits refunded" chip.
// Status triad (design.md v3 §2): processing=amber, succeeded=green,
// failed=red. Delete is a glow-red ICON button (#ff2056 = the sparing
// icon-accent rule) — destructive intent without a loud pill on every figure.
// A paid generation never dies in one click: the icon only opens a blocking
// confirmation alertdialog; the optimistic mutation fires on explicit confirm.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Generation } from '@opencreate/contracts'
import { Badge, Button, Card, ErrorState, Menu, Progress } from 'shared/ui'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { useLiveGeneration } from '../model/generationsApi'
import type { GalleryModelOption } from './GalleryFilterBar'
import { GenerationDetail } from './GenerationDetail'
import { DotsIcon, PlayIcon } from './icons'
import { useGenerationActions } from './useGenerationActions'

export type GenerationCardProps = {
  // List item from the ['generations'] cache — the card keeps it live itself
  generation: Generation
  // Refill the composer from this generation. Injected by the route (Gallery
  // must not import the Generator's draft store); absent on /library, where the
  // Edit action then simply does not appear.
  onRegenerate?: (generation: Generation) => void
  // The catalog's id→name pairs, injected by the route (Gallery must not import
  // the Generator's catalog query). Only the detail viewer reads them, to name
  // the model that made this; absent → it prints the raw id instead.
  models?: GalleryModelOption[]
}

export function GenerationCard({ generation: seed, onRegenerate, models }: GenerationCardProps) {
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
                like every gallery plate, so the grid never jumps between states.
                NOT a Card: `animate-skeleton` walks background-color, and a well
                would pin that fill to abyss and kill the pulse. It only borrows
                the well's radius so the silhouette survives the state change. */}
            <div
              aria-hidden="true"
              className="aspect-square w-full animate-skeleton rounded-2xl bg-abyss"
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
            // THE VIDEO PLATE IS A POSTER, NOT A PLAYER (owner request,
            // 2026-08-02: "карточку видео сделай красивее"). It used to mount
            // `<video controls>`, and that cost three things:
            //  · the browser's own control bar — a grey OS-painted strip with
            //    its own font and hit targets — sat across the bottom of every
            //    clip, the one piece of chrome in the grid the design system
            //    does not own;
            //  · a video element with controls swallows the click, so the clip
            //    was the ONLY card that could not be opened. Watching a 9:16
            //    clip meant watching it letterboxed inside a 300px square;
            //  · `controls` is a focus stop, so Tab walked into the player's
            //    internals before reaching the card's own actions.
            // Now the plate behaves exactly like an image plate: preload
            // 'metadata' paints the first frame, the whole tile is one button
            // into the full-screen viewer, and playback happens THERE.
            <Card
              surface="well"
              padding="none"
              className="overflow-hidden transition-transform duration-200 motion-safe:hover:-translate-y-0.5"
            >
              <button
                type="button"
                onClick={() => setIsDetailOpen(true)}
                // The prompt is the plate's accessible name, exactly as the
                // image branch takes it from the <img alt>
                aria-label={generation.prompt}
                className="group/plate relative block w-full focus-visible:ring-2 focus-visible:ring-portal focus-visible:ring-inset focus-visible:outline-none"
              >
                {/* object-cover crops the poster to the square tile — the
                    honest full frame is one click away, the same bargain the
                    image plate has always made. pointer-events-none keeps the
                    element from eating the button's click in browsers that
                    still route pointer events to a controls-less video. */}
                <video
                  // `#t=0.1` is the poster: a media FRAGMENT telling the
                  // browser to seek 100ms in and paint that frame. Without it
                  // `preload="metadata"` fetches the dimensions and duration
                  // but leaves the element BLACK in Chrome (verified in the
                  // real app) — a wall of black squares with play buttons is
                  // exactly the grid this change set out to fix. 0.1s rather
                  // than 0: many encoders open on a black lead frame.
                  src={`${mediaUrl}#t=0.1`}
                  preload="metadata"
                  muted
                  playsInline
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none aspect-square w-full object-cover"
                />
                {/* The play affordance: without it a still first frame is
                    indistinguishable from an image. A void/60 disc rather than
                    a bare glyph, so it survives a bright frame; it brightens on
                    hover so the plate answers the cursor. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <span className="flex size-14 items-center justify-center rounded-full border border-white/15 bg-void/60 text-white backdrop-blur transition-colors duration-200 group-hover/plate:bg-void/80">
                    <PlayIcon className="size-6 translate-x-0.5" />
                  </span>
                </span>
                {/* Duration as a quiet corner chip — the one fact that decides
                    whether a clip is worth opening, and the grid should not
                    require a hover to give it up */}
                {generation.params.duration ? (
                  <span className="absolute bottom-2 left-2 rounded-full border border-white/10 bg-void/70 px-2 py-0.5 text-xs text-mist backdrop-blur">
                    {t('gallery.seconds', { value: generation.params.duration })}
                  </span>
                ) : null}
              </button>
            </Card>
          ) : (
            // Images enlarge in the detail modal. The BUTTON lives inside the
            // well rather than around it: a <button> may only contain phrasing
            // content, so wrapping the Card's <div> in it would be invalid HTML.
            // Consequences of that ordering, both deliberate:
            //  · the lift hover rides the plate (motion-safe only) — it makes
            //    the tile FELT as interactive without a shadow
            //  · the focus ring is INSET, because overflow-hidden would clip a
            //    ring drawn outside the button's border box
            <Card
              surface="well"
              padding="none"
              className="overflow-hidden transition-transform duration-200 motion-safe:hover:-translate-y-0.5"
            >
              <button
                type="button"
                onClick={() => setIsDetailOpen(true)}
                className="block w-full focus-visible:ring-2 focus-visible:ring-portal focus-visible:ring-inset focus-visible:outline-none"
              >
                {/* object-cover crops to the square tile — honest full frame is
                    one click away in the detail modal */}
                <img
                  src={mediaUrl}
                  alt={generation.prompt}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </button>
            </Card>
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
              the user wants to copy or re-run after a safety block.

              DELIBERATELY NOT a Card: the border color here is STATUS, and Card
              owns its hairline as part of the surface. Passing `border-glow-red`
              through Card's className would be surface styling through a
              layout-only escape hatch, and the winner of `border-white/10` vs
              `border-glow-red` would be decided by Tailwind's stylesheet order
              rather than by us. It borrows the well's radius and fill instead. */}
          <div className="group relative flex aspect-square w-full rounded-2xl border border-glow-red bg-abyss">
            {/* CLICKABLE, like a succeeded plate. The raw provider detail used to
                sit inline UNDER this tile, and one long message ("DeepInfra request
                failed: TypeError (UND_ERR_HEADERS_TIMEOUT)") stretched its grid row
                and knocked every neighbouring card out of alignment. The detail
                moved behind this click — which only works if the tile ANNOUNCES it
                opens, hence a real button with a label rather than a div+onClick.
                The overflow menu stays a SIBLING: nesting its trigger inside this
                button would be invalid HTML and every menu click would also open
                the viewer. */}
            <button
              type="button"
              onClick={() => setIsDetailOpen(true)}
              aria-label={t('gallery.detail.open')}
              className="flex w-full cursor-pointer items-center justify-center rounded-2xl transition-colors duration-200 hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              <span className="text-sm font-medium text-glow-red">{t('gallery.failed')}</span>
            </button>
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
          {/* The PRIMARY reason is always OUR copy, keyed by the machine-readable
              errorCode (errorCopy map; unknown/missing → generic) — raw server text
              never leads (QA finding 3, design.md §9).

              And on this tile it is now the ONLY line: our copy is one short
              sentence by construction, so every failed card occupies the same
              height. The provider's own words live in the detail viewer. */}
          <p className="text-xs text-mist">{t(errorCodeMessageKey(generation.errorCode))}</p>
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

      {/* FAILED joins succeeded here. It used to be succeeded-only, which was
          consistent while a failed tile had nothing more to show — but the raw
          provider message moved off the grid (it stretched rows), and the viewer
          is now the only place it exists. A card that opens nothing would make
          that message unreachable. Processing/queued stay out: there is genuinely
          nothing to view yet. */}
      {generation.status === 'succeeded' || generation.status === 'failed' ? (
        <GenerationDetail
          generation={generation}
          {...(onRegenerate ? { onRegenerate } : {})}
          {...(models ? { models } : {})}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />
      ) : null}
    </article>
  )
}
