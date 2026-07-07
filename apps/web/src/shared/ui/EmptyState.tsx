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
    // Terminal empty state: a white/10 hairline frame directly on the void
    // (prose sits on the void, not in cards — reference law) with an 8px radius
    <div className="flex flex-col items-center gap-3 rounded-lg border border-white/10 px-6 py-16 text-center">
      {icon ? (
        <div aria-hidden="true" className="text-3xl text-mist-dim/80">
          {icon}
        </div>
      ) : null}
      {/* Mono weight-400 30px heading — "nothing here" whispers, never bolds */}
      <h3 className="text-3xl font-normal text-white">{title}</h3>
      {description ? <p className="max-w-md text-sm text-mist-dim">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
