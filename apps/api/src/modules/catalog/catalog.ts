// Curated model catalog (plan Task 7) — the single source of truth for model
// ids, display names, Runware AIR ids, aspect ratios and credit pricing.
// Prices come from research 2026-07; re-verify quarterly and run
// scripts/verify-catalog.ts against a real key before launch.
import type { AspectRatio, CatalogModel } from '@opencreate/contracts'

type Resolution = { width: number; height: number }

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

export const CATALOG: CatalogModel[] = [
  {
    id: 'flux-schnell',
    type: 'image',
    name: 'Flash',
    providerLabel: 'FLUX schnell',
    air: 'runware:100@1',
    tier: 'fast',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 1,
  },
  {
    id: 'flux-dev',
    type: 'image',
    name: 'Studio',
    providerLabel: 'FLUX dev',
    air: 'runware:101@1',
    tier: 'quality',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 2,
  },
  {
    id: 'pixverse-v6',
    type: 'video',
    name: 'Swift',
    providerLabel: 'PixVerse V6',
    air: 'pixverse:1@8',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 8],
    creditsByDuration: { '5': 35, '8': 56 },
  },
  {
    id: 'minimax-hailuo',
    type: 'video',
    name: 'Motion',
    providerLabel: 'MiniMax Hailuo 2.3',
    air: 'minimax:4@1',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9'],
    durationOptions: [6, 10],
    creditsByDuration: { '6': 35, '10': 60 },
  },
  {
    id: 'wan-2-7',
    type: 'video',
    name: 'Cinema',
    providerLabel: 'Wan 2.7',
    air: 'alibaba:wan@2.7',
    tier: 'plus',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 8],
    creditsByDuration: { '5': 55, '8': 88 },
  },
  {
    id: 'kling-3-pro',
    type: 'video',
    name: 'Director',
    providerLabel: 'Kling 3.0 Pro',
    air: 'klingai:kling-video@3-pro',
    tier: 'pro',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 10],
    creditsByDuration: { '5': 80, '10': 160 },
  },
  {
    id: 'veo-3-1-fast',
    type: 'video',
    name: 'Premiere',
    providerLabel: 'Veo 3.1 Fast',
    air: 'google:3@2',
    tier: 'premium',
    supportsImageInput: true,
    aspectRatios: ['16:9', '9:16'],
    durationOptions: [8],
    creditsByDuration: { '8': 140 },
  },
]

export function getModel(id: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.id === id)
}

export function creditsFor(model: CatalogModel, duration: number | undefined): number {
  if (model.type === 'image') return model.credits
  if (duration === undefined) throw new Error('duration required for video')
  const credits = model.creditsByDuration[String(duration)]
  if (!credits) throw new Error(`unsupported duration ${duration} for ${model.id}`)
  return credits
}

export function resolutionFor(model: CatalogModel, aspect: AspectRatio): Resolution {
  const table =
    model.type === 'image'
      ? RESOLUTIONS.square1024
      : model.tier === 'pro' || model.tier === 'premium' || model.tier === 'plus'
        ? RESOLUTIONS.fhd
        : RESOLUTIONS.hd
  return table[aspect]
}
