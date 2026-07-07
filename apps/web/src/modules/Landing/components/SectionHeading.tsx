// apps/web/src/modules/Landing/components/SectionHeading.tsx
// Editorial section header ("Light Editorial" v2): oversized ghost serif
// ordinal (01/02/…) + optional uppercase micro-label kicker + the serif
// section title, closed by the standard hairline rule. The ordinal and the
// kicker live OUTSIDE the <h2> so the heading's accessible name stays exactly
// the i18n title (tests and the prerender grep rely on it).
export type SectionHeadingProps = {
  // Two-digit magazine ordinal ("01"…) — purely decorative, aria-hidden
  ordinal: string
  // Localized section title — becomes the <h2> text verbatim
  title: string
  // Optional uppercase micro-label above the title (e.g. "The index")
  kicker?: string
}

export function SectionHeading({ ordinal, title, kicker }: SectionHeadingProps) {
  return (
    <div className="flex items-end gap-5 border-b border-ink/15 pb-6 md:gap-7">
      {/* Ghost serif ordinal — the magazine's section numbering, decorative only */}
      <span
        aria-hidden="true"
        className="font-display text-5xl leading-none font-semibold tracking-tight text-ink/15 md:text-7xl"
      >
        {ordinal}
      </span>
      <div className="flex flex-col gap-2">
        {kicker ? (
          // Uppercase via CSS only — the DOM keeps the sentence-case i18n string
          <span className="text-[11px] font-medium tracking-[0.2em] text-ink-soft uppercase">
            {kicker}
          </span>
        ) : null}
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-5xl">
          {title}
        </h2>
      </div>
    </div>
  )
}
