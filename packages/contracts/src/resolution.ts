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
  // FLUX.1 Kontext accepts only its OWN dimension list. Handing it the
  // square1024 table's 1344x768 earns a provider 400 the user never asked for,
  // so a model may name its table explicitly (catalog.resolutionProfile).
  kontext: {
    '16:9': { width: 1392, height: 752 },
    '1:1': { width: 1024, height: 1024 },
    '9:16': { width: 752, height: 1392 },
  },
  // Nano Banana (Gemini image) publishes its OWN dimension list per resolution
  // tier and rejects sizes outside it — same class of constraint as Kontext, so
  // it gets its own table rather than being forced through the tier ladder.
  // These are its 1K-tier options (1024×1024 / 1376×768 / 768×1376) — the tier we
  // buy, since a reference portrait is generated once and never needs 4K.
  nanobanana: {
    '16:9': { width: 1376, height: 768 },
    '1:1': { width: 1024, height: 1024 },
    '9:16': { width: 768, height: 1376 },
  },
} satisfies Record<string, Record<AspectRatio, Resolution>>

// Which table a model reads. Absent → the legacy tier ladder below.
export type ResolutionProfile = keyof typeof RESOLUTIONS

// Image models all render off the square1024 table; video resolution is a
// function of the model's commercial tier (plus/pro/premium buy you 1080p).
export function resolutionFor(model: CatalogModel, aspect: AspectRatio): Resolution {
  // An explicit profile always wins: it exists precisely because the provider
  // rejects everything outside its own list.
  if (model.resolutionProfile) return RESOLUTIONS[model.resolutionProfile][aspect]
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
