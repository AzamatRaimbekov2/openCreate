// apps/web/src/shared/ui/PillGroup.tsx
// Segmented pill selector: a labelled group of toggle buttons where exactly
// one value is selected (aria-pressed). Promoted to shared/ui because two
// modules need it (Generator: type/aspect/duration; Gallery: filter chips) —
// see docs/frontend/design.md §5/§9 governance.

export type PillOption<T extends string | number> = {
  // Typed value reported through onChange
  value: T
  // Visible, localized pill label
  label: string
}

export type PillGroupProps<T extends string | number> = {
  // Accessible group name (also announced by screen readers)
  label: string
  // Pills in display order
  options: PillOption<T>[]
  // Currently selected value; undefined = nothing selected yet
  value: T | undefined
  // Called with the clicked pill's value
  onChange: (value: T) => void
}

export function PillGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: PillGroupProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      {/* Visible caption in the editorial micro-label voice (uppercase is
          CSS-only; the group's accessible name uses the raw label text) */}
      <span
        aria-hidden="true"
        className="text-[11px] font-medium tracking-[0.18em] text-ink-soft uppercase"
      >
        {label}
      </span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = option.value === value
          return (
            // Editorial toggle pills: the selection is "printed" solid ink —
            // unselected pills are hairline outlines that solidify on hover.
            // No tinted-wash selection: state must be unmistakable at a glance.
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(option.value)}
              className={`min-h-10 rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none ${
                isSelected
                  ? 'border-ink bg-ink text-cream'
                  : 'border-ink/20 bg-transparent text-ink hover:border-ink'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
