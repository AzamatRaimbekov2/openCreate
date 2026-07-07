// apps/web/src/shared/ui/showcasePosterArt.ts
// Art direction data for ShowcasePoster: six deliberate poster compositions on
// a 400×500 canvas — layered gradients + organic/geometric shapes per palette.
// These hex values are ART CONTENT (like a photo's pixels), not UI chrome, and
// are the documented exception to the tokens-only color rule — the palette
// definitions live in docs/frontend/design.md §5 ("Showcase art direction").

// The six editorial art palettes (brief: dusk orange/rose, deep sea blue/teal,
// botanical green/cream, monochrome ink, ultraviolet + the brand koi accent)
export const SHOWCASE_PALETTES = [
  'dusk',
  'sea',
  'botanical',
  'mono',
  'ultraviolet',
  'koi',
] as const

export type ShowcasePalette = (typeof SHOWCASE_PALETTES)[number]

// One stop of the backdrop gradient
export type PosterStop = {
  // 0–100 offset along the gradient, e.g. '0%', '55%'
  offset: string
  // Stop color (art content — sanctioned raw hex)
  color: string
}

// A single shape layer of a composition, painted in declaration order
export type PosterShape =
  // Filled circle — suns, moons, seeds, dots
  | { id: string; kind: 'disc'; cx: number; cy: number; r: number; fill: string; opacity?: number }
  // Organic closed path — blobs, waves, leaves, koi bodies
  | { id: string; kind: 'blob'; d: string; fill: string; opacity?: number }
  // Stroked circle — thin editorial rings
  | {
      id: string
      kind: 'ring'
      cx: number
      cy: number
      r: number
      stroke: string
      strokeWidth: number
      opacity?: number
    }
  // Rotated rectangle — horizon lines, diagonal bands
  | {
      id: string
      kind: 'band'
      x: number
      y: number
      width: number
      height: number
      fill: string
      opacity?: number
      rotate?: number
    }

// A full poster composition: vertical backdrop gradient + shape layers
export type PosterArt = {
  // Backdrop gradient stops, rendered top → bottom
  backdrop: PosterStop[]
  // Optional radial glow behind the shapes (dusk sun, ultraviolet aura)
  aura?: { cx: number; cy: number; r: number; from: string; to: string }
  // Shape layers, back to front
  shapes: PosterShape[]
}

// Reused organic silhhouettes (each composition transforms them via placement)
const LEAF_BLOB =
  'M204 92c58-14 118 22 132 82 14 61-22 122-80 142s-124-8-146-64c-21-55 6-118 60-146 11-6 22-11 34-14Z'
const WAVE_LOW =
  'M0 356c52-30 96 18 160 2s96-46 160-24c30 10 56 26 80 20V500H0Z'
const WAVE_HIGH = 'M0 412c64-36 128 10 208-8 72-16 128-30 192 6V500H0Z'
const KOI_BODY =
  'M96 318c10-72 74-138 150-146 60-6 104 30 106 78 2 52-44 84-96 96-46 11-96 30-124 66-22-26-42-52-36-94Z'

