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
    // The ONLY model in this catalog that can render a TAGGED ENTITY. Neither
    // flux-schnell nor flux-dev accepts `referenceImages` (verified against
    // Runware's per-model docs, 2026-07-09) — reference conditioning lives in the
    // Kontext family and in FLUX Fill (ACE++). Without this entry the entity
    // library would have nothing to generate with.
    //
    // `resolutionProfile: 'kontext'` is load-bearing: Kontext accepts only its own
    // dimension list, so the default square1024 table's 1344x768 would earn a
    // provider 400 on every 16:9 request.
    //
    // PRICE IS PROVISIONAL. Runware lists $0.04/image at 1024x1024 — 4 credits of
    // raw cost at 1 credit = $0.01. 8 keeps roughly the margin flux-dev carries.
    // Re-verify with scripts/verify-catalog.ts against a real key before this
    // reaches paying users: a wrong number here loses money silently.
    id: 'flux-kontext-pro',
    type: 'image',
    name: 'Cast',
    providerLabel: 'FLUX.1 Kontext pro',
    air: 'bfl:3@1',
    tier: 'plus',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 8,
    // Faces AND objects/places: Kontext conditions on any reference subject
    referenceMode: 'both',
    // Runware documents a max of 2 reference images here. Our wire contract caps
    // entityRefs at 1 today; raising it needs no change to this entry.
    maxReferenceImages: 2,
    resolutionProfile: 'kontext',
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
  {
    // CinemaStudio audio — voiceover (TTS). Runware audioInference, verified to
    // expose Russian voices. Priced flat per utterance (~$0.035/1k chars whole-
    // sale). aspectRatios carries a throwaway '16:9' only to satisfy catalogBase's
    // min(1) — the audio path never reads it.
    id: 'voiceover',
    type: 'audio',
    name: 'Голос',
    providerLabel: 'Inworld TTS 2',
    air: 'inworld:tts@2',
    tier: 'standard',
    supportsImageInput: false,
    aspectRatios: ['16:9'],
    credits: 8,
    audioKind: 'tts',
    voices: ['Svetlana', 'Elena', 'Dmitry', 'Nikolai', 'Ashley', 'Alex'],
  },
  {
    // CinemaStudio audio — music bed. Runware audioInference, MiniMax Music 2.6
    // (~$0.15 per ~3-min track). The prompt is the positive music prompt; the
    // audio adapter sends settings.instrumental for a clean background bed.
    id: 'music',
    type: 'audio',
    name: 'Музыка',
    providerLabel: 'MiniMax Music 2.6',
    air: 'minimax:music@2.6',
    tier: 'plus',
    supportsImageInput: false,
    aspectRatios: ['16:9'],
    credits: 20,
    audioKind: 'music',
  },
]

export function getModel(id: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.id === id)
}

export function creditsFor(model: CatalogModel, duration: number | undefined): number {
  // Image and audio are flat-priced per generation (a picture, a song, an
  // utterance); only video prices by duration.
  if (model.type === 'image' || model.type === 'audio') return model.credits
  if (duration === undefined) throw new Error('duration required for video')
  const credits = model.creditsByDuration[String(duration)]
  if (!credits) throw new Error(`unsupported duration ${duration} for ${model.id}`)
  return credits
}
