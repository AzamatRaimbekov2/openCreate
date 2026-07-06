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
    <div
      role="group"
      aria-label={t('nav.language')}
      className="flex items-center gap-1 rounded-xl border border-ink/15 bg-white p-1"
    >
      {LANGUAGES.map((language) => {
        const isActive = language.value === active
        return (
          <button
            key={language.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => setLanguage(language.value)}
            className={`min-h-8 rounded-lg px-2 text-xs font-medium transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
              isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {language.label}
          </button>
        )
      })}
    </div>
  )
}
