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
  // `provider:model`. The model half now admits `/` because DeepInfra's ids are
  // PATHS (`ByteDance/Seedance-2.0`), not flat slugs — every other provider's ids
  // still match exactly as before, so this widens the alphabet without loosening
  // the shape (a colon is still required, and the provider half is still a slug).
  air: z.string().regex(/^[a-z0-9-]+:[a-z0-9./@-]+$/i),
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
  // Does this model accept a `negativePrompt`? Absent/true = yes.
  //
  // The same shape as supportsSafetyParam below, and for the same reason: Runware
  // does not silently ignore a parameter a model cannot take, it REJECTS THE WHOLE
  // TASK ("Invalid parameter detected. The parameter 'negativePrompt' is not
  // recognized or supported"). FLUX.1 Kontext (bfl:3@1) is such a model — an edit
  // model conditioned on a reference image, with no negative channel at all.
  //
  // Found the only way it could be: by minting a real reference sheet. The hero
  // shot (flux-dev) took its negative happily; all three referencing views died at
  // the provider, were refunded, and delivered nothing. A capability the catalogue
  // does not state is a capability the service will guess wrong.
  supportsNegativePrompt: z.boolean().optional(),
})

export const catalogImageModelSchema = catalogBase.extend({
  type: z.literal('image'),
  credits: z.number().int().positive(),
})
// 'alibaba' = Alibaba Cloud Model Studio (DashScope) direct, bypassing Runware.
// Reason is PRICE, and unusually so: Runware's markup is model-dependent, not
// flat. On Seedance it is ~0.8% (measured: $0.26136 billed against ByteDance's
// own $0.2592 list). On Wan 2.7 it is ~51% — Runware billed $0.7557 for a 5s
// 720p clip that Alibaba lists at $0.10/second, i.e. $0.50. At the volumes a
// cartoon product generates, that gap is the whole margin.
// 'deepinfra' = Seedance 2.0 WITHOUT ByteDance's resource-pack wall. Same model,
// same price ($7/M tokens without a video input — their published rate is
// ByteDance's own), but no activation, no prepay, no 90-day expiry. The direct
// channel refuses to run a single frame until the account buys a $30.10 pack that
// is not even purchasable in the console; this one just works.
export const videoProviderSchema = z.enum([
  'runware',
  'wan-runpod',
  'bytedance',
  'alibaba',
  'deepinfra',
])
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
// Which backend runs this 3D model. 'runware' is the only one built (3dInference);
// 'comfy-3d' is the designed-but-unbuilt self-host seam (ADR D2 — hosted TRELLIS.2
// at $0.0256 is cheaper than the electricity of running it ourselves).
export const mesh3dProviderSchema = z.enum(['runware', 'comfy-3d'])
export type Mesh3dProviderId = z.infer<typeof mesh3dProviderSchema>

// A 3D model is flat-priced per generation (one mesh), so `credits` mirrors the
// image shape rather than the video per-duration table. 3D has no aspect ratio,
// but catalogBase requires >=1, so an entry carries a single throwaway ratio the
// service never reads — the model3d path skips resolution entirely (like audio).
export const catalogModel3dSchema = catalogBase.extend({
  type: z.literal('model3d'),
  credits: z.number().int().positive(),
  // Does this model produce PBR maps (metallic/roughness/normal), or bare albedo?
  // Surfaced in the composer so the user knows what they are buying.
  pbr: z.boolean().optional(),
  provider: mesh3dProviderSchema.optional(),
})
export const catalogModelSchema = z.discriminatedUnion('type', [
  catalogImageModelSchema,
  catalogVideoModelSchema,
  catalogAudioModelSchema,
  catalogModel3dSchema,
])
export type CatalogModel = z.infer<typeof catalogModelSchema>
export type CatalogImageModel = z.infer<typeof catalogImageModelSchema>
export type CatalogVideoModel = z.infer<typeof catalogVideoModelSchema>
export type CatalogAudioModel = z.infer<typeof catalogAudioModelSchema>
export type CatalogModel3d = z.infer<typeof catalogModel3dSchema>

export const catalogResponseSchema = z.object({ models: z.array(catalogModelSchema) })
