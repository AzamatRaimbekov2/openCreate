// apps/web/src/shared/ui/SpecimenTile.tsx
// Blue-violet duotone SVG "specimen" tile (v3 Stage 2 showcase art — replaces
// the v2 ShowcasePoster). The tile owns the square 200×200 plate: flat ground,
// three reusable <pattern> textures (dots / 45° hatch / scanlines) and the
// per-kind glyph from specimenTileArt. Flat fills + patterns ONLY — no
// gradients (hard owner rule), no filters, no text. Decorative and aria-hidden:
// the honest localized caption lives with the consumer (ShowcaseSpread).
import { useId } from 'react'
import { SPECIMEN_GLYPHS, SPECIMEN_GROUND, SPECIMEN_INK } from './specimenTileArt'
import type { SpecimenKind } from './specimenTileArt'

export { SPECIMEN_KINDS } from './specimenTileArt'
export type { SpecimenKind } from './specimenTileArt'

export type SpecimenTileProps = {
  // Which of the eight specimen drawings to render
  kind: SpecimenKind
  // Sizing utilities from the caller (e.g. "h-full w-full") — the plate fills
  // whatever box it is given via preserveAspectRatio slice
  className?: string
}

export function SpecimenTile({ kind, className = '' }: SpecimenTileProps) {
  // Unique per-instance prefix for the pattern defs — eight tiles render on
  // one page and duplicate ids would silently repaint every tile with the
  // FIRST tile's textures
  const uid = useId()
  const dotsId = `${uid}-dots`
  const hatchId = `${uid}-hatch`
  const scanId = `${uid}-scan`

  return (
    // Decorative: hidden from the a11y tree; data-specimen is a stable hook
    // for tests and visual QA. slice keeps the drawing cropped like a plate
    // when the consumer's box is not square.
    <svg
      aria-hidden="true"
      data-specimen={kind}
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid slice"
      className={`block ${className}`}
    >
      <defs>
        {/* Dot lattice — cytoplasm, palm print (ink at half strength) */}
        <pattern id={dotsId} width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.1" fill={SPECIMEN_INK} opacity="0.5" />
        </pattern>
        {/* 45° hatch — iris, koi scales */}
        <pattern
          id={hatchId}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect x="0" y="0" width="1.4" height="7" fill={SPECIMEN_INK} opacity="0.45" />
        </pattern>
        {/* Horizontal scanlines — stone face, planet surface */}
        <pattern id={scanId} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="6" height="1.2" fill={SPECIMEN_INK} opacity="0.4" />
        </pattern>
      </defs>
      {/* The flat duotone ground — one step off the void so the tile reads */}
      <rect width="200" height="200" fill={SPECIMEN_GROUND} />
      {/* The specimen drawing, textured through this instance's patterns */}
      {SPECIMEN_GLYPHS[kind]({
        dots: `url(#${dotsId})`,
        hatch: `url(#${hatchId})`,
        scan: `url(#${scanId})`,
      })}
    </svg>
  )
}
