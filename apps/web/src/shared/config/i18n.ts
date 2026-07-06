// apps/web/src/shared/config/i18n.ts
// i18next bootstrap (EN + RU). Every user-facing string in the app goes through
// translation keys defined in BOTH locales/en.json and locales/ru.json.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ru from './locales/ru.json'

// Language choice survives reloads; guarded so the module also loads outside a browser
const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('oc-lang') : null

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru } },
  lng: stored ?? 'en',
  fallbackLng: 'en',
  // React already escapes interpolated values — double-escaping would mangle text
  interpolation: { escapeValue: false },
})

// Single entry point for switching language (used by the app-shell lang switch)
export function setLanguage(lang: 'en' | 'ru') {
  localStorage.setItem('oc-lang', lang)
  void i18n.changeLanguage(lang)
}

export default i18n
