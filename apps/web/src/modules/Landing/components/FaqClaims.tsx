// apps/web/src/modules/Landing/components/FaqClaims.tsx
// The claims FAQ — exactly the three honest topics the copy rules allow:
// credits never expire (+ no subscription required), what a credit is, and
// which models are behind the product. Plain stacked Q&A (h3 + p): three
// short answers don't earn a disclosure widget.
import { useTranslation } from 'react-i18next'

// Item ids double as i18n key segments: landing.faq.items.<id>.*
const ITEMS = ['expire', 'credit', 'models'] as const

export function FaqClaims() {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-ink">{t('landing.faq.title')}</h2>
      <ul className="flex flex-col gap-4">
        {ITEMS.map((item) => (
          <li
            key={item}
            className="flex flex-col gap-1 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm"
          >
            <h3 className="text-base font-semibold text-ink">
              {t(`landing.faq.items.${item}.q`)}
            </h3>
            <p className="text-sm text-ink-soft">{t(`landing.faq.items.${item}.a`)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
