// apps/web/src/shared/ui/Badge.tsx
// Small status pill. Status is never color-only — the badge text carries the
// meaning; color reinforces it (a11y rule, docs/frontend/design.md §7).
import type { ReactNode } from 'react'

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'danger'

export type BadgeProps = {
  // Localized badge text, e.g. "credits refunded"
  children: ReactNode
  // neutral = meta info, accent = tier/selection, success = positive, danger = failure
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-ink/5 text-ink-soft',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
}

export function Badge({ children, variant = 'neutral' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  )
}
