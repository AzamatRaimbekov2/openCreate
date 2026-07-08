// apps/web/src/modules/Generator/components/ProviderMark.tsx
// Inline SVG provider logo marks for the model select. One crisp monoline glyph
// per brand — self-contained (no external image URLs, so nothing to load and
// nothing for a CSP to block) and drawn in `currentColor` so the surrounding
// tile owns the palette (mist by default, portal when selected). Flat strokes
// only, no gradients (owner rule). The shape is what distinguishes a brand — we
// deliberately keep ONE colour so the marks never fight the closed triad; the
// glyph geometry carries the identity. Decorative → aria-hidden; the model's
// brand name is always shown as text beside the mark.
import type { ReactNode } from 'react'
import type { ProviderId } from '../model/modelPresentation'

export type ProviderMarkProps = {
  // Which brand mark to draw
  provider: ProviderId
  // Sizing/colour utilities for the svg itself (default 24px, inherits color)
  className?: string
}

// Monoline glyphs on a 24×24 grid — no fills, round caps/joins, so they stay
// crisp from ~20px to ~36px. Each is an abstract mark evoking the brand, not a
// trademark reproduction.
const GLYPH: Record<ProviderId, ReactNode> = {
  // FLUX / BFL — a flux bolt (speed / flow)
  flux: <path d="M13 2.5 L5.5 13 H11 l-2 8.5 L19 10 h-6 z" />,
  // PixVerse — a play mark framed in a pixel square (video from stills)
  pixverse: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M10 8.5 l6 3.5 l-6 3.5 z" />
    </>
  ),
  // MiniMax — an angular M / twin peaks
  minimax: <path d="M4 19 V6 l4 7 l4-7 v13" />,
  // Seedance — a motion spark radiating from a core (Pulse)
  seedance: (
    <>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2.5 v3 M12 18.5 v3 M2.5 12 h3 M18.5 12 h3 M5.6 5.6 l2.1 2.1 M16.3 16.3 l2.1 2.1 M18.4 5.6 l-2.1 2.1 M7.7 16.3 l-2.1 2.1" />
    </>
  ),
  // Wan (Alibaba) — a cinematic horizon: nested domes over a base line
  wan: (
    <>
      <path d="M4 15 a8 8 0 0 1 16 0" />
      <path d="M8 15 a4 4 0 0 1 8 0" />
      <path d="M3 19 h18" />
    </>
  ),
  // Kling — an angular K monogram (Director)
  kling: <path d="M7 4 v16 M7 12 l8 -8 M7 12 l8 8" />,
  // Veo (Google) — a play mark inside a ring (premium video)
  veo: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8 l6 4 l-6 4 z" />
    </>
  ),
  // Fallback — a neutral faceted node
  generic: <path d="M12 3 l8 4.5 v9 L12 21 l-8 -4.5 v-9 z" />,
}

export function ProviderMark({ provider, className = 'h-6 w-6' }: ProviderMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {GLYPH[provider]}
    </svg>
  )
}
