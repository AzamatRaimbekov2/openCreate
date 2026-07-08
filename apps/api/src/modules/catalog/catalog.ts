// Curated model catalog (plan Task 7) — the single source of truth for model
// ids, display names, Runware AIR ids, aspect ratios and credit pricing.
// Prices come from research 2026-07; re-verify quarterly and run
// scripts/verify-catalog.ts against a real key before launch.
import type { CatalogModel } from '@opencreate/contracts'

// RESOLUTIONS / resolutionFor moved to @opencreate/contracts (see
// packages/contracts/src/resolution.ts): the web composer must show the user
// the exact output size before they spend credits, and a second copy of the
// table here would silently drift from the one the API sends to Runware.
// Re-exported so existing importers (runware task builder, tests) keep working.
export { RESOLUTIONS, resolutionFor } from '@opencreate/contracts'
export type { Resolution } from '@opencreate/contracts'

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
    // AIR verified live via modelSearch 2026-07-07; wholesale ~$0.026/s 720p silent
    id: 'seedance-1-5-pro',
    type: 'video',
    name: 'Pulse',
    providerLabel: 'Seedance 1.5 Pro',
    air: 'bytedance:seedance@1.5-pro',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 10],
    creditsByDuration: { '5': 35, '10': 70 },
    // ByteDance models reject Runware's `safety` param (unsupportedParameter,
    // verified live 2026-07-08) — flag off so the client omits it. Moderation
    // still applies via the NSFWContent flag on results.
    supportsSafetyParam: false,
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
    // Alibaba/Wan models reject Runware's `safety` task param
    // (unsupportedParameter, verified live 2026-07-09) — same quirk as
    // ByteDance/Seedance. Flag off so the client omits it; moderation relies
    // on the NSFWContent result flag.
    supportsSafetyParam: false,
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
  {
    // Self-hosted Wan 2.2 on our own RunPod GPU (ADR: wan-selfhost-video-
    // provider). `provider: 'wan-runpod'` routes submit/poll to the ComfyUI
    // adapter instead of Runware; the `air` is a synthetic tag (never sent to
    // Runware, skipped by verify-catalog) that only satisfies the AIR regex.
    // t2v only for now (supportsImageInput: false). Premium async "Forge" tier.
    // KNOWN GAP: self-host has no provider-side NSFW check (ComfyUI returns
    // nsfw:false) — see the ADR's moderation-parity note before public launch.
    id: 'wan-2-2',
    type: 'video',
    name: 'Forge',
    providerLabel: 'Wan 2.2 · our GPU',
    air: 'wan-runpod:wan2.2-t2v-a14b',
    tier: 'premium',
    supportsImageInput: false,
    aspectRatios: ['16:9', '9:16', '1:1'],
    durationOptions: [5],
    creditsByDuration: { '5': 60 },
    provider: 'wan-runpod',
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
