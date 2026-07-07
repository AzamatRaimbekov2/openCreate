// apps/web/src/modules/Landing/components/FaqClaims.tsx
// The claims FAQ — exactly the three honest topics the copy rules allow:
// credits never expire (+ no subscription required), what a credit is, and
// which models are behind the product. v3 Stage 2: PROSE DIRECTLY ON THE VOID
// — no cards, no hairline rows, no disclosure widgets; question in white mono,
// answer in dimmed mist right under it, like Q&A notes in a research doc.
import { useTranslation } from 'react-i18next'
import { SectionHeading } from './SectionHeading'

// Item ids double as i18n key segments: landing.faq.items.<id>.*
const ITEMS = ['expire', 'credit', 'models'] as const

export function FaqClaims() {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading title={t('landing.faq.title')} />
      <ul className="flex flex-col gap-7">
        {ITEMS.map((item) => (
          // Q&A as plain prose: the question is a white body-size h3 (color
          // carries hierarchy, not size/weight), the answer sits directly
          // beneath on the void — three short answers never earned boxes
          <li key={item} className="flex flex-col gap-1.5">
            <h3 className="text-base leading-6 font-normal text-white">
              {t(`landing.faq.items.${item}.q`)}
            </h3>
            <p className="max-w-prose text-sm text-mist-dim">{t(`landing.faq.items.${item}.a`)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
