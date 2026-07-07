// apps/web/src/shared/ui/Badge.tsx
// Status badge (v3 terminal): a quiet MONO CAPTION CHIP — a small translucent
// pill with a white/10 hairline and lowercase 12px mono text. Status is never
// color-only — the badge text carries the meaning; color reinforces it via the
// triad glows (a11y rule, docs/frontend/design.md §7). Status mapping:
// processing = amber · succeeded/positive = green · failed/destructive = red.
import type { ReactNode } from 'react'

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'danger'

export type BadgeProps = {
  // Localized badge text, e.g. "credits refunded"
  children: ReactNode
  // neutral = meta info, accent = tier/selection (amber), success = positive (green), danger = failure (red)
  variant?: BadgeVariant
}

// Text color carries the variant over a shared translucent chip body — the
// closed triad's glow accents (green/amber/red) plus dimmed mist for neutral
// meta. No solid fills, no uppercase shouting: the chip is a caption, not a stamp.
const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'text-mist-dim',
  accent: 'text-glow-amber',
  success: 'text-glow-green',
  danger: 'text-glow-red',
}

export function Badge({ children, variant = 'neutral' }: BadgeProps) {
  return (
    // Pill silhouette (the only non-8px radius in v3) at caption size; the
    // white/5 wash + white/10 hairline reads on every surface step
    <span
      className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs ${variantClasses[variant]}`}
    >
      {children}
    </span>
  )
}
