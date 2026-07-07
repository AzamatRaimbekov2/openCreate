// apps/web/src/modules/Landing/components/SectionHeading.tsx
// Section header (v3 Stage 2 terminal): a small AMBER section icon (the
// triad's "explore" tint — decorative, currentColor) beside the mono
// weight-400 30px section title, with an optional quiet kicker above, closed
// by the standard white/10 hairline rule. The icon lives OUTSIDE the <h2> so
// the heading's accessible name stays exactly the i18n title (tests and the
// prerender grep rely on it). Stage 2 retired the v2 ghost ordinals — the
// narrow research column marks sections with the icon, not with numbering.
export type SectionHeadingProps = {
  // Localized section title — becomes the <h2> text verbatim
  title: string
  // Optional quiet caption above the title (e.g. "The index")
  kicker?: string
}

export function SectionHeading({ title, kicker }: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-white/10 pb-6">
      {kicker ? (
        // Quiet lowercase mono caption — the terminal voice never shouts
        <span className="text-xs text-mist-dim">{kicker}</span>
      ) : null}
      <div className="flex items-center gap-3">
        {/* The amber section mark: a four-point spark in glow-amber — the one
            sanctioned icon accent for explore/browse chrome. Decorative only:
            the h2 text carries all meaning. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="size-4 shrink-0 fill-current text-glow-amber"
        >
          <path d="M10 0 C10.7 5 15 9.3 20 10 C15 10.7 10.7 15 10 20 C9.3 15 5 10.7 0 10 C5 9.3 9.3 5 10 0 Z" />
        </svg>
        {/* The 30px/weight-400 heading law: section titles never bold, never
            grow past text-3xl — hierarchy comes from color (white) and space */}
        <h2 className="text-3xl font-normal text-white">{title}</h2>
      </div>
    </div>
  )
}
