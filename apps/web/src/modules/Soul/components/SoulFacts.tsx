// apps/web/src/modules/Soul/components/SoulFacts.tsx
// "Its characteristics" — the readable half of the soul card, and the reason the
// spec is stored as STRUCTURE rather than prose. Because we kept the ids, we can
// print «Существо · Комикс · Рога» instead of showing the user 400 characters of
// English fragment soup they never wrote.
//
// The VALUES come from the contract tables (already Russian, like STYLE_PRESETS —
// they are data, not app copy). Only the AXIS NAMES are ours, and those go
// through i18n like every other string this app writes.
import { useTranslation } from 'react-i18next'
import type { Soul } from '@opencreate/contracts'
import { Badge, Card } from 'shared/ui'
import { soulFacts, soulTraitLabels } from '../model/soulPresentation'

export type SoulFactsProps = {
  // The stored spec — a soul-built character always has one
  soul: Soul
}

export function SoulFacts({ soul }: SoulFactsProps) {
  const { t } = useTranslation()
  const facts = soulFacts(soul)
  const traits = soulTraitLabels(soul)
  const notes = soul.notes.trim()

  return (
    <Card surface="glass" padding="lg" title={t('soul.card.facts')}>
      <div className="flex flex-col gap-5">
        {/* A definition list, not a table: these are name/value pairs, and a
            screen reader should read them as such */}
        <dl className="flex flex-col divide-y divide-white/10">
          {facts.map((fact) => (
            <div key={fact.axis} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-xs text-mist-dim">{t(`soul.field.${fact.axis}`)}</dt>
              <dd className="text-sm text-white">{fact.value}</dd>
            </div>
          ))}
        </dl>

        {traits.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-mist-dim">{t('soul.field.traits')}</span>
            <ul className="flex flex-wrap gap-1.5">
              {traits.map((label) => (
                <li key={label}>
                  <Badge variant="accent">{label}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* The escape hatch, shown verbatim — it is appended to the prompt verbatim */}
        {notes ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-mist-dim">{t('soul.constructor.notes')}</span>
            <p className="text-sm leading-relaxed text-mist">{notes}</p>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
