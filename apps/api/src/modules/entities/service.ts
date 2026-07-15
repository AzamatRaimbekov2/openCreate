// apps/api/src/modules/entities/service.ts
// Domain layer of the entity library. Every method takes `userId` as its first
// argument and scopes every query by it — ownership is not a decoration here,
// it is the type signature. A tagged entityId arrives from the client, so a
// missing scope would let one user render another user's private character.
//
// ADRs: docs/wiki/decisions/entity-library-reference-tagging.md
//       docs/wiki/decisions/ai-soul-studio.md
//
// SOUL STUDIO added ONE rule to this file, and it is an invariant rather than a
// feature: `soul != null` ⟹ `description` is DERIVED. The service composes it
// from the soul on every write and IGNORES whatever description the client sent.
// There is no override flag, because a constructor cannot round-trip prose: the
// moment two writers can touch that string, reopening the constructor either
// destroys the user's hand-edit or lies about what the model will see.
import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { PORTRAIT_SHEET_VIEWS, composeSoul, soulSchema } from '@opencreate/contracts'
import type {
  AddEntityImageInput,
  CreateEntityInput,
  Entity,
  EntityList,
  PortraitView,
  Soul,
  UpdateEntityInput,
} from '@opencreate/contracts'
import type { Db } from '../../db/client'
import { entity, entityImage, generation } from '../../db/schema'
import type { StorageProvider } from '../../storage/local'
import type { MentionEntities } from './mentions'

// Thrown when a row does not exist OR is not the caller's. Deliberately the SAME
// error for both: distinguishing them tells an attacker that someone else's
// entity id exists, which is exactly the fact we are protecting.
export class EntityNotFoundError extends Error {
  constructor(id: string) {
    super(`entity not found: ${id}`)
    this.name = 'EntityNotFoundError'
  }
}

// Thrown when primaryImageId does not name an image OF THIS entity
export class EntityImageInvalidError extends Error {
  constructor(id: string) {
    super(`image does not belong to this entity: ${id}`)
    this.name = 'EntityImageInvalidError'
  }
}

// Thrown when a client asks us to attach a generation that it may not attach:
// someone else's, one that never succeeded, one that is not an image, or one
// whose asset is gone. ONE error for all four on purpose — the same reasoning as
// EntityNotFoundError. A distinct "that generation belongs to another user" tells
// the caller that the id exists, and generation ids are the only thing standing
// between a probing client and someone else's private gallery.
export class GenerationNotAttachableError extends Error {
  constructor(id: string) {
    super(`generation cannot be attached: ${id}`)
    this.name = 'GenerationNotAttachableError'
  }
}

// Where each view sorts in the reference sheet. Anything with no view (an
// ordinary upload) sorts AFTER the whole sheet — the sheet is the character as
// the studio rendered it, and an upload is supporting material next to it. The
// order comes from the VIEW, never from insertion time: re-rolling the profile
// must not move it to the end of the sheet.
const SHEET_RANK: Record<PortraitView, number> = Object.fromEntries(
  PORTRAIT_SHEET_VIEWS.map((view, index) => [view, index]),
) as Record<PortraitView, number>
const UNVIEWED_RANK = PORTRAIT_SHEET_VIEWS.length

