# LangSwitch.tsx — AI component doc

> AI-facing sidecar for `LangSwitch.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Compact EN/RU language toggle for the "Paper & Ink" kit — the only UI surface
that switches the app locale, always through `setLanguage` from
`shared/config/i18n` so persistence and `<html lang>` sync stay in one place.

## What it does (for an AI reader)
- Responsibilities: render one `aria-pressed` toggle pill per supported locale
  (`en`, `ru`) inside a labelled `role="group"`; report clicks to `setLanguage`.
- Public API / exports / props / endpoints: `LangSwitch` (no props).
- Inputs → Outputs: `i18n.resolvedLanguage` (anything not `ru` counts as `en`,
  mirroring `fallbackLng`) → pill group JSX with the active pill highlighted.
- Side effects (I/O, network, state): none of its own — `setLanguage` performs
  the localStorage write + i18next `changeLanguage`; re-render arrives via
  react-i18next's language-change signal.

## Dependencies
- Imports / depends on: `react-i18next` (`useTranslation`), `shared/config/i18n` (`setLanguage`).
- Used by: `shared/ui/AppShell.tsx` (header) and `modules/Landing` landing top
  bar — the 2+ consumers that justified promotion to `shared/ui` (design.md §9).

## Diagram
```mermaid
flowchart LR
  AppShell[AppShell header] --> LS[LangSwitch.tsx]
  Landing[Landing top bar] --> LS
  LS -- "setLanguage('en'|'ru')" --> I18N[shared/config/i18n]
  I18N -- languageChanged --> LS
  I18N -- persists --> Store[(localStorage oc-lang)]
```

## Key decisions / gotchas
- Stateless by design: the active pill derives from `i18n.resolvedLanguage`, so
  a language change made anywhere else keeps every LangSwitch instance in sync.
- The e2e contract (plan Task 21) clicks this switch on the LANDING page — that
  is why it lives in `shared/ui`, not inside AppShell.
- v2 editorial restyle: hairline `border-ink/20` pill container (transparent —
  sits on the cream, no white chip); the ACTIVE locale is a solid ink mini-pill
  (`bg-ink text-cream`) instead of a tinted wash — unmistakable state + AA
  contrast at 12px. `aria-pressed`/labels unchanged.

## Commits
- 01c29ab 2026-07-06 feat(web): app shell with nav, balance, language switch
- (pending) restyle(web): editorial design system — tokens, fonts, ui kit
