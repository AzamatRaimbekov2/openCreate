// Generation contracts: the POST /api/generations input and the Generation
// DTO returned by the API. `inputImage` must be a data URI (never a URL) so
// the API never fetches arbitrary user-supplied URLs (SSRF guard); its 14MB
// cap tracks the ~10MB file limit after base64 inflation. Dates travel as ISO
// strings because SQLite stores ms timestamps and JSON has no Date type.
import { z } from 'zod'
import { aspectRatioSchema } from './catalog'

export const generationTypeSchema = z.enum(['image', 'video'])
export const generationModeSchema = z.enum(['text', 'image'])
export const generationStatusSchema = z.enum(['processing', 'succeeded', 'failed'])

export const createGenerationInputSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().min(2).max(2000),
  aspectRatio: aspectRatioSchema,
  duration: z.number().int().min(1).max(15).optional(),
  inputImage: z.string().startsWith('data:image/').max(14_000_000).optional(),
})
export type CreateGenerationInput = z.infer<typeof createGenerationInputSchema>

export const generationParamsSchema = z.object({
  aspectRatio: aspectRatioSchema,
  duration: z.number().int().optional(),
  seed: z.number().optional(),
})

export const generationSchema = z.object({
  id: z.string(),
  type: generationTypeSchema,
  mode: generationModeSchema,
  status: generationStatusSchema,
  prompt: z.string(),
  modelId: z.string(),
  params: generationParamsSchema,
  costCredits: z.number().int(),
  mediaUrls: z.array(z.string()),
  progress: z.number().int().min(0).max(100).nullable().optional(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})
export type Generation = z.infer<typeof generationSchema>

export const generationListSchema = z.object({
  items: z.array(generationSchema),
  nextCursor: z.string().nullable(),
})
export type GenerationList = z.infer<typeof generationListSchema>
