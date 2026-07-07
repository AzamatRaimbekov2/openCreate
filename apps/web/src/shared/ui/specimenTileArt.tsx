// apps/web/src/shared/ui/specimenTileArt.tsx
// Art direction data for SpecimenTile (v3 Stage 2 — replaces the v2 editorial
// showcasePosterArt): eight blue-violet DUOTONE research-lab "specimens" drawn
// with flat fills, hairline strokes and SVG <pattern> textures ONLY — no
// gradients (hard owner rule), no filters, no text. These two hex values are
// ART CONTENT (like a photo's pixels), not UI chrome — the documented
// exception to the tokens-only color rule (docs/frontend/design.md §5).
import type { ReactElement } from 'react'

// The reference symbolism (eye/brain/hand/arch/moon) plus three specimens in
// the same lab-plate language (koi = the brand fish, cell, orbit) to fill the
// 4-col grid with two even rows
export const SPECIMEN_KINDS = [
  'eye',
  'brain',
  'hand',
  'arch',
  'moon',
  'koi',
  'cell',
  'orbit',
] as const

export type SpecimenKind = (typeof SPECIMEN_KINDS)[number]

// The duotone: a deep indigo-violet ground one step off the void, and one
// light blue-violet ink. Mid-tones come from ink at opacity — never a gradient.
export const SPECIMEN_GROUND = '#161233'
export const SPECIMEN_INK = '#8fa3f2'

// Per-instance pattern fill urls (ids are useId-unique per SpecimenTile so
// several tiles on one page never repaint each other's textures)
export type SpecimenPatternUrls = {
  // Dot lattice — cytoplasm, palm print
  dots: string
  // 45° hatch — iris, koi scales
  hatch: string
  // Horizontal scanlines — stone face, planet surface
  scan: string
}

// Shared stroke width for the specimen outlines — one drawing voice
const LINE = 2

