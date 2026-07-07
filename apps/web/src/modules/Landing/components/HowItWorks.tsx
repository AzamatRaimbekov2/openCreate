// apps/web/src/modules/Landing/components/HowItWorks.tsx
// The three-step product story (prompt → model → result) as PLAIN MONO PROSE
// rows (v3 Stage 2): small portal ordinals in the margin, white step titles,
// dimmed descriptions — no hairline grid, no display-size numerals; the narrow
// research column reads like lab notes. Semantics stay an ordered list — the
// steps ARE a sequence.
import { useTranslation } from 'react-i18next'
import { SectionHeading } from './SectionHeading'

// Step ids double as i18n key segments: landing.how.steps.<id>.*
const STEPS = ['prompt', 'model', 'result'] as const

export function HowItWorks() {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading title={t('landing.how.title')} />
      <ol className="flex flex-col gap-7">
        {STEPS.map((step, index) => (
          // A prose row: margin ordinal / title / description. The ordinal is
          // derived from reading order but the KEY stays the step id —
          // index-as-key remains banned.
          <li key={step} className="grid grid-cols-[2.5rem_1fr] gap-x-3 gap-y-1.5">
            {/* Small portal mono ordinal — the prose accent marks the sequence
                (the ol already conveys order to screen readers, so decorative) */}
            <span aria-hidden="true" className="text-sm leading-6 text-portal">
              {`0${index + 1}`}
            </span>
            {/* Step title in white at body size: hierarchy comes from color,
                not size — the prose-row voice of the research column */}
            <h3 className="text-base leading-6 font-normal text-white">
              {t(`landing.how.steps.${step}.title`)}
            </h3>
            <p className="col-start-2 text-sm text-mist-dim">
              {t(`landing.how.steps.${step}.description`)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
