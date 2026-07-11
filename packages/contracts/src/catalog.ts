// Model catalog contracts. The API's curated catalog (apps/api catalog.ts)
// must validate against these schemas; the web Generator renders pickers from
// them. Image vs video models price differently (flat `credits` vs
// `creditsByDuration` keyed by stringified seconds), hence the discriminated
// union on `type` — it keeps that split type-safe on both sides of the wire.
import { z } from 'zod'

export const aspectRatioSchema = z.enum(['16:9', '1:1', '9:16'])
export type AspectRatio = z.infer<typeof aspectRatioSchema>

export const modelTierSchema = z.enum(['fast', 'quality', 'standard', 'plus', 'pro', 'premium'])
export type ModelTier = z.infer<typeof modelTierSchema>

const catalogBase = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  providerLabel: z.string().min(1),
  air: z.string().regex(/^[a-z0-9-]+:[a-z0-9.@-]+$/i),
  tier: modelTierSchema,
  supportsImageInput: z.boolean(),
  aspectRatios: z.array(aspectRatioSchema).min(1),
  // Can this model accept a tagged entity as a reference image, and in which
  // sense? 'portrait' = faces (ACE++ Portrait), 'subject' = objects/places
  // (ACE++ Subject), 'both' = either. Absent/null = tagging is impossible on
  // this model, and the composer must not offer it.
  //
  // This is a CAPABILITY, not a preference: the API re-validates it on every
  // request, because a capability the client can lie about is not a capability.
  referenceMode: z.enum(['portrait', 'subject', 'both']).nullish(),
  // Max reference images the provider accepts (FLUX.1 Kontext: 2). Only
  // meaningful when referenceMode is set.
  maxReferenceImages: z.number().int().positive().optional(),
  // Which resolution table this model reads (see resolution.ts). Absent → the
  // tier ladder. Present when the provider only accepts its own dimension list.
  resolutionProfile: z.enum(['hd', 'fhd', 'square1024', 'kontext', 'nanobanana']).optional(),
})

export const catalogImageModelSchema = catalogBase.extend({
  type: z.literal('image'),
  credits: z.number().int().positive(),
})
export const videoProviderSchema = z.enum(['runware', 'wan-runpod', 'bytedance'])
export type VideoProviderId = z.infer<typeof videoProviderSchema>

export const catalogVideoModelSchema = catalogBase.extend({
  type: z.literal('video'),
  durationOptions: z.array(z.number().int().positive()).min(1),
  creditsByDuration: z.record(z.string(), z.number().int().positive()),
  // Runware's `safety` task param is model-specific: ByteDance/Seedance models
  // reject it as unsupportedParameter. Absent/true = model accepts `safety`.
  supportsSafetyParam: z.boolean().optional(),
  // Which backend runs this video model. Additive and optional: absent means
  // the default fast tier (Runware). 'wan-runpod' routes submit/poll to our
  // self-hosted ComfyUI worker instead (see the VideoProvider seam in the API
  // and the wan-selfhost-video-provider ADR); 'bytedance' routes to ByteDance's
  // ModelArk API directly, bypassing the Runware aggregator (see the
  // seedance-direct-bytedance ADR). Image models are always Runware, so this
  // lives on the video schema only.
  provider: videoProviderSchema.optional(),
})
// CinemaStudio audio models (music beds + voiceover). Flat-priced per generation
// (a song / an utterance), so `credits` mirrors the image shape rather than the
// video per-duration table. `audioKind` splits the two workflows: 'music' reads
// the prompt as a positive prompt; 'tts' reads it as the spoken text and offers
// a `voices` list. Audio has no aspect ratio, but catalogBase requires ≥1, so an
// audio model carries a single throwaway ratio the service never reads — the
// audio path skips resolution entirely.
export const audioKindCatalogSchema = z.enum(['music', 'tts'])
export type AudioKindCatalog = z.infer<typeof audioKindCatalogSchema>
export const catalogAudioModelSchema = catalogBase.extend({
  type: z.literal('audio'),
  credits: z.number().int().positive(),
  audioKind: audioKindCatalogSchema,
  // TTS voices offered in the composer; absent for music models.
  voices: z.array(z.string()).optional(),
})
export const catalogModelSchema = z.discriminatedUnion('type', [
  catalogImageModelSchema,
  catalogVideoModelSchema,
  catalogAudioModelSchema,
])
export type CatalogModel = z.infer<typeof catalogModelSchema>
export type CatalogImageModel = z.infer<typeof catalogImageModelSchema>
export type CatalogVideoModel = z.infer<typeof catalogVideoModelSchema>
export type CatalogAudioModel = z.infer<typeof catalogAudioModelSchema>

export const catalogResponseSchema = z.object({ models: z.array(catalogModelSchema) })
