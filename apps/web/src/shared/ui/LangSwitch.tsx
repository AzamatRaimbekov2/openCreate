// apps/web/src/shared/ui/LangSwitch.tsx
// Compact EN/RU language toggle. Promoted to shared/ui because two surfaces
// need it (AppShell header and the standalone landing top bar) — design.md §9.
// Delegates to setLanguage (shared/config/i18n), the single switching entry.
import { useTranslation } from 'react-i18next'
import { setLanguage } from 'shared/config/i18n'

// Supported UI locales — must match the resources in shared/config/i18n
const LANGUAGES = [
  { value: 'en', label: 'EN' },
  { value: 'ru', label: 'RU' },
] as const

export function LangSwitch() {
  const { t, i18n } = useTranslation()
  // Anything that is not 'ru' falls back to 'en' — mirrors i18n fallbackLng
  const active = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'

  return (
    // Editorial toggle: a hairline pill on the cream canvas; the active locale
    // is a solid ink mini-pill ("printed"), never a tinted wash — high contrast
    // at this tiny size and unmistakable state
    <div
      role="group"
      aria-label={t('nav.language')}
      className="flex items-center gap-0.5 rounded-full border border-ink/20 p-0.5"
    >
      {LANGUAGES.map((language) => {
        const isActive = language.value === active
        return (
          <button
            key={language.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => setLanguage(language.value)}
            className={`min-h-7 rounded-full px-2.5 text-xs font-medium tracking-[0.08em] transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none ${
              isActive ? 'bg-ink text-cream' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {language.label}
          </button>
        )
      })}
    </div>
  )
}
