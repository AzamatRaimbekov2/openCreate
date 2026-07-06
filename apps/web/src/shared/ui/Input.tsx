// apps/web/src/shared/ui/Input.tsx
// Labelled text input with an accessible error message. Accepts a ref through
// props (React 19) so react-hook-form's register() spreads straight in.
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
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`min-h-10 rounded-xl border border-ink/15 bg-white px-3 py-2 text-ink placeholder:text-ink-soft/60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${className}`}
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
