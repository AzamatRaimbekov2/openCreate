// apps/web/src/modules/Generator/components/SheetField.tsx
// One numbered row of the GeneratorPanel "commission sheet" (v3 terminal skin):
// a ghost mono ordinal (white/20, weight 400) in the margin + the field group
// beside it. The panel
// stacks these inside a divide-y container, so the hairline separators come
// from the parent — this row only owns its numeral column and breathing room.
import type { ReactNode } from 'react'

export type SheetFieldProps = {
  // Two-digit order mark ("01"…) — purely decorative print furniture, so it is
  // aria-hidden and derived from render order (conditional groups renumber)
  ordinal: string
  // The actual field group (PillGroup, ModelPicker, prompt textarea, …)
  children: ReactNode
}

export function SheetField({ ordinal, children }: SheetFieldProps) {
  return (
    <div className="flex gap-4 py-5 first:pt-0 last:pb-0 md:gap-5">
      {/* Ghost mono ordinal — the sheet's line numbering, decorative only
          (the same gesture as the landing's SectionHeading; white/20 keeps it
          whisper-quiet on the void, weight 400 per the ceiling law) */}
      <span
        aria-hidden="true"
        className="w-7 shrink-0 pt-0.5 text-lg leading-none font-normal text-white/20"
      >
        {ordinal}
      </span>
      {/* min-w-0 lets grids/textareas shrink instead of overflowing the sheet */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
