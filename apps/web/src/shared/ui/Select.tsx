// apps/web/src/shared/ui/Select.tsx
// The kit's labelled <select>. One component so every dropdown in the app —
// composer settings, gallery filters — shares a single set of classes; four
// hand-rolled copies of the same recipe is how a design system rots.
//
// WHY NATIVE: keyboard nav, type-ahead, mobile wheel pickers and screen-reader
// semantics arrive for free. A custom listbox is ~150 lines to reach parity and
// loses the OS-native popover, which stays readable over ANY backdrop — a real
// concern here, since these sit inside a translucent glass capsule.
//
// The `glass` variant drops the opaque fill so the capsule's frost shows
// through; the default keeps the steel surface step for solid backgrounds.
import { useId } from 'react'

export type SelectOption<T extends string> = {
  // Wire value; '' is conventionally the "any / unset" sentinel
  value: T
  // Visible text — the caller localizes it. A string, not ReactNode: <option>
  // renders text content only, and the OS draws the popover, not the DOM.
  label: string
}

export type SelectProps<T extends string> = {
  // Visible caption above the control (also the accessible name)
  label: string
  options: SelectOption<T>[]
  value: T
  onChange: (value: T) => void
  // 'glass' = translucent, for use inside the composer's frosted capsule
  variant?: 'solid' | 'glass'
}

const BASE =
  'min-h-8 rounded-full border px-2.5 text-xs text-mist transition-colors duration-200 focus-visible:border-portal focus-visible:outline-none'

// Solid keeps the steel surface step; glass lets the backdrop through and leans
// on the capsule's own blur for legibility
const VARIANT = {
  solid: 'border-white/10 bg-steel hover:border-white/25',
  glass: 'border-white/10 bg-white/5 hover:border-white/25',
} as const

export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = 'solid',
}: SelectProps<T>) {
  // Stable generated id wires label→select without the caller passing one
  const selectId = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={selectId} className="truncate text-[11px] leading-none text-mist-dim">
        {label}
      </label>
      <select
        id={selectId}
        value={value}
        // The cast is safe: every rendered option's value is a T by construction
        onChange={(event) => onChange(event.target.value as T)}
        className={`${BASE} ${VARIANT[variant]}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
