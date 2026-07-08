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
})

export const catalogImageModelSchema = catalogBase.extend({
  type: z.literal('image'),
  credits: z.number().int().positive(),
})
export const videoProviderSchema = z.enum(['runware', 'wan-runpod'])
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
  // and the wan-selfhost-video-provider ADR). Image models are always Runware,
  // so this lives on the video schema only.
  provider: videoProviderSchema.optional(),
})
export const catalogModelSchema = z.discriminatedUnion('type', [
  catalogImageModelSchema,
  catalogVideoModelSchema,
])
export type CatalogModel = z.infer<typeof catalogModelSchema>
export type CatalogImageModel = z.infer<typeof catalogImageModelSchema>
export type CatalogVideoModel = z.infer<typeof catalogVideoModelSchema>

export const catalogResponseSchema = z.object({ models: z.array(catalogModelSchema) })
