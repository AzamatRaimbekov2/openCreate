// apps/web/src/shared/ui/EmptyState.tsx
// Empty-state placeholder (4-states rule: a data surface with no items must
// explain itself and offer a next action — never a blank screen).
import type { ReactNode } from 'react'

export type EmptyStateProps = {
  // Optional decorative visual (icon/illustration)
  icon?: ReactNode
  // What is empty, e.g. "No generations yet"
  title: string
  // Optional hint about how the state changes
  description?: string | undefined
  // Optional call to action (usually a Button or Link)
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    // Editorial empty state: a hairline-ruled frame on the cream canvas (no
    // raised white card — empty space IS the paper) with a serif headline.
    <div className="flex flex-col items-center gap-3 border border-ink/15 px-6 py-16 text-center">
      {icon ? (
        <div aria-hidden="true" className="text-3xl text-ink-soft/80">
          {icon}
        </div>
      ) : null}
      {/* Serif display voice — even "nothing here" is typeset deliberately */}
      <h3 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h3>
      {description ? <p className="max-w-md text-sm text-ink-soft">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
