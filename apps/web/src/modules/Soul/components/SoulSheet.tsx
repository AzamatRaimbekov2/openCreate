// apps/web/src/modules/Soul/components/SoulSheet.tsx
// The reference sheet: four views of the same person, and the priced buttons that
// mint them. This is the only surface in Soul Studio that spends money, so it
// carries the whole cost UX:
//
//   · THE PRICE IS ON THE BUTTON, before the click, read off the live catalog
//     (portraitSheet.priceViews) — 2 credits while the character has no photo,
//     8 per view once it does, because the later views must self-reference the
//     first one on flux-kontext-pro or the sheet is four different strangers.
//   · NOTHING SPENDS IN ONE CLICK. Every mint goes through an alertdialog that
//     states the number again (design.md §9, the destructive-confirm pattern).
//   · THE HERO AND THE REST ARE TWO SEPARATE ACTS. 2 credits, then 24 — never one
//     26-credit button, because the first portrait is also the DECISION about who
//     this character is, and the user should be allowed to hate it cheaply.
//   · A FAILED VIEW IS SHOWN. The API reports views individually (a sheet is N
//     paid jobs); collapsing them into one error would hide which of the four the
//     user actually got, and the refund note would have nothing to sit next to.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PORTRAIT_SHEET_VIEWS, PORTRAIT_VIEWS } from '@opencreate/contracts'
import type { ApiErrorCode, CatalogModel, Entity, PortraitView } from '@opencreate/contracts'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { Badge, Button, Card, Modal, Skeleton } from 'shared/ui'
import { useMintPortraits } from '../model/soulApi'
import { hasPrimaryPhoto, missingViews, priceViews, sheetSlots } from '../model/portraitSheet'

export type SoulSheetProps = {
  // The character whose sheet this is (its images ARE the sheet)
  entity: Entity
  // The live catalog — the source of the two prices. Empty while it loads: the
  // buttons then show a skeleton price and stay disabled rather than guess.
  models: CatalogModel[]
}

// The hero view: the one rendered with no reference, which every later view then
// references. Read from the contract array, not written as 'front'.
const HERO_VIEW = PORTRAIT_SHEET_VIEWS[0]

