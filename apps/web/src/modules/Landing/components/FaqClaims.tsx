// apps/web/src/modules/Landing/components/FaqClaims.tsx
// The claims FAQ — exactly the three honest topics the copy rules allow:
// credits never expire (+ no subscription required), what a credit is, and
// which models are behind the product. Clean hairline rows (serif question,
// quiet answer) instead of the v1 boxy cards: three short answers don't earn
// a disclosure widget, and the editorial page needs rules, not boxes.
import { useTranslation } from 'react-i18next'
import { SectionHeading } from './SectionHeading'

// Item ids double as i18n key segments: landing.faq.items.<id>.*
const ITEMS = ['expire', 'credit', 'models'] as const

export function FaqClaims() {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading ordinal="04" title={t('landing.faq.title')} />
      <ul className="flex flex-col">
        {ITEMS.map((item) => (
          // Q&A row on a hairline — question in the display serif, answer in
          // the quiet grotesk; SectionHeading draws the rule above row one
          <li
            key={item}
            className="grid gap-x-8 gap-y-2 border-b border-ink/15 py-7 md:grid-cols-12 md:items-baseline"
          >
            <h3 className="font-display text-xl font-semibold tracking-tight text-ink md:col-span-5 md:text-2xl">
              {t(`landing.faq.items.${item}.q`)}
            </h3>
            <p className="text-base text-ink-soft md:col-span-7">
              {t(`landing.faq.items.${item}.a`)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
