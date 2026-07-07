// apps/web/src/shared/ui/ShowcasePoster.tsx
// Poster-grade decorative SVG art for the showcase spread ("Light Editorial"
// brief): each palette is a deliberate composition — layered gradients,
// organic/geometric shapes and a subtle feTurbulence grain — replacing the
// gray placeholder gradients the v1 design was rejected for. The art carries
// NO text and is aria-hidden: figure captions are the consumer's job, so the
// accessibility tree only ever announces the honest, localized caption.
import { useId } from 'react'
import { POSTER_ART } from './showcasePosterArt'
import type { PosterShape, ShowcasePalette } from './showcasePosterArt'

export { SHOWCASE_PALETTES } from './showcasePosterArt'
export type { ShowcasePalette } from './showcasePosterArt'

export type ShowcasePosterProps = {
  // Which of the six editorial art compositions to render
  palette: ShowcasePalette
  // Sizing/layout utilities from the caller (e.g. "aspect-[4/5] w-full") —
  // the poster fills whatever box it is given via preserveAspectRatio slice
  className?: string
}

export function ShowcasePoster({ palette, className = '' }: ShowcasePosterProps) {
  // Unique per-instance prefix for SVG defs — several posters render on one
  // page (the magazine spread), and duplicate gradient/filter ids would make
  // every poster silently paint with the FIRST poster's defs
  const uid = useId()
  const art = POSTER_ART[palette]
  const backdropId = `${uid}-backdrop`
  const auraId = `${uid}-aura`
  const grainId = `${uid}-grain`

  return (
    // Decorative: hidden from the a11y tree; data-palette is a stable hook
    // for tests and visual QA. slice keeps the composition cropped like a
    // photograph when the consumer's box has a different aspect ratio.
    <svg
      aria-hidden="true"
      data-palette={palette}
      viewBox="0 0 400 500"
      preserveAspectRatio="xMidYMid slice"
      className={`block ${className}`}
    >
      <defs>
        {/* Vertical backdrop — the poster's "sky" */}
        <linearGradient id={backdropId} x1="0" y1="0" x2="0" y2="1">
          {art.backdrop.map((stop) => (
            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </linearGradient>
        {art.aura ? (
          // Radial glow behind the shapes (dusk sun, ultraviolet aura) —
          // fading into the backdrop color so it reads as light, not a sticker
          <radialGradient id={auraId}>
            <stop offset="0%" stopColor={art.aura.from} />
            <stop offset="100%" stopColor={art.aura.to} stopOpacity="0" />
          </radialGradient>
        ) : null}
        {/* Print grain: monochrome fractal noise, alpha derived from the
            noise itself (last matrix row) so it overlays as fine dark specks */}
        <filter id={grainId} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.34 0.34 0.34 0 0"
          />
        </filter>
      </defs>

      <rect width="400" height="500" fill={`url(#${backdropId})`} />
      {art.aura ? (
        <circle cx={art.aura.cx} cy={art.aura.cy} r={art.aura.r} fill={`url(#${auraId})`} />
      ) : null}
      {/* Shape layers, back to front — keyed by their stable art ids */}
      {art.shapes.map((shape) => (
        <PosterShapeElement key={shape.id} shape={shape} />
      ))}
      {/* Grain sits on top of everything at low opacity — the "paper" of the print */}
      <rect width="400" height="500" filter={`url(#${grainId})`} opacity="0.38" />
    </svg>
  )
}

// Renders one declarative shape layer. Exhaustive over the PosterShape union —
// adding a new shape kind fails compilation here instead of silently no-op'ing.
function PosterShapeElement({ shape }: { shape: PosterShape }) {
  switch (shape.kind) {
    case 'disc':
      return (
        <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill} opacity={shape.opacity} />
      )
    case 'blob':
      return <path d={shape.d} fill={shape.fill} opacity={shape.opacity} />
    case 'ring':
      return (
        <circle
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill="none"
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          opacity={shape.opacity}
        />
      )
    case 'band':
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill={shape.fill}
          opacity={shape.opacity}
          // Rotate around the band's own center so placement stays intuitive
          transform={
            shape.rotate
              ? `rotate(${shape.rotate} ${shape.x + shape.width / 2} ${shape.y + shape.height / 2})`
              : undefined
          }
        />
      )
    default:
      return exhaustiveCheck(shape)
  }
}

// Compile-time exhaustiveness guard for the PosterShape union
function exhaustiveCheck(value: never): never {
  throw new Error(`Unhandled poster shape: ${JSON.stringify(value)}`)
}
