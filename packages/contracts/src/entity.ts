// packages/contracts/src/entity.ts
// The Entity library: reusable characters, objects, places (and a catch-all)
// that a user can TAG inside a prompt so the model renders *that* subject.
//
// ADR: docs/wiki/decisions/entity-library-reference-tagging.md
//
// THE ONE RULE THIS FILE ENCODES: a tag is STRUCTURE, never prose.
// A text encoder reads "@аня" as the word "аня" — there is no lookup, no
// binding. If tags lived in the prompt string, the user would tag a character,
// pay credits, and receive a stranger; the failure is silent and total. So the
// prompt carries opaque placeholders and the entityRefs array carries meaning.
import { z } from 'zod'
import { apiErrorCodeSchema } from './errors'
import { portraitViewSchema, soulSchema } from './soul'

// What a stored subject IS. The provider mapping (character → ACE++ Portrait,
// everything else → Subject) belongs to the provider adapter, NOT to the domain:
// the domain knows what the user made, not how a given vendor conditions on it.
export const entityKindSchema = z.enum(['character', 'object', 'place', 'other'])
export type EntityKind = z.infer<typeof entityKindSchema>

// Where an entity image came from. 'library' = copied from a past generation,
// 'upload' = the user's own file, 'generated' = a Soul Studio portrait this
// entity paid for and now owns. All three end up in OUR storage (see below).
export const entityImageSourceSchema = z.enum(['upload', 'library', 'generated'])
export type EntityImageSource = z.infer<typeof entityImageSourceSchema>

export const entityImageSchema = z.object({
  id: z.string(),
  // Served from OUR storage, never a provider URL: Runware assets expire after
  // 7 days, so an entity pointing at one is a character that silently breaks a
  // week after it was created.
  url: z.string(),
  source: entityImageSourceSchema,
  // Which portrait of the reference sheet this is (Soul Studio), or null for an
  // ordinary upload. It is what makes the sheet render in a stable order AND
  // what makes re-rolling one view REPLACE that view instead of appending a
  // fifth image nobody asked for.
  view: portraitViewSchema.nullable().optional(),
  createdAt: z.string(),
})
export type EntityImage = z.infer<typeof entityImageSchema>

export const entitySchema = z.object({
  id: z.string(),
  kind: entityKindSchema,
  name: z.string(),
  // Free text, composed by the user (optionally from preset snippet chips).
  // The backend substitutes name + description wherever the entity is mentioned.
  //
  // INVARIANT (Soul Studio): `soul != null` ⟹ this string is DERIVED — the
  // service overwrites it with composeSoul(soul) on every soul change and
  // ignores any description the client sends. A constructor cannot round-trip
  // prose, so there is exactly one writer; `soul.notes` is the escape hatch.
  description: z.string(),
  // The structured character spec, when this entity was built in Soul Studio.
  // Null for every legacy/hand-made entity — which is why it is additive rather
  // than a new table: a soul-built character IS an entity, taggable as `[[e1]]`
  // in any prompt from the moment it exists.
  soul: soulSchema.nullable().optional(),
  images: z.array(entityImageSchema),
  // The ONE image sent as a reference. Runware accepts a single reference image
  // today; storing several and letting the user elect a primary is cheap and
  // forward-compatible, while sending several is not currently possible.
  primaryImageId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Entity = z.infer<typeof entitySchema>

// Name is short and human; description is the part that actually reaches the
// model, so it gets the generous cap. Both trimmed by the service.
//
// `soul` is optional and additive. When present the service forces kind to
// 'character' and DERIVES description from it — a client-sent description is
// ignored rather than rejected, because there is nothing the client could send
// that would be right (see the invariant on entitySchema.description).
export const createEntityInputSchema = z.object({
  kind: entityKindSchema,
  name: z.string().min(1).max(80),
  description: z.string().max(1000).default(''),
  soul: soulSchema.optional(),
})
export type CreateEntityInput = z.infer<typeof createEntityInputSchema>

// Every field optional — PATCH semantics. `primaryImageId` may be set to an id
// the entity owns; the service validates ownership (a client must not be able
// to point one user's entity at another user's image). Sending `soul` re-derives
// the description in the same write.
export const updateEntityInputSchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(1000),
    primaryImageId: z.string(),
    soul: soulSchema,
  })
  .partial()
export type UpdateEntityInput = z.infer<typeof updateEntityInputSchema>

