// apps/web/src/shared/ui/Select.tsx
// Labelled native select (v3 terminal) — same contract and field treatment as
// Input (lowercase mono caption, steel filled body, 8px radius, portal focus;
// RHF register() spreads in via ref-as-prop).
import { useId } from 'react'
import type { ComponentPropsWithRef } from 'react'

export type SelectOption = {
  // Submitted value
  value: string
  // Visible, localized option label
  label: string
}

export type SelectProps = {
  // Visible field label
  label: string
  // Options rendered as native <option> elements
  options: SelectOption[]
  // Validation message (see Input.tsx for the `| undefined` rationale)
  error?: string | undefined
} & ComponentPropsWithRef<'select'>

export function Select({ label, options, error, id, className = '', ...rest }: SelectProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  const errorId = `${selectId}-error`
  return (
    <div className="flex flex-col gap-1.5">
      {/* Same quiet mono caption as Input — the terminal field voice */}
      <label htmlFor={selectId} className="text-xs text-mist-dim">
        {label}
      </label>
      {/* Steel filled control, 8px radius — identical surface recipe to Input
          so forms read as one system; the native picker is kept on purpose */}
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`min-h-10 rounded-lg border bg-steel px-3 py-2 text-base text-mist transition-colors duration-200 focus-visible:border-portal focus-visible:outline-none ${
          error ? 'border-glow-red' : 'border-white/10'
        } ${className}`}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span id={errorId} role="alert" className="text-sm text-glow-red">
          {error}
        </span>
      ) : null}
    </div>
  )
}
