// apps/web/src/modules/Landing/components/HowItWorks.tsx
// The three-step product story (prompt → model → result) as numbered editorial
// rows: serif 01/02/03 ordinals over hairline rules instead of the v1 card
// grid. Semantics stay an ordered list — the steps ARE a sequence.
import { useTranslation } from 'react-i18next'
import { SectionHeading } from './SectionHeading'

// Step ids double as i18n key segments: landing.how.steps.<id>.*
const STEPS = ['prompt', 'model', 'result'] as const

export function HowItWorks() {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading ordinal="03" title={t('landing.how.title')} />
      <ol className="flex flex-col">
        {STEPS.map((step, index) => (
          // Row = hairline-separated grid line: ordinal / title / description.
          // SectionHeading already draws the rule above the first row.
          <li
            key={step}
            className="grid gap-x-8 gap-y-2 border-b border-ink/15 py-8 md:grid-cols-12 md:items-baseline"
          >
            {/* Serif vermillion ordinal — display-size accent (sanctioned
                ≥18px/bold use); the ol already conveys order to screen readers */}
            <span
              aria-hidden="true"
              className="font-display text-2xl leading-none font-semibold text-vermillion md:col-span-2 md:text-3xl"
            >
              {`0${index + 1}`}
            </span>
            <h3 className="font-display text-2xl font-semibold tracking-tight text-ink md:col-span-4">
              {t(`landing.how.steps.${step}.title`)}
            </h3>
            <p className="text-base text-ink-soft md:col-span-6">
              {t(`landing.how.steps.${step}.description`)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
