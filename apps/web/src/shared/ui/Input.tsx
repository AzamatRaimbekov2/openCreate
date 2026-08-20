// apps/web/src/shared/ui/Input.tsx
// Labelled text input (v3 terminal): a filled field on the steel surface with
// an 8px radius — elevation by surface step, not by outline drama. The label
// is a quiet mono caption (lowercase — the terminal voice never shouts).
// Accepts a ref through props (React 19) so react-hook-form's register()
// spreads straight in.
import { useId } from 'react'
import type { ComponentPropsWithRef } from 'react'

export type InputProps = {
  // Visible field label — fields are never placeholder-only
  label: string
  // Keep the label in the accessibility tree but off the screen. ONLY for a
  // dense data grid, where the column header already names the field visually
  // and repeating it in forty cells is noise a screen reader also has to hear
  // forty times. It is not a way to ship a placeholder-only field: the label
  // still exists, is still required, and still names the control.
  labelHidden?: boolean
  // Validation message; `| undefined` keeps RHF's `errors.x?.message` assignable
  // under exactOptionalPropertyTypes
  error?: string | undefined
} & ComponentPropsWithRef<'input'>

export function Input({
  label,
  labelHidden = false,
  error,
  id,
  className = '',
  ...rest
}: InputProps) {
  // Stable generated id so label/error wiring works without callers passing one
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`
  return (
    <div className="flex flex-col gap-1.5">
      {/* Mono caption label — 12px dimmed mist; no uppercase transform (v3
          kills the editorial tracking/uppercase voice), so the accessible
          name / getByLabelText queries stay the raw i18n string as before */}
      <label htmlFor={inputId} className={labelHidden ? 'sr-only' : 'text-xs text-mist-dim'}>
        {label}
      </label>
      {/* Steel field: bg one surface step above the void, 8px radius, hairline
          white/10 border. Focus swaps the hairline for portal blue — the only
          chromatic prose accent. Error keeps the glow-red border: failure and
          focus must never share a color. */}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`min-h-10 rounded-lg border bg-steel px-3 py-2 text-base text-mist transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none ${
          error ? 'border-glow-red' : 'border-white/10'
        } ${className}`}
        {...rest}
      />
      {error ? (
        // role=alert announces validation immediately to screen readers
        <span id={errorId} role="alert" className="text-sm text-glow-red">
          {error}
        </span>
      ) : null}
    </div>
  )
}
