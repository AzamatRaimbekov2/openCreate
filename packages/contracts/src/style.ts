// Style Studio wire contracts (ADR: style-studio). A style is a user-built
// CONSTRUCTOR — a name, two prompt fragments and up to three reference images —
// that resolves at generation time exactly the way a model resolves against the
// catalog.
//
// A PACKAGE, NOT A CHOICE (amendment A1). The owner asked for styles built "from
// prompts AND references", so a style carries both at once and `kind` stays
// 'prompt': the images are a capability of the existing constructor, not a new
// one. That keeps every id already stored in a film, shot or template valid, and
// keeps the resolution path single — one lookup answers fragments and images
// together, and the caller decides what its model can honour.
//
// WHY THIS IS AN ENTITY AND NOT A PRESET. The seven builtin styles in
// presets.ts are code: a fixed table, shared by every user, shipped with the
// build. Everything the owner asked for beyond that — "each user builds their
// own styles from prompts" — is the same two strings with an OWNER and a
// lifetime, which is a row. So the registry has two sources and one shape: the
// list below unions them, `builtin` says which side a row came from, and the
// pickers do not care.
//
// THE FRAGMENTS ARE EXPOSED, on purpose and on both sides. A builtin style's
// fragment is not a secret (it ships in the SPA bundle already, and the whole
// point of the Style Studio is to let a user read one and build a better one),
// and a user's own style is theirs to read back and edit. What is NOT exposed
// is anyone else's row — the list is builtin + the caller's own, never a
// catalog of other people's work (public/shared styles are explicitly out of
// scope for the MVP).
import { z } from 'zod'

// The discriminator that keeps this extensible without a migration (ADR D2).
// MVP has exactly one kind: a style IS its prompt fragments. The designed
// successors — 'lora' (a trained weight) and 'reference' (a style lifted from
// an image) — add a value here plus keys in the row's config_json, so neither
// the table nor the wire has to change shape to grow.
export const styleKindSchema = z.enum(['prompt'])
export type StyleKind = z.infer<typeof styleKindSchema>

// Bounds shared by create and update so the two can never drift apart. EN is
// asked for in the UI copy rather than enforced here: models read English far
// better, but rejecting Cyrillic would refuse a fragment that works.
const nameSchema = z.string().min(1).max(60)
const fragmentSchema = z.string().min(1).max(500)
const negativeSchema = z.string().max(300)
// Advisory only — the picker may default to it, the API never forces it (the
// same contract STYLE_PRESETS.recommendedModelId has always had).
const recommendedModelIdSchema = z.string().min(1).max(80)

// How many images one style package may carry (ADR style-studio A1). Three, not
// five like a shot, because a style is AMBIENT: it rides along with whatever the
// shot already tags, and on a model that accepts two references a bigger number
// would only ever be trimmed away. The constructor reads this same constant, so
// the "2/3" counter in the UI and the refusal on the server are one number.
export const STYLE_MAX_REFERENCES = 3

// One reference image on a style. The READ shape — a stable '/media/<uuid>.<ext>'
// path we minted, plus the id used to delete it — NEVER the bytes. Same rule as
// shotReferenceImageSchema: the bytes were uploaded once and now live in our
// storage, and they are re-sourced into a data URI only at generation time
// (readAsDataUri) inside the closed server-only referenceImages seam.
//
// The field is `url` where the shot's is `path`, and that is deliberate rather
// than accidental: a style is rendered as a THUMBNAIL in the constructor, so the
// value is consumed as an <img src>, and naming it what it is used as keeps the
// web side from re-deriving it. The stored JSON keeps the shot's `{id, path}`.
export const styleReferenceImageSchema = z.object({
  id: z.string(),
  url: z.string(),
})
export type StyleReferenceImage = z.infer<typeof styleReferenceImageSchema>

// The upload. Byte-for-byte the shot's own rule (addShotReferenceInputSchema),
// because it guards the same disk: a raster data URI, bounded, and svg refused
// at the boundary — an svg served from our origin is stored XSS, and the
// server-side parse re-checks it anyway (defence in depth, not instead of).
export const addStyleReferenceInputSchema = z.object({
  dataUri: z
    .string()
    .startsWith('data:image/')
    .max(14_000_000)
    .refine((v) => !/^data:image\/svg/i.test(v), 'svg images are not allowed'),
})
export type AddStyleReferenceInput = z.infer<typeof addStyleReferenceInputSchema>

// One row of GET /api/styles — a builtin and a user style in the same shape.
export const styleSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: styleKindSchema,
  // Which source this came from. Drives the badge in the picker AND the refusal
  // in the editor: a builtin is immutable for everyone, including its author.
  builtin: z.boolean(),
  fragment: z.string(),
  negative: z.string(),
  recommendedModelId: z.string().nullable(),
  // The style's own sample image: the '/media/…' path of the generation this
  // style CITES (ADR canvas-mode D1 — cite, never own). Null when there is no
  // preview, and also when the cited generation is gone, failed, or was never
  // the caller's — resolution is a read that degrades to null, never an error.
  previewUrl: z.string().nullable(),
  // The OTHER half of the style package (ADR style-studio A1): "and make it look
  // like these". A style may carry fragments and images at once — the amendment's
  // whole point is that the two are one package, not a choice — so this is a plain
  // array on the same row rather than a second `kind`.
  //
  // ARRAY, never null, exactly like shotSchema.referenceImages: a style that
  // predates the column (or a builtin, which has no row at all) reads as [], so
  // no picker null-checks before it maps. Empty for every builtin, permanently:
  // builtins are code, and code has nowhere to store an uploaded image.
  referenceImages: z.array(styleReferenceImageSchema),
  // Null for builtins: they are code, they have no row and no timestamps. The
  // nullability is what tells a client "this one has no history to show".
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})
export type Style = z.infer<typeof styleSchema>

export const createStyleInputSchema = z.object({
  name: nameSchema,
  fragment: fragmentSchema,
  // Defaulted rather than optional: a style always HAS a negative, it is just
  // usually empty, and a default keeps the column and the DTO non-null.
  negative: negativeSchema.default(''),
  recommendedModelId: recommendedModelIdSchema.optional(),
})
export type CreateStyleInput = z.infer<typeof createStyleInputSchema>

// Partial: the editor saves one field at a time. `kind` is absent on purpose —
// there is one kind, and changing a style's kind is a different constructor,
// not an edit.
export const updateStyleInputSchema = z
  .object({
    name: nameSchema,
    fragment: fragmentSchema,
    negative: negativeSchema,
    // Nullable so the picker's "no recommendation" is expressible — an
    // optional-only field could set it but never clear it.
    recommendedModelId: recommendedModelIdSchema.nullable(),
    // Attach a preview by CITING a generation the caller already paid for.
    // The server re-checks that citation the way every other cite-a-generation
    // path does (own + succeeded + image, one shared refusal): a client may
    // send any id, which is exactly why the id alone proves nothing.
    previewGenerationId: z.string().min(1).max(60),
  })
  .partial()
export type UpdateStyleInput = z.infer<typeof updateStyleInputSchema>

export const styleListSchema = z.object({ items: z.array(styleSchema) })
export type StyleList = z.infer<typeof styleListSchema>