export function SoulSheet({ entity, models }: SoulSheetProps) {
  const { t } = useTranslation()
  const mintMutation = useMintPortraits()
  // The views the user has asked for but not yet paid for — the confirm dialog is
  // open exactly while this is non-null
  const [pendingViews, setPendingViews] = useState<PortraitView[] | null>(null)
  // The views currently being rendered upstream. Separate from `pendingViews` on
  // purpose: confirming CLOSES the dialog and moves the work onto the plates, so
  // the user watches the sheet fill in rather than a spinner in a modal.
  const [mintingViews, setMintingViews] = useState<PortraitView[]>([])

  const slots = sheetSlots(entity)
  const hasPhoto = hasPrimaryPhoto(entity)
  const missing = missingViews(entity)
  const pendingPrice = pendingViews === null ? null : priceViews(pendingViews, hasPhoto, models)

  // Per-view outcomes of the LAST mint, keyed by view. A view that failed was
  // already refunded by the generation service — we only have to say so.
  //
  // The API reports a machine-readable `errorCode`, not prose, which is exactly
  // what lets us print OUR localized sentence (errorCopy) instead of a provider's
  // English error message under a Russian heading.
  const failures = new Map<PortraitView, ApiErrorCode>()
  for (const portrait of mintMutation.data?.portraits ?? []) {
    // The narrowing IS the proof — no cast, so a nullable code cannot slip into
    // the map and become the string "null" on screen
    if (portrait.errorCode !== null) failures.set(portrait.view, portrait.errorCode)
  }

  // A whole-call failure (insufficient credits, a 500) — never the raw text
  const callError =
    mintMutation.error instanceof ApiClientError
      ? t(errorCodeMessageKey(mintMutation.error.code))
      : mintMutation.isError
        ? t('errors.actionFailed')
        : null

  const confirmMint = () => {
    if (pendingViews === null) return
    const views = pendingViews
    // Close first: the money is committed, and the interesting thing to watch is
    // the sheet, not a spinner on a dialog the user has already answered
    setPendingViews(null)
    setMintingViews(views)
    mintMutation.mutate({ id: entity.id, views }, { onSettled: () => setMintingViews([]) })
  }

  return (
    <Card surface="glass" padding="lg" title={t('soul.sheet.title')}>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {slots.map((slot) => {
            const failure = failures.get(slot.view)
            return (
              <div key={slot.view} className="flex flex-col gap-2">
                {/* A portrait is CONTENT: a recessed well plate, never a frosted
                    card laid over the face the user paid for */}
                <Card surface="well" padding="none" className="overflow-hidden">
                  <div className="flex aspect-square w-full items-center justify-center">
                    {slot.image ? (
                      <img
                        src={slot.image.url}
                        alt={`${entity.name} — ${PORTRAIT_VIEWS[slot.view].label}`}
                        className="size-full object-cover"
                      />
                    ) : mintingViews.includes(slot.view) ? (
                      // Only the plates actually being paid for pulse — a sheet
                      // where all four blink would hide which views were bought
                      <Skeleton className="size-full rounded-none" />
                    ) : (
                      <span className="px-2 text-center text-xs text-mist-dim">
                        {t('soul.sheet.empty')}
                      </span>
                    )}
                  </div>
                </Card>

                {/* View labels are contract data (PORTRAIT_VIEWS), already Russian */}
                <p data-testid="sheet-view-label" className="text-xs text-mist-dim">
                  {PORTRAIT_VIEWS[slot.view].label}
                </p>

                {failure !== undefined ? (
                  <div className="flex flex-col gap-1">
                    {/* The localized primary reason; the provider's own words, if
                        any, are not repeated — a refunded failure is our problem
                        to explain, not the user's to decode */}
                    <p role="alert" className="text-xs text-glow-red">
                      {t(errorCodeMessageKey(failure))}
                    </p>
                    <span>
                      <Badge variant="success">{t('soul.sheet.refunded')}</Badge>
                    </span>
                  </div>
                ) : null}

                {/* Per-view actions only exist once a photo does: without one there
                    is no reference, so the only legal next act is the hero shot */}
                {hasPhoto ? (
                  <Button
                    variant="ghost"
                    onClick={() => setPendingViews([slot.view])}
                    disabled={mintMutation.isPending}
                  >
                    {slot.image ? t('soul.sheet.reroll') : t('soul.sheet.create')}
                  </Button>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* The model rule, said out loud: the first photo is cheap and free-standing,
            the rest are expensive because they must look like it */}
        <p className="text-xs text-mist-dim">{t('soul.sheet.hint')}</p>

        {callError ? (
          <p
            role="alert"
            className="rounded-lg border-l-2 border-glow-red bg-steel px-3 py-2 text-sm text-mist"
          >
            {callError}
          </p>
        ) : null}

        <SheetAction
          hasPhoto={hasPhoto}
          missing={missing}
          models={models}
          isBusy={mintMutation.isPending}
          onRequest={setPendingViews}
        />
      </div>

      {/* Money is never spent by a single click (design.md §9) */}
      <Modal
        isOpen={pendingViews !== null}
        onClose={() => setPendingViews(null)}
        role="alertdialog"
        title={t('soul.sheet.confirm.title')}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-mist">
            {t('soul.sheet.confirm.description', {
              views: pendingViews?.length ?? 0,
              credits: pendingPrice ?? 0,
            })}
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setPendingViews(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={confirmMint} disabled={pendingPrice === null}>
              {t('soul.sheet.confirm.submit', { credits: pendingPrice ?? 0 })}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

type SheetActionProps = {
  hasPhoto: boolean
  missing: PortraitView[]
  models: CatalogModel[]
  isBusy: boolean
  onRequest: (views: PortraitView[]) => void
}

// The one primary action, whichever it currently is: the hero shot, the rest of
// the sheet, or nothing at all (a complete sheet needs no button — the per-view
// re-roll pills are still there).
function SheetAction({ hasPhoto, missing, models, isBusy, onRequest }: SheetActionProps) {
  const { t } = useTranslation()

  if (!hasPhoto) {
    const credits = priceViews([HERO_VIEW], false, models)
    return (
      <div className="flex items-center justify-end">
        <Button onClick={() => onRequest([HERO_VIEW])} disabled={credits === null || isBusy}>
          {t('soul.sheet.hero')} · <PriceTag credits={credits} />
        </Button>
      </div>
    )
  }

  if (missing.length === 0) return null

  const credits = priceViews(missing, true, models)
  return (
    <div className="flex items-center justify-end">
      <Button onClick={() => onRequest(missing)} disabled={credits === null || isBusy}>
        {t('soul.sheet.rest')} · <PriceTag credits={credits} />
      </Button>
    </div>
  )
}

// A price that is not known yet is not a price. While the catalog is in flight the
// button shows a pulse instead of a number, and is disabled — quoting "0 cr" or
// a hardcoded 2 would be the one lie this screen cannot afford.
function PriceTag({ credits }: { credits: number | null }) {
  const { t } = useTranslation()
  if (credits === null) return <Skeleton className="h-3 w-10" />
  return <span>{t('soul.price', { credits })}</span>
}
