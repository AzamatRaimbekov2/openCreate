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

// What a stored subject IS. The provider mapping (character → ACE++ Portrait,
// everything else → Subject) belongs to the provider adapter, NOT to the domain:
// the domain knows what the user made, not how a given vendor conditions on it.
export const entityKindSchema = z.enum(['character', 'object', 'place', 'other'])
export type EntityKind = z.infer<typeof entityKindSchema>

// Where an entity image came from. 'library' = copied from a past generation,
// 'upload' = the user's own file. Both end up in OUR storage (see below).
export const entityImageSourceSchema = z.enum(['upload', 'library'])
export type EntityImageSource = z.infer<typeof entityImageSourceSchema>

export const entityImageSchema = z.object({
  id: z.string(),
  // Served from OUR storage, never a provider URL: Runware assets expire after
  // 7 days, so an entity pointing at one is a character that silently breaks a
  // week after it was created.
  url: z.string(),
  source: entityImageSourceSchema,
  createdAt: z.string(),
})
export type EntityImage = z.infer<typeof entityImageSchema>

export const entitySchema = z.object({
  id: z.string(),
  kind: entityKindSchema,
  name: z.string(),
  // Free text, composed by the user (optionally from preset snippet chips).
  // The backend substitutes name + description wherever the entity is mentioned.
  description: z.string(),
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
export const createEntityInputSchema = z.object({
  kind: entityKindSchema,
  name: z.string().min(1).max(80),
  description: z.string().max(1000).default(''),
})
export type CreateEntityInput = z.infer<typeof createEntityInputSchema>

// Every field optional — PATCH semantics. `primaryImageId` may be set to an id
// the entity owns; the service validates ownership (a client must not be able
// to point one user's entity at another user's image).
export const updateEntityInputSchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(1000),
    primaryImageId: z.string(),
  })
  .partial()
export type UpdateEntityInput = z.infer<typeof updateEntityInputSchema>

// Same data-URI discipline as generation.inputImage: the API never fetches an
// arbitrary user-supplied URL (SSRF guard), and the 14MB cap tracks the ~10MB
// file limit after base64 inflation.
export const addEntityImageInputSchema = z.object({
  dataUri: z.string().startsWith('data:image/').max(14_000_000),
  source: entityImageSourceSchema.default('upload'),
})
export type AddEntityImageInput = z.infer<typeof addEntityImageInputSchema>

export const entityListSchema = z.object({ items: z.array(entitySchema) })
export type EntityList = z.infer<typeof entityListSchema>

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
