// apps/web/src/shared/ui/Select.tsx
// Labelled native select in the editorial "hairline underline" style — same
// contract and field voice as Input (uppercase micro-label, transparent body,
// vermillion focus rule; RHF register() spreads in via ref-as-prop).
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
      {/* Same editorial field voice as Input: uppercase micro-label over a
          hairline-underlined control (CSS-only transform — accessible name
          and getByLabelText queries stay unchanged) */}
      <label
        htmlFor={selectId}
        className="text-[11px] font-medium tracking-[0.18em] text-ink-soft uppercase"
      >
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`min-h-10 border-0 border-b bg-transparent px-0.5 py-2 text-base text-ink transition-colors duration-200 focus-visible:border-vermillion focus-visible:shadow-[0_1px_0_0_var(--color-vermillion)] focus-visible:outline-none ${
          error ? 'border-danger' : 'border-ink/30'
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
        <span id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </span>
      ) : null}
    </div>
  )
}
