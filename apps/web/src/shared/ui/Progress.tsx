// apps/web/src/shared/ui/Progress.tsx
// Determinate progress bar (video generation %). v3 terminal treatment: a
// FLAT glow-green fill advancing over the ridge surface step — success-color
// progress on the elevation track, no gradient, no shine, square ends.
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
      // Square ends (no rounding): v3 allows only pill and 8px radii, and a
      // 6px-tall rule earns neither — it reads as a terminal meter line
      className="h-1.5 w-full overflow-hidden bg-ridge"
    >
      <div
        className="h-full bg-glow-green transition-[width] duration-200"
        // Documented exception to the no-inline-styles rule (design.md §9):
        // a runtime-computed width cannot be a static Tailwind utility
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
