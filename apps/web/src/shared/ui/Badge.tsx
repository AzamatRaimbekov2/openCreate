// apps/web/src/shared/ui/Badge.tsx
// Stamp-style status badge ("Light Editorial"): an uppercase, letter-spaced
// hairline-outlined rectangle — reads like an ink stamp on paper, replacing
// the v1 tinted pill. Status is never color-only — the badge text carries the
// meaning; color reinforces it (a11y rule, docs/frontend/design.md §7).
import type { ReactNode } from 'react'

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'danger'

export type BadgeProps = {
  // Localized badge text, e.g. "credits refunded"
  children: ReactNode
  // neutral = meta info, accent = tier/selection, success = positive, danger = failure
  variant?: BadgeVariant
}

// Outline (not fill) carries the variant — a stamp is a border and lettering,
// never a solid chip. The accent stamp is one of the few sanctioned vermillion
// text uses (brief: "small stamps/badges"; noted in design.md contrast rules).
const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'border-ink/30 text-ink-soft',
  accent: 'border-vermillion/70 text-vermillion',
  success: 'border-success/60 text-success',
  danger: 'border-danger/60 text-danger',
}

export function Badge({ children, variant = 'neutral' }: BadgeProps) {
  return (
    // Uppercase via CSS only — DOM text (and i18n strings queried by tests)
    // stays untouched. rounded-[3px] keeps corners stamp-crisp, not pill-soft.
    <span
      className={`inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[11px] font-medium tracking-[0.14em] uppercase ${variantClasses[variant]}`}
    >
      {children}
    </span>
  )
}
