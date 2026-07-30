// apps/web/src/modules/Canvas/components/RunBranchDialog.tsx
// The confirm gate for a branch run (ADR canvas-mode D5: "spend stays explicit").
//
// A branch can charge for several generations from ONE click, which is exactly why
// it is the only action on the board that interrupts: the user sees every run that
// is about to happen, what model does it, what each costs, and the total — then
// answers. `alertdialog`, like the Assets3D spend gate, because a credit is not
// undoable and a screen reader should say the moment is blocking.
//
// It renders a PLAN, it does not build one: planning is pure (`buildBranchPlan`),
// so this component has no idea about graphs, statuses or the catalog. A plan that
// cannot run arrives as `ok: false` and the dialog states the reason INSTEAD of a
// run button — a disabled button with no explanation is a dead end.
import { useTranslation } from 'react-i18next'
import { Button, Modal } from 'shared/ui'
import type { BranchPlan } from '../model/useRunBranch'

export type RunBranchDialogProps = {
  isOpen: boolean
  // The plan to confirm, blockers included
  plan: BranchPlan
  // Escape / overlay / cancel — closes without spending anything
  onClose: () => void
  // Fires ONLY from the confirm pill; the caller closes and then runs
  onConfirm: () => void
}

export function RunBranchDialog({ isOpen, plan, onClose, onConfirm }: RunBranchDialogProps) {
  const { t } = useTranslation()

  return (
    <Modal isOpen={isOpen} onClose={onClose} role="alertdialog" title={t('canvas.runBranch.title')}>
      <div className="flex flex-col gap-4">
        {plan.ok ? (
          <>
            <p className="text-sm text-mist">{t('canvas.runBranch.lead')}</p>
            {/* An ordered list, because the ORDER is part of what is being
                confirmed: these runs happen one after another, and a mid-branch
                failure stops the rest. */}
            <ol className="flex flex-col divide-y divide-white/10 rounded-lg border border-white/10">
              {plan.items.map((item, index) => (
                <li
                  key={item.nodeId}
                  className="flex items-center gap-3 px-3 py-2 text-xs text-mist"
                >
                  <span className="w-4 shrink-0 text-mist-dim">{index + 1}</span>
                  <span className="shrink-0 text-white">{t(`canvas.kind.${item.kind}`)}</span>
                  {/* The model is what actually spends the credits, so it is named
                      — a row that says only "Image · 8 cr" hides the choice. */}
                  <span className="min-w-0 flex-1 truncate text-mist-dim">
                    {item.modelName ?? t('canvas.node.modelPlaceholder')}
                  </span>
                  <span className="shrink-0 font-medium text-glow-green">
                    {item.credits === null
                      ? '—'
                      : t('generator.model.creditsShort', { credits: item.credits })}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex items-center justify-between text-sm">
              <span className="text-mist-dim">{t('canvas.runBranch.total')}</span>
              <span className="font-medium text-glow-green">
                {plan.total === null
                  ? '—'
                  : t('generator.model.creditsShort', { credits: plan.total })}
              </span>
            </div>
          </>
        ) : (
          // Blocked: name the obstacle. `role="status"` rather than alert — the
          // dialog itself is the interruption; this line is just its content.
          <p role="status" className="text-sm text-mist">
            {t(`canvas.runBranch.blocked.${plan.reason}`)}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          {/* Backing out of a spend is never the action to nudge toward or away
              from — same reasoning as SpendConfirmModal's quiet cancel. */}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {plan.ok ? (
            <Button onClick={onConfirm} disabled={plan.total === null}>
              {/* The number is said again ON the button the click is aimed at.
                  Without a total there is no honest label, so the pill falls back
                  to the plain CTA and is disabled. */}
              {plan.total === null
                ? t('canvas.runBranch.cta')
                : t('canvas.runBranch.confirm', { credits: plan.total })}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