// Each glyph is a pure drawing on the 200×200 plate. Fills are GROUND, INK,
// ink-at-opacity or a pattern url — nothing else may appear here.
export const SPECIMEN_GLYPHS: Record<SpecimenKind, (p: SpecimenPatternUrls) => ReactElement> = {
  // The observing eye: almond lid, hatched iris, ink pupil with a ground glint
  eye: (p) => (
    <g>
      <path d="M16 100 Q100 30 184 100 Q100 170 16 100 Z" fill={SPECIMEN_INK} opacity={0.12} />
      <path
        d="M16 100 Q100 30 184 100 Q100 170 16 100 Z"
        fill="none"
        stroke={SPECIMEN_INK}
        strokeWidth={LINE}
      />
      <circle cx={100} cy={100} r={42} fill={p.hatch} />
      <circle cx={100} cy={100} r={42} fill="none" stroke={SPECIMEN_INK} strokeWidth={LINE} />
      <circle cx={100} cy={100} r={16} fill={SPECIMEN_INK} />
      <circle cx={106} cy={93} r={4} fill={SPECIMEN_GROUND} />
    </g>
  ),
  // The specimen brain: hemisphere outline, three gyri squiggles, a stem
  brain: (p) => (
    <g>
      <path
        d="M58 132 C34 128 26 96 44 78 C40 54 64 38 88 44 C100 26 136 28 148 48 C172 52 180 84 164 100 C172 122 152 142 128 138 C114 152 76 150 58 132 Z"
        fill={p.dots}
        stroke={SPECIMEN_INK}
        strokeWidth={LINE}
      />
      <path
        d="M70 70 Q86 58 98 72 T126 76"
        fill="none"
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
        opacity={0.65}
      />
      <path
        d="M62 100 Q84 90 100 102 T142 100"
        fill="none"
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
        opacity={0.65}
      />
      <path
        d="M78 124 Q98 112 120 122"
        fill="none"
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
        opacity={0.65}
      />
      <rect x={98} y={140} width={14} height={26} fill={SPECIMEN_INK} opacity={0.6} />
    </g>
  ),
  // The making hand: four raised fingers + thumb over a dotted palm plate
  hand: (p) => (
    <g>
      <rect
        x={58}
        y={96}
        width={84}
        height={72}
        rx={14}
        fill={p.dots}
        stroke={SPECIMEN_INK}
        strokeWidth={LINE}
      />
      <rect
        x={60}
        y={44}
        width={17}
        height={66}
        rx={8}
        fill={SPECIMEN_INK}
        opacity={0.12}
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
      />
      <rect
        x={81}
        y={30}
        width={17}
        height={80}
        rx={8}
        fill={SPECIMEN_INK}
        opacity={0.12}
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
      />
      <rect
        x={102}
        y={26}
        width={17}
        height={84}
        rx={8}
        fill={SPECIMEN_INK}
        opacity={0.12}
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
      />
      <rect
        x={123}
        y={38}
        width={17}
        height={72}
        rx={8}
        fill={SPECIMEN_INK}
        opacity={0.12}
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
      />
      <rect
        x={132}
        y={104}
        width={16}
        height={50}
        rx={8}
        fill={SPECIMEN_INK}
        opacity={0.12}
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
        transform="rotate(-42 140 112)"
      />
    </g>
  ),
  // The portal arch: scanlined stone face with the opening cut back to ground
  arch: (p) => (
    <g>
      <path
        d="M46 172 V96 A54 54 0 0 1 154 96 V172 Z"
        fill={p.scan}
        stroke={SPECIMEN_INK}
        strokeWidth={LINE}
      />
      <path
        d="M74 172 V108 A26 26 0 0 1 126 108 V172 Z"
        fill={SPECIMEN_GROUND}
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
      />
      <rect x={34} y={171} width={132} height={2.5} fill={SPECIMEN_INK} opacity={0.7} />
    </g>
  ),
  // The crescent moon (the video-marked tile on the landing): ink disc eclipsed
  // by a ground disc, craters on the lit limb, three far stars
  moon: () => (
    <g>
      <circle cx={100} cy={100} r={54} fill={SPECIMEN_INK} />
      <circle cx={126} cy={88} r={50} fill={SPECIMEN_GROUND} />
      <circle cx={72} cy={96} r={7} fill={SPECIMEN_GROUND} opacity={0.55} />
      <circle cx={84} cy={130} r={5} fill={SPECIMEN_GROUND} opacity={0.55} />
      <circle cx={152} cy={48} r={2} fill={SPECIMEN_INK} />
      <circle cx={40} cy={150} r={1.6} fill={SPECIMEN_INK} />
      <circle cx={162} cy={140} r={1.6} fill={SPECIMEN_INK} opacity={0.7} />
    </g>
  ),
  // The brand koi: hatched body drifting inside a faint pond ring
  koi: (p) => (
    <g>
      <circle
        cx={100}
        cy={104}
        r={72}
        fill="none"
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
        opacity={0.35}
      />
      <path
        d="M48 118 C58 84 96 62 128 72 C150 78 156 100 142 114 C128 128 104 128 92 140 C84 148 84 158 90 166 C66 160 42 142 48 118 Z"
        fill={p.hatch}
        stroke={SPECIMEN_INK}
        strokeWidth={LINE}
      />
      <path
        d="M138 78 C152 64 168 60 176 62 C170 74 168 86 158 94 Z"
        fill={SPECIMEN_INK}
        opacity={0.5}
      />
      <circle cx={120} cy={88} r={4} fill={SPECIMEN_INK} />
    </g>
  ),
  // The cell plate: dashed membrane, dotted cytoplasm, nucleus and a vacuole
  cell: (p) => (
    <g>
      <circle
        cx={100}
        cy={100}
        r={64}
        fill="none"
        stroke={SPECIMEN_INK}
        strokeWidth={LINE}
        strokeDasharray="10 6"
      />
      <circle cx={100} cy={100} r={56} fill={p.dots} />
      <circle
        cx={86}
        cy={92}
        r={20}
        fill={SPECIMEN_INK}
        opacity={0.45}
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
      />
      <circle cx={82} cy={88} r={6} fill={SPECIMEN_INK} />
      <circle
        cx={128}
        cy={122}
        r={10}
        fill={SPECIMEN_GROUND}
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
      />
    </g>
  ),
  // The ringed orbit: scanlined planet, tilted ring, one satellite
  orbit: (p) => (
    <g>
      <circle cx={100} cy={100} r={38} fill={p.scan} stroke={SPECIMEN_INK} strokeWidth={LINE} />
      <ellipse
        cx={100}
        cy={100}
        rx={74}
        ry={24}
        fill="none"
        stroke={SPECIMEN_INK}
        strokeWidth={1.5}
        transform="rotate(-18 100 100)"
      />
      <circle cx={158} cy={74} r={5} fill={SPECIMEN_INK} />
    </g>
  ),
}
