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
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-white px-6 py-16 text-center">
      {icon ? (
        <div aria-hidden="true" className="text-4xl text-ink-soft">
          {icon}
        </div>
      ) : null}
      <h3 className="text-xl font-semibold text-ink">{title}</h3>
      {description ? <p className="max-w-md text-sm text-ink-soft">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
