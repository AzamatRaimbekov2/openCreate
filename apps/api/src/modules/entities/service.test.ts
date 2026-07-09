// Entity service behaviour. The invariants under test are OWNERSHIP (one user
// must never read, mutate, or reference another user's entity or image) and
// SOFT DELETE (a deleted entity disappears from the library but survives as
// provenance for the generations that cited it).
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../db/client'
import { user } from '../../db/schema'
import { createEntityService } from './service'
import type { EntityService } from './service'
import type { StorageProvider } from '../../storage/local'

// 1x1 transparent GIF
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

let db: ReturnType<typeof createDb>['db']
let service: EntityService
let saved: string[]

const storage = {
  dir: '/tmp/unused',
  saveFromUrl: async () => {
    throw new Error('entities never fetch a remote URL')
  },
  saveDataUri: async (_dataUri: string, key: string) => {
    saved.push(key)
    return `/media/${key}.gif`
  },
  remove: async () => undefined,
} as unknown as StorageProvider

beforeEach(() => {
  saved = []
  db = createDb(':memory:').db
  const now = new Date()
  db.insert(user)
    .values([
      { id: 'u1', email: 'a@b.c', emailVerified: true, createdAt: now, updatedAt: now },
      { id: 'u2', email: 'x@y.z', emailVerified: true, createdAt: now, updatedAt: now },
    ])
    .run()
  service = createEntityService({ db, storage })
})

describe('createEntityService.create', () => {
  it('creates an entity owned by the caller, with no images yet', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: 'd' })
    expect(entity.kind).toBe('character')
    expect(entity.images).toEqual([])
    // An entity exists before its first photo — primaryImageId must be nullable
    expect(entity.primaryImageId).toBeNull()
  })

  it('trims the name and description', async () => {
    const entity = await service.create('u1', {
      kind: 'object',
      name: '  Меч  ',
      description: '  острый  ',
    })
    expect(entity.name).toBe('Меч')
    expect(entity.description).toBe('острый')
  })
})

describe('createEntityService.list', () => {
  it('returns only the caller own entities', async () => {
    await service.create('u1', { kind: 'character', name: 'Аня', description: '' })
    await service.create('u2', { kind: 'character', name: 'Другой', description: '' })
    const { items } = await service.list('u1')
    expect(items).toHaveLength(1)
    expect(items[0]?.name).toBe('Аня')
  })

  it('hides soft-deleted entities', async () => {
    const entity = await service.create('u1', { kind: 'place', name: 'Лес', description: '' })
    await service.remove('u1', entity.id)
    expect((await service.list('u1')).items).toEqual([])
  })
})

describe('createEntityService.addImage', () => {
  it('stores the bytes and elects the FIRST image as primary automatically', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '' })
    const updated = await service.addImage('u1', entity.id, { dataUri: GIF, source: 'upload' })
    expect(saved).toHaveLength(1)
    expect(updated.images).toHaveLength(1)
    // Without this, an entity with a photo still sends no reference — the whole
    // feature silently no-ops until the user notices a "primary" control
    expect(updated.primaryImageId).toBe(updated.images[0]?.id)
  })

  it('does NOT re-elect primary when a second image is added', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '' })
    const first = await service.addImage('u1', entity.id, { dataUri: GIF, source: 'upload' })
    const second = await service.addImage('u1', entity.id, { dataUri: GIF, source: 'upload' })
    expect(second.images).toHaveLength(2)
    expect(second.primaryImageId).toBe(first.primaryImageId)
  })

  it('refuses to add an image to someone else entity', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '' })
    await expect(service.addImage('u2', entity.id, { dataUri: GIF, source: 'upload' })).rejects.toThrow(
      /not found/i,
    )
    // and nothing was written to disk before the ownership check
    expect(saved).toEqual([])
  })
})

describe('createEntityService.update', () => {
  it('rejects a primaryImageId that belongs to a DIFFERENT entity', async () => {
    const mine = await service.create('u1', { kind: 'character', name: 'Аня', description: '' })
    const other = await service.create('u1', { kind: 'character', name: 'Боря', description: '' })
    const withImage = await service.addImage('u1', other.id, { dataUri: GIF, source: 'upload' })
    const foreignImageId = withImage.images[0]?.id ?? ''
    await expect(service.update('u1', mine.id, { primaryImageId: foreignImageId })).rejects.toThrow(
      /image/i,
    )
  })

  it('refuses to update someone else entity', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '' })
    await expect(service.update('u2', entity.id, { name: 'Взлом' })).rejects.toThrow(/not found/i)
  })
})

describe('createEntityService.loadForMentions', () => {
  it('loads the caller entities by id, keyed for substitution', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: 'd' })
    const loaded = await service.loadForMentions('u1', [entity.id])
    expect(loaded[entity.id]?.name).toBe('Аня')
  })

  it('does not load another user entity (a tagged id must never leak)', async () => {
    const foreign = await service.create('u2', { kind: 'character', name: 'Чужой', description: '' })
    const loaded = await service.loadForMentions('u1', [foreign.id])
    // Empty, not throwing: composePrompt turns the miss into "unknown entity",
    // which the route maps to a 400. The point is that u1 never SEES the name.
    expect(loaded).toEqual({})
  })

  // Deleting an entity must stop NEW generations from citing it. Provenance for
  // OLD generations lives in the generation_entity rows, not in this live load —
  // so "soft delete" protects history without resurrecting a deleted character.
  it('does not load a soft-deleted entity (it can no longer be tagged)', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '' })
    await service.remove('u1', entity.id)
    const loaded = await service.loadForMentions('u1', [entity.id])
    expect(loaded[entity.id]).toBeUndefined()
  })
})

describe('createEntityService.referenceImageUrl', () => {
  it('returns the primary image url', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '' })
    const withImage = await service.addImage('u1', entity.id, { dataUri: GIF, source: 'upload' })
    expect(service.referenceImageUrl(withImage)).toMatch(/^\/media\//)
  })

  it('returns null for an entity with no photo — a tag with no reference', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '' })
    expect(service.referenceImageUrl(entity)).toBeNull()
  })
})
