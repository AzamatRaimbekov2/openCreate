// apps/web/src/modules/Cinema/components/InspectorSection.tsx
// One labelled group inside the shot inspector. Before v4 the inspector was a
// single 247-line column of controls with nothing telling the eye where one
// concern ended and the next began — prompt, style, model, duration, transition
// and title all shared one flat stack. This is the divider.
//
// It is a real <fieldset>/<legend>, not a styled div: the controls inside are
// form controls, so the browser and every screen reader already know how to
// announce "Clip, group" before reading the model picker. Semantics we get for
// free are semantics we do not re-implement with ARIA.
import type { ReactNode } from 'react'

export type InspectorSectionProps = {
  // Visible group name — becomes the <legend>, i.e. the group's accessible name
  legend: string
  children: ReactNode
}

export function InspectorSection({ legend, children }: InspectorSectionProps) {
  return (
    // min-w-0: a fieldset defaults to min-content width, which would stop the
    // grid children inside from shrinking in the 380px inspector rail.
    <fieldset className="flex min-w-0 flex-col gap-2">
      {/* Caption weight, lowercase-calm — the same voice as a Card title */}
      <legend className="mb-1.5 text-xs text-mist-dim">{legend}</legend>
      {children}
    </fieldset>
  )
}
