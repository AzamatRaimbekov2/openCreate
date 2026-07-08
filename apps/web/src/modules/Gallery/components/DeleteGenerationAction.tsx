// apps/web/src/modules/Gallery/components/DeleteGenerationAction.tsx
// The delete affordance for one generation: a quiet glow-red ICON button that
// opens a blocking confirmation, and only then fires the optimistic mutation.
//
// WHY EXTRACTED: table rows and grid cards must delete IDENTICALLY. A paid
// generation never dies in one click — that invariant is enforced by the
// component, not by every caller remembering to wrap the icon in a dialog. Two
// copies of "icon → alertdialog → mutate" is two places for the confirmation to
// silently go missing.
//
// The icon accent (#ff2056) is design.md §2's "icons/status only" red: a red
// PILL on every figure shouted destructiveness across the whole grid, while the
// icon keeps delete findable but proportionate.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from 'shared/ui'
import { useDeleteGeneration } from '../model/generationsApi'

export type DeleteGenerationActionProps = {
  // Which generation the confirmed mutation removes
  generationId: string
}

export function DeleteGenerationAction({ generationId }: DeleteGenerationActionProps) {
  const { t } = useTranslation()
  // Destructive AND paid — the icon opens this confirmation first; the mutation
  // (and its optimistic cache removal) fires only on explicit confirm
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const deleteMutation = useDeleteGeneration()
  const isPending = deleteMutation.isPending

  return (
    <>
      <button
        type="button"
        onClick={() => setIsConfirmOpen(true)}
        disabled={isPending}
        aria-busy={isPending || undefined}
        aria-label={t('gallery.delete')}
        // 40px hit area per the a11y law, even though the glyph is 16px
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

      {/* Blocking confirmation (frontend-error-ux): Modal role="alertdialog" on
          the steel sheet; the danger specimen pill confirms, the ghost cancels.
          Closing first keeps the exchange snappy — the optimistic removal makes
          the item vanish right after. */}
      <Modal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
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
            <Button variant="ghost" onClick={() => setIsConfirmOpen(false)}>
              {t('gallery.deleteConfirm.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setIsConfirmOpen(false)
                deleteMutation.mutate(generationId)
              }}
            >
              {t('gallery.deleteConfirm.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
