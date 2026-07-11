// apps/web/src/shared/ui/Card.tsx
// The kit's surface primitive (v4). Before it existed, every module hand-rolled
// `rounded-lg border border-white/10 p-4` — 55 copies across 26 files — which is
// why a plain media player, an export button and a track list all read with the
// same visual weight. A card now declares its SURFACE (how deep it sits) and its
// PADDING, and the design system owns what those mean.
//
// A titled card is a labelled landmark: screen-reader users navigate a film
// editor by its regions, so `title` is not decoration.
import type { ReactNode } from 'react'
import { useId } from 'react'
import { GLASS_SURFACE, STEEL_SURFACE, WELL_SURFACE } from './surfaces'

// glass = the default frosted card · steel = opaque, for text that must stay
// legible over anything · well = recessed plate the content sits inside
export type CardSurface = 'glass' | 'steel' | 'well'

export type CardPadding = 'none' | 'md' | 'lg'

export type CardProps = {
  // Card body
  children: ReactNode
  // Depth of the surface; see CardSurface
  surface?: CardSurface
  // When set, the card becomes a <section> labelled by this visible heading
  title?: string
  // Trailing control(s) rendered on the heading row (only with `title`)
  action?: ReactNode
  // Inner padding. 'none' when the child is edge-to-edge media.
  padding?: CardPadding
  // Layout-only escape hatch (grid spans, sticky positioning). Never surface styling.
  className?: string
}

const SURFACE_CLASS: Record<CardSurface, string> = {
  glass: GLASS_SURFACE,
  steel: STEEL_SURFACE,
  well: WELL_SURFACE,
}

const PADDING_CLASS: Record<CardPadding, string> = {
  none: '',
  md: 'p-4',
  lg: 'p-6',
}

export function Card({
  children,
  surface = 'glass',
  title,
  action,
  padding = 'md',
  className = '',
}: CardProps) {
  const headingId = useId()
  // 16px continuous-feeling radius: the iOS-glass silhouette, and already what
  // Modal's sheet uses — a card and a sheet are the same material.
  const shell = `rounded-2xl border ${SURFACE_CLASS[surface]} ${PADDING_CLASS[padding]} ${className}`

  if (title === undefined) {
    return <div className={shell}>{children}</div>
  }

  return (
    <section aria-labelledby={headingId} className={shell}>
      <div className="mb-3 flex items-center justify-between gap-3">
        {/* Headings are never bold in this system — weight 400 mono */}
        <h2 id={headingId} className="text-sm font-normal text-mist-dim">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}
