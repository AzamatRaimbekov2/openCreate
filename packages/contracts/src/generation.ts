// Generation contracts: the POST /api/generations input and the Generation
// DTO returned by the API. `inputImage` must be a data URI (never a URL) so
// the API never fetches arbitrary user-supplied URLs (SSRF guard); its 14MB
// cap tracks the ~10MB file limit after base64 inflation. Dates travel as ISO
// strings because SQLite stores ms timestamps and JSON has no Date type.
import { z } from 'zod'
import { aspectRatioSchema } from './catalog'
import { entityRefSchema } from './entity'
import { promptPresetSchema } from './presets'
import { apiErrorCodeSchema } from './errors'

// 'audio' joins image|video for CinemaStudio (music beds + voiceover). It rides
// the SAME async lifecycle as video (charge-at-submit, poll, refund) — see the
// CinemaStudio ADR §1: audio is not a new subsystem, it is a third generation
// type behind an AudioProvider seam shaped exactly like the VideoProvider seam.
// 'model3d' joins them for Studio3D (photo → 3D GLB mesh) — see the
// photo-to-3d-studio ADR D1: a 3D model is not a new subsystem, it is a fourth
// generation type behind a Mesh3dProvider seam shaped exactly like VideoProvider.
export const generationTypeSchema = z.enum(['image', 'video', 'audio', 'model3d'])
export const generationModeSchema = z.enum(['text', 'image'])
export const generationStatusSchema = z.enum(['processing', 'succeeded', 'failed'])

// The BASE object, exported so consumers that need to widen a field can call
// `.extend` on a plain object schema rather than on the refined export below.
// `createGenerationInputSchema` (the wire schema every route parses) is this
// object PLUS the input-channel exclusivity rule.
export const createGenerationInputBaseSchema = z.object({
  modelId: z.string().min(1),
  // The prompt the CLIENT sends may contain opaque `[[e1]]` placeholders. The
  // prompt the MODEL sees is composed server-side by substituting each one with
  // its entity's name + description (see entity.ts for why tags cannot be prose),
  // then wrapping the preset fragments around it (see presets.ts). For audio:
  // music uses `prompt` as the positive prompt; TTS uses it as the spoken text.
  prompt: z.string().min(2).max(2000),
  // Optional for audio models (they have no aspect ratio); required for
  // image/video, which the SERVICE enforces against the model's aspectRatios.
  aspectRatio: aspectRatioSchema.optional(),
  duration: z.number().int().min(1).max(15).optional(),
  inputImage: z.string().startsWith('data:image/').max(14_000_000).optional(),
  // Canvas chain edge (ADR canvas-mode D2): cite an OWN succeeded image
  // generation as the i2i/i2v input instead of round-tripping its bytes as a
  // 14MB data URI. Mutually exclusive with inputImage (refined below); the
  // SERVICE additionally verifies ownership + succeeded + image output before
  // resolving its own stored media — nothing user-addressable is fetched.
  inputGenerationId: z.string().min(1).max(60).optional(),
  // Tagged entities. Capped at 1 because Runware accepts a single reference
  // image; the array shape is what lets that cap rise without a wire break.
  // The API re-validates model capability — a capability the client can lie
  // about is not a capability.
  entityRefs: z.array(entityRefSchema).max(1).optional(),
  // Structured CinemaStudio preset (style/camera/motion/quality). Optional and
  // additive: absent → the composed prompt is exactly the user's text, so the
  // existing ChatComposer is unaffected. The SERVER composes; the client never
  // concatenates fragments into `prompt` (ADR §3 — a preset is structure).
  promptPreset: promptPresetSchema.optional(),
  // TTS voice id (audio models only). Ignored by image/video/music paths.
  voice: z.string().max(80).optional(),
  // Native generation audio (video models only). true = ask the model for its
  // own soundtrack. Only honoured when the catalog model declares `nativeAudio`
  // — the service refuses it otherwise (and prices it from the with-audio table
  // on 'switchable' models, because providers bill sound separately).
  audio: z.boolean().optional(),
})

export const createGenerationInputSchema = createGenerationInputBaseSchema.superRefine(
  (input, ctx) => {
    // One input channel per request: a data URI AND a cited generation is a
    // contradiction (which one wins?) — refuse instead of guessing.
    if (input.inputImage !== undefined && input.inputGenerationId !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'inputImage and inputGenerationId are mutually exclusive',
        path: ['inputGenerationId'],
      })
    }
  },
)
export type CreateGenerationInput = z.infer<typeof createGenerationInputSchema>

export const generationParamsSchema = z.object({
  // Optional now that audio rows exist — they have no aspect ratio. Every
  // image/video row still carries one, so existing consumers are unaffected.
  aspectRatio: aspectRatioSchema.optional(),
  duration: z.number().int().optional(),
  seed: z.number().optional(),
  // PROVENANCE: this clip carries a native soundtrack. Stamped true when the
  // request asked for audio on a 'switchable' model OR the model is 'always'
  // (Wan 2.7 ships audio in every clip). The film render trusts THIS — it maps
  // a clip's audio stream into the export only when the row says one exists,
  // so it never has to probe files.
  audio: z.boolean().optional(),
})

export const generationSchema = z.object({
  id: z.string(),
  type: generationTypeSchema,
  mode: generationModeSchema,
  status: generationStatusSchema,
  // The user's own words (with `[[e1]]` already substituted). Kept verbatim so
  // "Regenerate"/"Edit prompt" read back what the user wrote.
  prompt: z.string(),
  // What the MODEL actually saw: prompt + preset fragments (presets.ts). Null on
  // legacy rows and any generation made without a preset — read `prompt` then.
  composedPrompt: z.string().nullable().optional(),
  // The structured preset this generation used, echoed back so the composer can
  // pre-fill the pickers on "Regenerate". Null when none was supplied.
  promptPreset: promptPresetSchema.nullable().optional(),
  modelId: z.string(),
  params: generationParamsSchema,
  costCredits: z.number().int(),
  mediaUrls: z.array(z.string()),
  progress: z.number().int().min(0).max(100).nullable().optional(),
  errorMessage: z.string().nullable(),
  // Machine-readable failure reason (subset of ApiErrorCode) so the SPA can
  // localize specific failures — e.g. 'content_blocked' (NSFW safety filter)
  // renders a dedicated message instead of the provider's raw errorMessage.
  errorCode: apiErrorCodeSchema.nullable().optional(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})
export type Generation = z.infer<typeof generationSchema>

export const generationListSchema = z.object({
  items: z.array(generationSchema),
  nextCursor: z.string().nullable(),
})
export type GenerationList = z.infer<typeof generationListSchema>
