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
    // Terminal toggle: a white/10 hairline pill; the active locale is a RIDGE
    // surface step with white text — a lit segment, not a solid brand fill
    // (v3 bans opaque fills; the surface ladder carries the state instead)
    <div
      role="group"
      aria-label={t('nav.language')}
      className="flex items-center gap-0.5 rounded-full border border-white/10 p-0.5"
    >
      {LANGUAGES.map((language) => {
        const isActive = language.value === active
        return (
          <button
            key={language.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => setLanguage(language.value)}
            className={`min-h-7 rounded-full px-2.5 text-xs font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
              isActive ? 'bg-ridge text-white' : 'text-mist-dim hover:text-mist'
            }`}
          >
            {language.label}
          </button>
        )
      })}
    </div>
  )
}