// The stored JSON → a Soul, or null. DEFENSIVE by design: a hand-edited row, a
// half-finished migration, or a soul written by a future schema must not 500 the
// user's entire library — one unreadable character reads as a legacy prose entity
// and every other character still renders.
function parseSoul(raw: string | null): Soul | null {
  if (!raw) return null
  try {
    const parsed = soulSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export type EntityService = ReturnType<typeof createEntityService>

export function createEntityService({ db, storage }: { db: Db; storage: StorageProvider }) {
  // Read one ALIVE entity owned by the caller, or throw. The single funnel every
  // mutating method goes through — one place to get the scoping right.
  function requireOwned(userId: string, entityId: string) {
    const row = db
      .select()
      .from(entity)
      .where(and(eq(entity.id, entityId), eq(entity.userId, userId), isNull(entity.deletedAt)))
      .get()
    if (!row) throw new EntityNotFoundError(entityId)
    return row
  }

  function imagesOf(entityId: string) {
    return db
      .select()
      .from(entityImage)
      .where(eq(entityImage.entityId, entityId))
      .orderBy(asc(entityImage.createdAt))
      .all()
  }

  // Rows → wire DTO. Timestamps become ISO strings (SQLite stores ms, JSON has
  // no Date), which is the same convention generation.ts uses.
  function toDto(row: typeof entity.$inferSelect): Entity {
    // Sheet order, then uploads. The rows arrive in createdAt order and
    // Array.prototype.sort is stable, so the untouched tail keeps that order —
    // only the sheet gets rearranged, and it gets rearranged into the one order
    // the UI can render a character sheet in.
    const images = imagesOf(row.id).sort(
      (a, b) =>
        (a.view ? SHEET_RANK[a.view] : UNVIEWED_RANK) -
        (b.view ? SHEET_RANK[b.view] : UNVIEWED_RANK),
    )
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description,
      soul: parseSoul(row.soul),
      primaryImageId: row.primaryImageId,
      images: images.map((image) => ({
        id: image.id,
        url: image.url,
        source: image.source,
        view: image.view ?? null,
        createdAt: image.createdAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  // Copy a finished portrait INTO the entity, by id — the 'generated' branch of
  // addImage.
  //
  // The generation row is read DIRECTLY here rather than through the generation
  // service, and that is a deliberate acyclicity choice, not a shortcut: the
  // generation service already depends on THIS service (it resolves `[[e1]]`
  // mentions through loadForMentions), so depending back on it would close a
  // cycle. What we need from that row is four facts and no behaviour.
  //
  // All four checks are default-deny, and all four raise the SAME error:
  //  · the generation is the caller's — otherwise any user could mint an entity
  //    and staple someone else's private image onto it, then read it back;
  //  · it succeeded — a processing row has no asset, a failed one was refunded;
  //  · it is an IMAGE — a video or a mesh is not a portrait, and its bytes would
  //    land in the storage layer as a corrupt "photo";
  //  · it still has its asset.
  async function copyGeneratedAsset(
    userId: string,
    generationId: string,
    imageId: string,
  ): Promise<string> {
    const row = db
      .select()
      .from(generation)
      .where(and(eq(generation.id, generationId), eq(generation.userId, userId)))
      .get()
    if (!row || row.status !== 'succeeded' || row.type !== 'image')
      throw new GenerationNotAttachableError(generationId)
    const [mediaUrl] = JSON.parse(row.mediaJson) as string[]
    if (!mediaUrl) throw new GenerationNotAttachableError(generationId)
    // COPY, not link. The entity must own its photo outright: a generation the
    // user deletes from the gallery tomorrow would otherwise take the character's
    // face with it — and the entity's images have a different lifetime (they are
    // its identity) than the gallery item that happened to produce them.
    const dataUri = await storage.readAsDataUri(mediaUrl)
    return storage.saveDataUri(dataUri, `entity-${imageId}`)
  }

  // Delete the file behind a replaced image row. The url is one WE minted
  // ("/media/<key>.<ext>"), so this just splits it back into the two arguments
  // storage.remove takes; remove() is idempotent, so a missing file is fine.
  // Best-effort by intent: an orphaned file is disk we can reclaim later, while a
  // failed re-roll is a portrait the user already paid for.
  async function removeStoredImage(url: string): Promise<void> {
    const fileName = url.slice(url.lastIndexOf('/') + 1)
    const dot = fileName.lastIndexOf('.')
    if (dot <= 0) return
    await storage.remove(fileName.slice(0, dot), fileName.slice(dot + 1))
  }

  return {
    async create(userId: string, input: CreateEntityInput): Promise<Entity> {
      const now = new Date()
      const id = randomUUID()
      const soul = input.soul ?? null
      db.insert(entity)
        .values({
          id,
          userId,
          // A soul IS a character — an `archetype` and a set of traits describe a
          // person, not a place. Forcing the kind rather than rejecting a mismatched
          // one keeps the constructor from having to teach the user a taxonomy it
          // already knows the answer to.
          kind: soul ? 'character' : input.kind,
          // Trim at the domain boundary: " Аня " and "Аня" are the same character,
          // and the name reaches the model's prompt verbatim
          name: input.name.trim(),
          // THE INVARIANT. With a soul, the description is ours and the client's is
          // discarded — there is nothing it could have sent that would be right,
          // because the text the model sees must be reproducible from the structure
          // the pickers hold. `soul.notes` is the escape hatch, and it is composed in.
          description: soul ? composeSoul(soul) : input.description.trim(),
          soul: soul ? JSON.stringify(soul) : null,
          primaryImageId: null,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      return toDto(requireOwned(userId, id))
    },

    async list(userId: string): Promise<EntityList> {
      const rows = db
        .select()
        .from(entity)
        .where(and(eq(entity.userId, userId), isNull(entity.deletedAt)))
        .orderBy(asc(entity.createdAt))
        .all()
      return { items: rows.map(toDto) }
    },

    async get(userId: string, entityId: string): Promise<Entity> {
      return toDto(requireOwned(userId, entityId))
    },

    async update(userId: string, entityId: string, input: UpdateEntityInput): Promise<Entity> {
      const row = requireOwned(userId, entityId)

      if (input.primaryImageId !== undefined) {
        // The id arrives from the client. Without this check a user could point
        // their entity at ANOTHER entity's image row — including one they do not
        // own — and that url would then be sent to the provider as a reference.
        const owned = imagesOf(row.id).some((image) => image.id === input.primaryImageId)
        if (!owned) throw new EntityImageInvalidError(input.primaryImageId)
      }

      // The same invariant as create(), on the PATCH path — and it has to be here
      // too, because the constructor's "save" is an update.
      //
      // The invariant is a property of the ROW, not of the request: `soul != null`
      // ⟹ the description is derived, no matter what this particular call carries.
      // So the entity's EXISTING soul counts. Reading only `input.soul` would leave
      // one hole wide open — `PATCH { description }` with no soul in the body would
      // overwrite a soul-built character's prose while its structure stayed put, and
      // from then on the row would claim one thing and the model would draw another.
      // The web never sends that shape; an invariant that only holds while the
      // client behaves is not an invariant.
      const soul = input.soul ?? parseSoul(row.soul)

      db.update(entity)
        .set({
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          // A client description is honoured ONLY on a soul-less (legacy, prose)
          // entity. With a soul, it is discarded — see above.
          ...(input.description !== undefined && !soul
            ? { description: input.description.trim() }
            : {}),
          ...(input.primaryImageId !== undefined ? { primaryImageId: input.primaryImageId } : {}),
          // Re-derive on every soul-bearing write, so the row's prose and its
          // structure can never disagree — not even for an instant.
          ...(soul
            ? { soul: JSON.stringify(soul), kind: 'character' as const, description: composeSoul(soul) }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(entity.id, row.id))
        .run()

      return toDto(requireOwned(userId, entityId))
    },

    // Soft delete: the row survives so a past generation's provenance still
    // resolves, but the entity leaves the library and can no longer be tagged.
    async remove(userId: string, entityId: string): Promise<void> {
      const row = requireOwned(userId, entityId)
      db.update(entity).set({ deletedAt: new Date() }).where(eq(entity.id, row.id)).run()
    },

    async addImage(userId: string, entityId: string, input: AddEntityImageInput): Promise<Entity> {
      // Ownership FIRST, bytes second. Reversing these would write an attacker's
      // payload to our disk before discovering they own nothing.
      const row = requireOwned(userId, entityId)

      const imageId = randomUUID()
      // Two ways a photo lands, and they are NOT the same operation:
      //  · upload/library — the client hands over BYTES. The storage layer is the
      //    gate (raster mimes only, size cap on decoded bytes).
      //  · generated — the client hands over a GENERATION ID it already paid for.
      //    We copy that asset INSIDE our own storage. The API still fetches no
      //    client-supplied URL: readAsDataUri only ever reads a /media path WE
      //    minted, so there is no SSRF surface here to close.
      const view: PortraitView | null = input.source === 'generated' ? input.view : null
      const url =
        input.source === 'generated'
          ? await copyGeneratedAsset(userId, input.generationId, imageId)
          : await storage.saveDataUri(input.dataUri, `entity-${imageId}`)

      // A view the entity ALREADY has is a RE-ROLL, not a new photo. Replacing the
      // row is what keeps a "four-view sheet" four images long; appending would
      // leave the user with two profiles and no way to say which one is current.
      const replaced = view ? imagesOf(row.id).find((image) => image.view === view) : undefined

      db.insert(entityImage)
        .values({ id: imageId, entityId: row.id, url, source: input.source, view, createdAt: new Date() })
        .run()

      if (replaced) {
        // Insert-then-delete, in that order: the entity is never momentarily
        // image-less, and a crash between the two leaves a harmless extra row
        // rather than a character whose face vanished.
        db.delete(entityImage).where(eq(entityImage.id, replaced.id)).run()
        await removeStoredImage(replaced.url)
      }

      // Who becomes the reference sent to the provider:
      //  · the FIRST photo — without this an entity would hold a photo and still
      //    send no reference, so the feature silently no-ops until the user
      //    discovers a "primary" control;
      //  · the photo that REPLACED the primary — otherwise the entity would go on
      //    referencing a row that no longer exists;
      //  · the FRONT view — it is the sheet's hero shot, the one every later view
      //    conditions on. A character's face is its front, not whatever it uploaded
      //    first.
      const becomesPrimary =
        row.primaryImageId === null || replaced?.id === row.primaryImageId || view === 'front'
      if (becomesPrimary) {
        db.update(entity)
          .set({ primaryImageId: imageId, updatedAt: new Date() })
          .where(eq(entity.id, row.id))
          .run()
      }

      return toDto(requireOwned(userId, entityId))
    },

    // Load tagged entities for prompt substitution. Scoped to the caller AND to
    // alive rows: an id the user does not own simply does not come back, and
    // composePrompt turns the miss into "unknown entity" → 400. The caller never
    // learns whether that id exists for someone else.
    async loadForMentions(userId: string, entityIds: string[]): Promise<MentionEntities> {
      if (entityIds.length === 0) return {}
      const rows = db
        .select({ id: entity.id, name: entity.name, description: entity.description })
        .from(entity)
        .where(
          and(inArray(entity.id, entityIds), eq(entity.userId, userId), isNull(entity.deletedAt)),
        )
        .all()
      return Object.fromEntries(rows.map((row) => [row.id, row]))
    },

    // The url sent to the provider as `referenceImages`. null when the entity has
    // no photo — a tag with nothing to condition on, which the caller must reject
    // rather than quietly generate a stranger.
    referenceImageUrl(dto: Entity): string | null {
      if (!dto.primaryImageId) return null
      return dto.images.find((image) => image.id === dto.primaryImageId)?.url ?? null
    },
  }
}
