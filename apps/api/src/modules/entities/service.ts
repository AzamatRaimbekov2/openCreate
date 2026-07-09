// apps/api/src/modules/entities/service.ts
// Domain layer of the entity library. Every method takes `userId` as its first
// argument and scopes every query by it — ownership is not a decoration here,
// it is the type signature. A tagged entityId arrives from the client, so a
// missing scope would let one user render another user's private character.
//
// ADR: docs/wiki/decisions/entity-library-reference-tagging.md
import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { AddEntityImageInput, CreateEntityInput, Entity, EntityList, UpdateEntityInput } from '@opencreate/contracts'
import type { Db } from '../../db/client'
import { entity, entityImage } from '../../db/schema'
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
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description,
      primaryImageId: row.primaryImageId,
      images: imagesOf(row.id).map((image) => ({
        id: image.id,
        url: image.url,
        source: image.source,
        createdAt: image.createdAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  return {
    async create(userId: string, input: CreateEntityInput): Promise<Entity> {
      const now = new Date()
      const id = randomUUID()
      db.insert(entity)
        .values({
          id,
          userId,
          kind: input.kind,
          // Trim at the domain boundary: " Аня " and "Аня" are the same character,
          // and the name reaches the model's prompt verbatim
          name: input.name.trim(),
          description: input.description.trim(),
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

      db.update(entity)
        .set({
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description.trim() } : {}),
          ...(input.primaryImageId !== undefined ? { primaryImageId: input.primaryImageId } : {}),
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
      const url = await storage.saveDataUri(input.dataUri, `entity-${imageId}`)
      db.insert(entityImage)
        .values({ id: imageId, entityId: row.id, url, source: input.source, createdAt: new Date() })
        .run()

      // The FIRST photo becomes the reference automatically. Without this an
      // entity would hold a photo and still send no reference — the feature
      // would silently no-op until the user discovered a "primary" control.
      if (row.primaryImageId === null) {
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
