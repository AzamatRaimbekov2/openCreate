// apps/web/src/modules/Landing/components/SectionHeading.tsx
// Section header (v3 terminal): ghost mono ordinal (01/02/…) + optional quiet
// mono kicker + the mono weight-400 section title, closed by the standard
// white/10 hairline rule. The ordinal and the kicker live OUTSIDE the <h2> so
// the heading's accessible name stays exactly the i18n title (tests and the
// prerender grep rely on it).
export type SectionHeadingProps = {
  // Two-digit ordinal ("01"…) — purely decorative, aria-hidden
  ordinal: string
  // Localized section title — becomes the <h2> text verbatim
  title: string
  // Optional quiet caption above the title (e.g. "The index")
  kicker?: string
}

export function SectionHeading({ ordinal, title, kicker }: SectionHeadingProps) {
  return (
    <div className="flex items-end gap-5 border-b border-white/10 pb-6 md:gap-7">
      {/* Ghost mono ordinal — section numbering as faint terminal line marks;
          white/10 keeps it present but whisper-quiet on the void */}
      <span
        aria-hidden="true"
        className="text-5xl leading-none font-normal text-white/10 md:text-7xl"
      >
        {ordinal}
      </span>
      <div className="flex flex-col gap-2">
        {kicker ? (
          // Quiet lowercase mono caption — v3 dropped the uppercase tracking
          <span className="text-xs text-mist-dim">{kicker}</span>
        ) : null}
        {/* The 30px/weight-400 heading law: section titles never bold, never
            grow past text-3xl — hierarchy comes from color (white) and space */}
        <h2 className="text-3xl font-normal text-white">{title}</h2>
      </div>
    </div>
  )
}
