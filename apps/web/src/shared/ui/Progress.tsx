// apps/web/src/shared/ui/Progress.tsx
// Determinate progress bar (video generation %). Editorial treatment: a thin
// square-ended rule — vermillion fill (progress IS an active state, the
// sanctioned accent use) advancing over a hairline ink track.
import { useTranslation } from 'react-i18next'

export type ProgressProps = {
  // Completion percentage 0–100 (clamped and rounded defensively)
  value: number
  // Accessible name; falls back to the localized "Loading"
  label?: string | undefined
}

export function Progress({ value, label }: ProgressProps) {
  const { t } = useTranslation()
  const clamped = Math.min(100, Math.max(0, Math.round(value)))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label ?? t('common.loading')}
      // Square ends (no rounding) — the bar reads as a printed rule, not a pill
      className="h-1.5 w-full overflow-hidden bg-ink/10"
    >
      <div
        className="h-full bg-vermillion transition-[width] duration-200"
        // Documented exception to the no-inline-styles rule (design.md §9):
        // a runtime-computed width cannot be a static Tailwind utility
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
