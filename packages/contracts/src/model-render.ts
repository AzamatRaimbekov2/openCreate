// A render of a 3D model into a video. ADR D3 (and the film_render precedent):
// A RENDER IS NOT A GENERATION. It spends our compute, not a provider invoice, so
// it carries NO credit ledger — no charge, no refund, no cost.
//
// In v1 the browser does the rendering (the renderer fork resolved to the
// client-side WebCodecs path) and POSTs the finished file. The row still carries a
// full status machine, because that is exactly what a future server-side renderer
// needs and it costs nothing to have now.
import { z } from 'zod'

export const modelRenderStatusSchema = z.enum(['processing', 'succeeded', 'failed'])

// 40MB: a 6s 1080p H.264 clip is ~3-8MB, and base64 inflates it by ~37%. The cap
// leaves room for 4K without letting an upload become a denial of service. The
// route must raise its own bodyLimit to match (the app-wide default is 15MB).
const MAX_VIDEO_CHARS = 40_000_000

export const createModelRenderInputSchema = z.object({
  presetId: z.string().min(1),
  // Data URIs, never URLs — the API must not fetch user-supplied hosts. Anchored
  // with a regex, not `.startsWith()`: a prefix check has no boundary character,
  // so `'data:video/mp4evil,...'.startsWith('data:video/mp4')` is true. The
  // trailing `;base64,` closes that hole AND matches the base64 assumption the
  // size cap above already makes.
  video: z.string().regex(/^data:video\/mp4;base64,/).max(MAX_VIDEO_CHARS),
  // The first frame, used for the no-WebGL fallback, OG previews and crawlers
  // (which will never run our WebGL). Cheap to produce while the model is loaded.
  // Closed raster-only mime list — same regex-anchoring reasoning as `video`
  // above, PLUS `image/svg+xml` is deliberately absent. It is not an oversight:
  // an SVG can carry `<script>`, so an "image" poster would be a stored-XSS
  // surface the moment it's ever served back or navigated to directly. This is
  // the same call apps/api/src/storage/dataUri.ts makes for entity photos, for
  // the same reason — this schema just has to make it too, since it is the
  // first (and here, only) gate this payload passes through.
  poster: z.string().regex(/^data:image\/(png|jpe?g|webp);base64,/).max(4_000_000),
})
export type CreateModelRenderInput = z.infer<typeof createModelRenderInputSchema>

export const modelRenderSchema = z.object({
  id: z.string(),
  generationId: z.string(),
  presetId: z.string(),
  status: modelRenderStatusSchema,
  progress: z.number().int().min(0).max(100).nullable(),
  // Which renderer produced this. 'browser' is what v1 writes; 'chromium' and
  // 'blender' are the designed-but-unbuilt server paths. A closed enum, not a
  // bare string — this is a single in-monorepo package, so adding a member
  // later is exactly as atomic as widening a string would have been, and
  // `status` above is already an enum for the identical "future states" reason.
  engine: z.enum(['browser', 'chromium', 'blender']),
  mediaUrl: z.string().nullable(),
  posterUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})
export type ModelRender = z.infer<typeof modelRenderSchema>

export const modelRenderListSchema = z.object({ items: z.array(modelRenderSchema) })

// A public, revocable share of a model. The token IS the row id (an unguessable
// UUID), so revoking a share is a DELETE and needs no flag on `generation` —
// which keeps this feature from touching the generation table at all.
export const modelShareSchema = z.object({
  token: z.string(),
  glbUrl: z.string(),
  posterUrl: z.string().nullable(),
  videoUrl: z.string().nullable(),
  title: z.string(),
})
export type ModelShare = z.infer<typeof modelShareSchema>
