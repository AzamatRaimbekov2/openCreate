// apps/web/src/shared/ui/Input.tsx
// Labelled text input in the editorial "hairline underline" style: no box, a
// single rule under the text that thickens/recolors on focus — form fields
// read like lines on a printed form. Accepts a ref through props (React 19)
// so react-hook-form's register() spreads straight in.
import { useId } from 'react'
import type { ComponentPropsWithRef } from 'react'

export type InputProps = {
  // Visible field label — fields are never placeholder-only
  label: string
  // Validation message; `| undefined` keeps RHF's `errors.x?.message` assignable
  // under exactOptionalPropertyTypes
  error?: string | undefined
} & ComponentPropsWithRef<'input'>

export function Input({ label, error, id, className = '', ...rest }: InputProps) {
  // Stable generated id so label/error wiring works without callers passing one
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`
  return (
    <div className="flex flex-col gap-1.5">
      {/* Uppercase micro-label — the editorial form voice (tracking-[0.18em]
          at 11px reads as print marginalia). text-transform is CSS-only, so
          the accessible name / getByLabelText queries stay unchanged. */}
      <label
        htmlFor={inputId}
        className="text-[11px] font-medium tracking-[0.18em] text-ink-soft uppercase"
      >
        {label}
      </label>
      {/* Hairline underline field: transparent body, 1px rule that turns
          vermillion + visually 2px on focus (the extra px comes from a
          box-shadow so the layout never shifts). Error keeps the danger rule
          — never the accent, failure and accent must not share a color. */}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`min-h-10 border-0 border-b bg-transparent px-0.5 py-2 text-base text-ink transition-colors duration-200 placeholder:text-ink-soft/50 focus-visible:border-vermillion focus-visible:shadow-[0_1px_0_0_var(--color-vermillion)] focus-visible:outline-none ${
          error ? 'border-danger' : 'border-ink/30'
        } ${className}`}
        {...rest}
      />
      {error ? (
        // role=alert announces validation immediately to screen readers
        <span id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </span>
      ) : null}
    </div>
  )
}