// Two ways an image lands on an entity, and they are NOT the same operation:
//
//  · 'upload' / 'library' — the client hands over BYTES as a data URI. Same
//    discipline as generation.inputImage: the API never fetches an arbitrary
//    user-supplied URL (SSRF guard), and the 14MB cap tracks the ~10MB file
//    limit after base64 inflation.
//  · 'generated' — the client hands over a GENERATION ID it already paid for
//    (a Soul Studio portrait). The API copies that asset INSIDE our own storage
//    after checking the generation is the caller's, succeeded, and an image.
//    No bytes cross the wire, and still no URL is fetched.
//
// A union rather than one loose object with everything optional: the two
// branches have disjoint required fields, and a schema that accepts
// `{ source: 'generated' }` with no generationId is a 500 waiting to happen.
// The upload branch DEFAULTS its source, so the pre-existing `{ dataUri }` call
// the entity editor already makes still parses unchanged.
const uploadEntityImageSchema = z.object({
  source: z.enum(['upload', 'library']).default('upload'),
  dataUri: z.string().startsWith('data:image/').max(14_000_000),
})

const generatedEntityImageSchema = z.object({
  source: z.literal('generated'),
  generationId: z.string().min(1),
  // Which slot of the reference sheet this fills. Attaching a view the entity
  // already has REPLACES it (a re-roll), which is why it travels with the image
  // rather than being inferred later.
  view: portraitViewSchema,
})

export const addEntityImageInputSchema = z.union([
  uploadEntityImageSchema,
  generatedEntityImageSchema,
])
export type AddEntityImageInput = z.infer<typeof addEntityImageInputSchema>

export const entityListSchema = z.object({ items: z.array(entitySchema) })
export type EntityList = z.infer<typeof entityListSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Soul Studio: minting the reference sheet (POST /api/entities/:id/portraits).
//
// The client asks for VIEWS, never for a model and never for a prompt. Both are
// server-side rules (soul.ts SOUL_HERO_MODEL_ID / SOUL_SHEET_MODEL_ID): the
// model depends on whether a primary photo already exists, and the prompt is
// composed from the stored soul. A client that could choose either could pick
// the 2-credit model for a view that needs the 8-credit one and receive a
// stranger — for a price, silently.
// ─────────────────────────────────────────────────────────────────────────────
export const createPortraitsInputSchema = z.object({
  // Capped at the four sheet views; asking for the same view twice is pointless
  // (the second would replace the first) but harmless, so it is not policed.
  views: z.array(portraitViewSchema).min(1).max(4),
})
export type CreatePortraitsInput = z.infer<typeof createPortraitsInputSchema>

// One view's outcome. `errorCode` is set (and generationId null) when THAT view
// failed — the user has already been refunded for it by the generation service.
// Views are reported individually rather than the whole call failing, because a
// sheet is N paid jobs: collapsing them into one error would hide which of the
// four the user actually got.
//
// A CODE, never a message. Two reasons, and both are house rules:
//  · The failure text may come from a provider, and provider text is operator
//    material — it can name our account, our host, our task ids. Everything in
//    this object is serialized to the browser (app.ts sanitizes exactly this for
//    ordinary error envelopes; a per-view result must not be the hole in that).
//  · The SPA localizes a closed set of codes (shared/libs/errorCopy.ts). An
//    English provider string rendered raw into a Russian UI is not a message,
//    it is a leak with a font.
export const portraitResultSchema = z.object({
  view: portraitViewSchema,
  generationId: z.string().nullable(),
  errorCode: apiErrorCodeSchema.nullable(),
})
export type PortraitResult = z.infer<typeof portraitResultSchema>

// The entity comes back WITH the new portraits already attached: an image
// generation is synchronous, so making the client attach them in a second call
// would only create a window in which it could crash and leave the user holding
// a paid, orphaned portrait.
export const portraitsResponseSchema = z.object({
  entity: entitySchema,
  portraits: z.array(portraitResultSchema),
})
export type PortraitsResponse = z.infer<typeof portraitsResponseSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Mentions — the structured tag channel on a generation request.
// ─────────────────────────────────────────────────────────────────────────────

// The token the composer writes into the prompt text. Opaque BY DESIGN: matching
// on an entity's display name would break the moment a user names a character
// "Аня" and writes "Аня и её сестра Аня-младшая", or names one "the". `[[e1]]`
// cannot collide with prose because only the composer can produce it.
export const ENTITY_PLACEHOLDER_PATTERN = /\[\[(e\d+)\]\]/g

// Build the token for a placeholder key. Kept here so the composer and the
// backend substitution can never disagree about the syntax.
export function entityPlaceholderToken(placeholder: string): string {
  return `[[${placeholder}]]`
}

export const entityRefSchema = z.object({
  // Matches the `e1` inside `[[e1]]` in the prompt
  placeholder: z.string().regex(/^e\d+$/),
  entityId: z.string().min(1),
})
export type EntityRef = z.infer<typeof entityRefSchema>
