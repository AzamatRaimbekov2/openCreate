// apps/web/src/shared/ui/Select.tsx
// Labelled native select with an accessible error message — same contract as
// Input (RHF register() spreads in via ref-as-prop).
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
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`min-h-10 rounded-xl border border-ink/15 bg-white px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${className}`}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </span>
      ) : null}
    </div>
  )
}
