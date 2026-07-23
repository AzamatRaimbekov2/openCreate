// apps/web/src/modules/Assets3D/components/WizardStageNav.tsx
// The five-step rail across the top of the wizard. Two jobs, and it is worth
// being explicit that they are different:
//
//   1. ORIENTATION — the wizard is stage-shaped, so the user never navigates
//      "to" a stage in the URL sense; the rail is the only thing that tells them
//      where they are in a five-act process and how much is left.
//   2. BACK-NAV — a COMPLETED stage stays reachable (rename a part after
//      extracting it, re-roll one mesh), which writes `stageOverride` in the
//      wizard store. Stages AHEAD of the derived one are disabled, because the
//      work that would fill them has not happened yet — a user who could click
//      into "Assembly" with nothing meshed would meet an empty screen and read
//      it as a bug.
//
// Steps are buttons, not links: the stage is derived state, not a route, so a
// link would promise a URL that does not exist.
import { useTranslation } from 'react-i18next'
import type { WizardStage } from '../model/wizardStage'

// Flow order — the same order deriveStage walks. Also the numbering the user sees.
const STAGES: WizardStage[] = ['upload', 'parts', 'extract', 'mesh', 'assembly']

export type WizardStageNavProps = {
  // The stage currently on screen (already the override, if one is set)
  active: WizardStage
  // The furthest stage the asset's real state has reached — the boundary between
  // "reachable history" and "not yet earned". Passed separately from `active` so
  // walking BACK does not lock the user out of walking forward again.
  reached: WizardStage
  // Navigate to a completed stage (writes stageOverride)
  onSelect: (stage: WizardStage) => void
}

export function WizardStageNav({ active, reached, onSelect }: WizardStageNavProps) {
  const { t } = useTranslation()
  const reachedIndex = STAGES.indexOf(reached)

  return (
    <nav aria-label={t('assets3d.stage.nav')}>
      <ol className="flex flex-wrap items-center gap-2">
        {STAGES.map((stage, index) => {
          const isActive = stage === active
          // Everything up to and including the reached stage is real history
          const isReachable = index <= reachedIndex

          return (
            <li key={stage}>
              <button
                type="button"
                onClick={() => onSelect(stage)}
                disabled={!isReachable}
                // aria-current carries "you are here" for screen readers; the
                // amber tint only reinforces it (status is never color-only)
                aria-current={isActive ? 'step' : undefined}
                className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:opacity-40 ${
                  isActive
                    ? 'border-white/10 bg-specimen-amber/20 text-lumen-amber shadow-pill'
                    : 'border-white/10 text-mist-dim enabled:hover:bg-ridge enabled:hover:text-white'
                }`}
              >
                {/* Decorative ordinal — the label carries the meaning, and the
                    portal blue is the sanctioned color for sequence marks */}
                <span aria-hidden="true" className="text-portal">
                  {index + 1}
                </span>
                {t(`assets3d.stage.${stage}`)}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
