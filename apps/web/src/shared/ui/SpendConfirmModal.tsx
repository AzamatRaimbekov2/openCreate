// apps/web/src/shared/ui/SpendConfirmModal.tsx
// The ONE blocking spend primitive in the app (design.md §9).
//
// It exists because a credit is not undoable. Every other confirmation in the
// app can be reversed by doing the thing again; this one cannot, so the number
// is said TWICE — once on the button the user aimed at, once here, in a dialog
// they have to answer. The dialog is `alertdialog`, not `dialog`: it interrupts
// deliberately, and a screen reader should say so.
//
// It owns almost no copy. Extraction, meshing and a shorts batch say different
// things about different sums, so the caller passes its own already-localized
// title/description/confirm label — this component only guarantees the SHAPE of
// the moment: restated cost, a cancel that costs nothing, and a confirm that is
// DISABLED while the price is unknown (a `null` price is not a price, and a
// dialog is the last place to invent one).
//
// IT LIVES IN shared/ui, not in a module (moved 2026-08-20, ADR shorts-studio).
// It began inside Assets3D because that was the only paid batch surface. The
// Shorts Studio batch is the second, and a module may not import another
// module's internals — so rather than a second copy of the app's most
// safety-critical dialog, the primitive moved to the kit. There is exactly one
// place where "is this affordable?" is answered, and it is below.
//
// TWO THINGS IT DECIDES ITSELF, because every caller must decide them the same
// way (ADR shorts-studio §4 — this is the feature's safety mechanism):
//   · `credits === null` disables the confirm. Unknown price, no spend.
//   · `balance` short of `credits` disables the confirm AND states the shortfall.
//     A dialog that lets you confirm a purchase you cannot afford just moves the
//     failure to the first item of a forty-item batch.
// `balance` is optional and `undefined` disables nothing: a slow /api/me must
// never make the product look like it is out of stock (TierPicker's rule).
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Modal } from './Modal'

export type SpendConfirmModalProps = {
  // The dialog is open exactly while the caller has a pending spend
  isOpen: boolean
  // Localized heading, e.g. "Extract these parts?"
  title: string
  // Localized body — it MUST restate the credit number (that is the whole point)
  description: string
  // Localized confirm-pill label, price included
  confirmLabel: string
  // The sum about to be charged; null = not priceable → the confirm is disabled
  credits: number | null
  // The caller's credit balance, or undefined while it loads. When known it is
  // shown, and a shortfall both states itself and disables the confirm.
  balance?: number | undefined
  // Optional itemisation rendered between the description and the actions — the
  // "rows × beats × per-clip" breakdown a batch owes the user. The caller brings
  // its own copy; this component never invents a row.
  children?: ReactNode
  // Dismiss without spending (Escape, overlay, cancel pill)
  onCancel: () => void
  // Fires ONLY from the confirm pill. Callers close first, then mutate.
  onConfirm: () => void
}

export function SpendConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel,
  credits,
  balance,
  children,
  onCancel,
  onConfirm,
}: SpendConfirmModalProps) {
  const { t } = useTranslation()
  // A shortfall needs BOTH numbers to exist. Unknown price → already blocked
  // above; unknown balance → we say nothing rather than guess.
  const shortfall = credits !== null && balance !== undefined ? credits - balance : 0
  const isShort = shortfall > 0

  return (
    <Modal isOpen={isOpen} onClose={onCancel} role="alertdialog" title={title}>
      {/* The BODY scrolls, the actions do not (design.md §6 Modal law). A batch
          itemisation is unbounded — forty rows would otherwise push the confirm
          past the panel bottom, which on a spend gate is the worst version of
          the bug: the control the user must reach goes out of reach. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        <p className="text-sm text-mist">{description}</p>
        {children}
        {balance === undefined ? null : (
          <div className="flex flex-col gap-1 border-t border-white/10 pt-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-mist-dim">{t('spend.balance')}</span>
              <span className="text-mist tabular-nums">
                {t('spend.credits', { count: balance })}
              </span>
            </div>
            {isShort ? (
              // role="status", not alert: the dialog IS the interruption; this
              // line is its content, and an alert inside an alertdialog is noise.
              <div role="status" className="flex items-center justify-between">
                <span className="text-glow-red">{t('spend.shortfall')}</span>
                <span className="text-glow-red tabular-nums">
                  {t('spend.credits', { count: shortfall })}
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-4 shrink-0 border-t border-white/10 pt-4">
        <div className="flex items-center justify-end gap-3">
          {/* Cancel is the quiet one: backing out of a spend is never the
              action the design should be nudging toward or away from */}
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={credits === null || isShort}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
