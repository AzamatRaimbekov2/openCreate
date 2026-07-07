// apps/web/src/modules/Landing/components/HowItWorks.tsx
// The three-step product story (prompt → model → result) as numbered terminal
// rows (v3): portal-blue mono 01/02/03 ordinals over white/10 hairline rules.
// Semantics stay an ordered list — the steps ARE a sequence.
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
            className="grid gap-x-8 gap-y-2 border-b border-white/10 py-8 md:grid-cols-12 md:items-baseline"
          >
            {/* Portal mono ordinal — the prose accent marks the sequence
                (weight 400: numerals obey the weight ceiling too); the ol
                already conveys order to screen readers */}
            <span
              aria-hidden="true"
              className="text-2xl leading-none font-normal text-portal md:col-span-2 md:text-3xl"
            >
              {`0${index + 1}`}
            </span>
            <h3 className="text-2xl font-normal text-white md:col-span-4">
              {t(`landing.how.steps.${step}.title`)}
            </h3>
            <p className="text-base text-mist-dim md:col-span-6">
              {t(`landing.how.steps.${step}.description`)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
