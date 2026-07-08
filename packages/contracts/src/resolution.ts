// packages/contracts/src/resolution.ts
// The (model tier × aspect ratio) → pixel-resolution table.
//
// WHY THIS LIVES IN CONTRACTS AND NOT IN apps/api:
// Output resolution is DERIVED, never chosen — the user picks a model and an
// aspect ratio, and the pixels follow. The API needs the table to build the
// Runware task (width/height); the web composer needs the exact same table to
// TELL the user what they are about to get ("16:9 · 1920×1080") before they
// spend credits. Two copies of that mapping would drift, and the drift would
// be silent: the UI would promise a size the provider never renders.
//
// It is pure data + one pure function over CatalogModel, so it belongs on the
// wire-contract boundary next to the catalog schema it reads.
import type { AspectRatio, CatalogModel } from './catalog'

export type Resolution = { width: number; height: number }

// Keyed as a literal object (not Record<string, …>) so noUncheckedIndexedAccess
// keeps RESOLUTIONS.hd/fhd/square1024 and table[aspect] fully defined.
export const RESOLUTIONS = {
  hd: {
    '16:9': { width: 1280, height: 720 },
    '1:1': { width: 960, height: 960 },
    '9:16': { width: 720, height: 1280 },
  },
  fhd: {
    '16:9': { width: 1920, height: 1080 },
    '1:1': { width: 1440, height: 1440 },
    '9:16': { width: 1080, height: 1920 },
  },
  square1024: {
    '16:9': { width: 1344, height: 768 },
    '1:1': { width: 1024, height: 1024 },
    '9:16': { width: 768, height: 1344 },
  },
} satisfies Record<string, Record<AspectRatio, Resolution>>

// Image models all render off the square1024 table; video resolution is a
// function of the model's commercial tier (plus/pro/premium buy you 1080p).
export function resolutionFor(model: CatalogModel, aspect: AspectRatio): Resolution {
  const table =
    model.type === 'image'
      ? RESOLUTIONS.square1024
      : model.tier === 'pro' || model.tier === 'premium' || model.tier === 'plus'
        ? RESOLUTIONS.fhd
        : RESOLUTIONS.hd
  return table[aspect]
}

// Human-readable label for the composer's readout, e.g. "1920×1080".
// Uses U+00D7 MULTIPLICATION SIGN, not the letter x — this is a dimension.
export function formatResolution({ width, height }: Resolution): string {
  return `${width}×${height}`
}
