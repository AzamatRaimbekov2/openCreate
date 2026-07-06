// apps/web/src/modules/Landing/components/HowItWorks.tsx
// The three-step product story (prompt → model → result) as an ordered list —
// semantics match the meaning: the steps ARE a sequence.
import { useTranslation } from 'react-i18next'

// Step ids double as i18n key segments: landing.how.steps.<id>.*
const STEPS = ['prompt', 'model', 'result'] as const

export function HowItWorks() {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-ink">{t('landing.how.title')}</h2>
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step}
            className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm"
          >
            {/* Visible ordinal — the ol already conveys order to screen readers */}
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
            >
              {index + 1}
            </span>
            <h3 className="text-base font-semibold text-ink">
              {t(`landing.how.steps.${step}.title`)}
            </h3>
            <p className="text-sm text-ink-soft">{t(`landing.how.steps.${step}.description`)}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
