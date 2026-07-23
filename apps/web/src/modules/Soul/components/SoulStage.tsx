// apps/web/src/modules/Soul/components/SoulStage.tsx
// The studio's center STAGE: the live character, as far as it exists yet. There
// is no portrait to show — a face is minted LATER, on the soul card, for credits
// — so the honest "preview" of a not-yet-shot character is its STRUCTURE: the
// name, the picked axes and traits as chips, and the exact prompt the model will
// read (SoulPreview, composed by the contract functions).
//
// Two states, and only two, because the draft is CLIENT state (the 4-states rule
// governs SERVER data): an untouched draft shows a "start building" placeholder —
// honest, because there is nothing to preview yet — and the moment the user picks
// anything it becomes the live preview. That flip is why `isDraftPristine` is a
// field-by-field compare and not a fuzzy heuristic.
import { useTranslation } from 'react-i18next'
import { Badge, Card, EmptyState } from 'shared/ui'
import { isDraftPristine } from '../model/soulDraft'
import type { SoulDraft } from '../model/soulDraft'
import { soulFacts, soulTraitLabels } from '../model/soulPresentation'
import { SoulPreview } from './SoulPreview'

export type SoulStageProps = {
  // The live draft — the stage is a pure function of it
  draft: SoulDraft
}

export function SoulStage({ draft }: SoulStageProps) {
  const { t } = useTranslation()

  // Untouched: invite the user to start, don't preview a default character they
  // never chose (showing "a woman, Disney style" before any pick would be a lie
  // dressed as a preview).
  if (isDraftPristine(draft)) {
    return (
      <EmptyState
        title={t('soul.stage.empty.title')}
        description={t('soul.stage.empty.description')}
      />
    )
  }

  // Contract LABELS, not fragments — the human-readable summary of the same
  // character the prompt below spells out for the model.
  const facts = soulFacts(draft.soul)
  const traits = soulTraitLabels(draft.soul)
  const name = draft.name.trim()

  return (
    <Card surface="glass" padding="lg">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          {/* The character's name, or an honest placeholder until it is given one */}
          <h2 className="text-3xl font-normal text-white">
            {name || <span className="text-mist-dim">{t('soul.stage.unnamed')}</span>}
          </h2>
          {/* The picked axes as neutral value chips with the traits in the amber
              selection tint — one glance-readable line of who this character is */}
          <ul className="flex flex-wrap gap-1.5">
            {facts.map((fact) => (
              <li key={fact.axis}>
                <Badge>{fact.value}</Badge>
              </li>
            ))}
            {traits.map((label) => (
              <li key={label}>
                <Badge variant="accent">{label}</Badge>
              </li>
            ))}
          </ul>
        </div>

        {/* The exact prompt the portrait mint will submit — the whole studio rests
            on this being the real thing, so it is the SAME well the constructor
            shows, composed by the same contract functions and never re-typed. */}
        <SoulPreview soul={draft.soul} />
      </div>
    </Card>
  )
}
