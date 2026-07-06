// apps/web/src/shared/ui/Progress.tsx
// Determinate progress bar (video generation %). Accent fill on a quiet track.
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
      className="h-2 w-full overflow-hidden rounded-full bg-ink/10"
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-150"
        // Documented exception to the no-inline-styles rule (design.md §9):
        // a runtime-computed width cannot be a static Tailwind utility
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