// The six compositions — each a distinct arrangement, not a recolor
export const POSTER_ART: Record<ShowcasePalette, PosterArt> = {
  // Low evening sun over a dark rose horizon
  dusk: {
    backdrop: [
      { offset: '0%', color: '#f6c7b2' },
      { offset: '55%', color: '#ec8d63' },
      { offset: '100%', color: '#c34a3e' },
    ],
    aura: { cx: 200, cy: 205, r: 170, from: '#ffe9c9', to: '#ec8d63' },
    shapes: [
      { id: 'sun', kind: 'disc', cx: 200, cy: 205, r: 92, fill: '#fbe3c4' },
      { id: 'halo', kind: 'ring', cx: 200, cy: 205, r: 122, stroke: '#fbe3c4', strokeWidth: 1.5, opacity: 0.6 },
      { id: 'horizon', kind: 'band', x: 0, y: 336, width: 400, height: 164, fill: '#8e2f3a', opacity: 0.92 },
      { id: 'glint', kind: 'band', x: 60, y: 352, width: 280, height: 3, fill: '#fbe3c4', opacity: 0.7 },
    ],
  },
  // Night water: pale moon over layered teal swells
  sea: {
    backdrop: [
      { offset: '0%', color: '#12304e' },
      { offset: '60%', color: '#123b54' },
      { offset: '100%', color: '#0b1d33' },
    ],
    shapes: [
      { id: 'moon', kind: 'disc', cx: 292, cy: 118, r: 44, fill: '#dce9e3' },
      { id: 'orbit', kind: 'ring', cx: 292, cy: 118, r: 74, stroke: '#dce9e3', strokeWidth: 1, opacity: 0.45 },
      { id: 'swell-back', kind: 'blob', d: WAVE_LOW, fill: '#2e8c86', opacity: 0.9 },
      { id: 'swell-front', kind: 'blob', d: WAVE_HIGH, fill: '#57b3a5' },
    ],
  },
  // Herbarium plate: one great leaf form and falling seeds on warm cream
  botanical: {
    backdrop: [
      { offset: '0%', color: '#f4eee0' },
      { offset: '100%', color: '#e6ddc7' },
    ],
    shapes: [
      { id: 'leaf', kind: 'blob', d: LEAF_BLOB, fill: '#3e6b4b' },
      { id: 'stem', kind: 'band', x: 197, y: 296, width: 5, height: 168, fill: '#2c4a35', rotate: 8 },
      { id: 'seed-a', kind: 'disc', cx: 118, cy: 402, r: 14, fill: '#2c4a35' },
      { id: 'seed-b', kind: 'disc', cx: 296, cy: 430, r: 9, fill: '#6f9464' },
      { id: 'vein', kind: 'ring', cx: 204, cy: 188, r: 58, stroke: '#f4eee0', strokeWidth: 1.5, opacity: 0.8 },
    ],
  },
  // Print-shop geometry: ink disc, concentric rules, one diagonal
  mono: {
    backdrop: [
      { offset: '0%', color: '#f2efe8' },
      { offset: '100%', color: '#e2dcd0' },
    ],
    shapes: [
      { id: 'ring-outer', kind: 'ring', cx: 172, cy: 208, r: 128, stroke: '#161412', strokeWidth: 1 },
      { id: 'ring-mid', kind: 'ring', cx: 172, cy: 208, r: 92, stroke: '#161412', strokeWidth: 1, opacity: 0.7 },
      { id: 'ring-inner', kind: 'ring', cx: 172, cy: 208, r: 56, stroke: '#161412', strokeWidth: 1, opacity: 0.45 },
      { id: 'dot', kind: 'disc', cx: 268, cy: 316, r: 58, fill: '#161412' },
      { id: 'slash', kind: 'band', x: -40, y: 396, width: 520, height: 2, fill: '#161412', rotate: -12 },
    ],
  },
  // After-dark aura: magenta glow and a drifting lilac orbit
  ultraviolet: {
    backdrop: [
      { offset: '0%', color: '#2c1e50' },
      { offset: '100%', color: '#150f31' },
    ],
    aura: { cx: 208, cy: 226, r: 190, from: '#b77bff', to: '#2c1e50' },
    shapes: [
      { id: 'core', kind: 'disc', cx: 208, cy: 226, r: 66, fill: '#e14ecf', opacity: 0.9 },
      { id: 'orbit', kind: 'ring', cx: 208, cy: 226, r: 118, stroke: '#cdb3ff', strokeWidth: 1.5, opacity: 0.7 },
      { id: 'comet', kind: 'band', x: -30, y: 96, width: 480, height: 2.5, fill: '#cdb3ff', opacity: 0.55, rotate: 18 },
      { id: 'spark', kind: 'disc', cx: 330, cy: 396, r: 7, fill: '#cdb3ff' },
    ],
  },
  // Brand plate: a vermillion koi form with an ink eye on warm paper
  koi: {
    backdrop: [
      { offset: '0%', color: '#faf3e7' },
      { offset: '100%', color: '#f1e2cf' },
    ],
    shapes: [
      { id: 'fin', kind: 'blob', d: WAVE_HIGH, fill: '#f2825f', opacity: 0.55 },
      { id: 'body', kind: 'blob', d: KOI_BODY, fill: '#e8442e' },
      { id: 'eye', kind: 'disc', cx: 292, cy: 232, r: 11, fill: '#161412' },
      { id: 'pond', kind: 'ring', cx: 200, cy: 274, r: 158, stroke: '#161412', strokeWidth: 1, opacity: 0.35 },
    ],
  },
}
