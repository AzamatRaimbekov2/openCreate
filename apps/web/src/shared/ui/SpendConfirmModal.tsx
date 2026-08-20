// apps/web/src/modules/Assets3D/components/SpendConfirmModal.tsx
// The ONE blocking spend primitive the two paid stages share (design.md §9).
//
// It exists because a credit is not undoable. Every other confirmation in the
// app can be reversed by doing the thing again; this one cannot, so the number
// is said TWICE — once on the button the user aimed at, once here, in a dialog
// they have to answer. The dialog is `alertdialog`, not `dialog`: it interrupts
// deliberately, and a screen reader should say so.
//
// It owns no copy. Extraction and meshing say different things about different
// sums, so the caller passes its own already-localized title/description/confirm
// label — this component only guarantees the SHAPE of the moment: restated cost,
// a cancel that costs nothing, and a confirm that is DISABLED while the price is
// unknown (a `null` price is not a price, and a dialog is the last place to
// invent one).
import { useTranslation } from 'react-i18next'
import { Button, Modal } from 'shared/ui'

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
  onCancel,
  onConfirm,
}: SpendConfirmModalProps) {
  const { t } = useTranslation()
  return (
    <Modal isOpen={isOpen} onClose={onCancel} role="alertdialog" title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-mist">{description}</p>
        <div className="flex items-center justify-end gap-3">
          {/* Cancel is the quiet one: backing out of a spend is never the
              action the design should be nudging toward or away from */}
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={credits === null}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
