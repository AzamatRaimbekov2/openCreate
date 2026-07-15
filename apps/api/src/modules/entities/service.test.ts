// Entity service behaviour. The invariants under test are OWNERSHIP (one user
// must never read, mutate, or reference another user's entity or image), SOFT
// DELETE (a deleted entity disappears from the library but survives as
// provenance for the generations that cited it), and — since Soul Studio — the
// DERIVED DESCRIPTION (`soul != null` ⟹ the service is the only writer of
// `description`, and a client-sent one is ignored rather than honoured).
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { composeSoul } from '@opencreate/contracts'
import type { Soul } from '@opencreate/contracts'
import { createDb } from '../../db/client'
import { generation, user } from '../../db/schema'
import { createEntityService } from './service'
import type { EntityService } from './service'
import type { StorageProvider } from '../../storage/local'

// 1x1 transparent GIF
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

// A minimal but real soul — the two required axes plus one trait, so the
// composed description is recognisable in an assertion without being brittle.
const SOUL: Soul = { archetype: 'female', styleId: 'anime', traits: ['horns'], notes: '' }

let db: ReturnType<typeof createDb>['db']
let service: EntityService
let saved: string[]
let removed: string[]

const storage = {
  dir: '/tmp/unused',
  saveFromUrl: async () => {
    throw new Error('entities never fetch a remote URL')
  },
  saveDataUri: async (_dataUri: string, key: string) => {
    saved.push(key)
    return `/media/${key}.gif`
  },
  // The 'generated' attach path reads a finished asset back out of OUR storage
  // and re-saves it under the entity's own key — it never fetches a URL.
  readAsDataUri: async (publicPath: string) => {
    if (!publicPath.startsWith('/media/')) throw new Error(`not our storage: ${publicPath}`)
    return GIF
  },
  remove: async (key: string, ext: string) => {
    removed.push(`${key}.${ext}`)
  },
} as unknown as StorageProvider

// A finished image generation the caller owns — what the 'generated' attach
// path expects to find. Overrides let each test break exactly one precondition.
function insertGeneration(overrides: Record<string, unknown> = {}): string {
  const id = randomUUID()
  db.insert(generation)
    .values({
      id,
      userId: 'u1',
      type: 'image',
      mode: 'text',
      status: 'succeeded',
      prompt: 'p',
      modelId: 'flux-dev',
      paramsJson: '{}',
      costCredits: 2,
      mediaJson: JSON.stringify(['/media/gen-asset.gif']),
      createdAt: new Date(),
      ...overrides,
    })
    .run()
  return id
}

beforeEach(() => {
  saved = []
  removed = []
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

// ─────────────────────────────────────────────────────────────────────────────
// Soul Studio (ADR ai-soul-studio). The invariant: `soul != null` ⟹ the
// description is DERIVED. A constructor cannot round-trip prose, so there is
// exactly one writer of that string and it is this service.
// ─────────────────────────────────────────────────────────────────────────────

describe('createEntityService — the soul invariant', () => {
  it('derives the description from the soul and IGNORES the one the client sent', async () => {
    const entity = await service.create('u1', {
      kind: 'character',
      name: 'Рогатая',
      // A client that sends prose alongside a soul is not rejected — there is
      // nothing it could send that would be right — it is simply overruled.
      description: 'что-то, что клиент придумал сам',
      soul: SOUL,
    })
    expect(entity.description).toBe(composeSoul(SOUL))
    expect(entity.description).not.toMatch(/придумал/)
    expect(entity.soul).toEqual(SOUL)
  })

  it('forces kind to character — a soul is a character, whatever the client claims', async () => {
    const entity = await service.create('u1', {
      kind: 'place',
      name: 'Рогатая',
      description: '',
      soul: SOUL,
    })
    expect(entity.kind).toBe('character')
  })

  it('re-derives the description when the soul is PATCHed', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: 'проза' })
    expect(entity.soul).toBeNull()

    const next: Soul = { ...SOUL, traits: ['iron-arm'], vibe: 'stoic' }
    const updated = await service.update('u1', entity.id, {
      soul: next,
      description: 'клиент снова пытается',
    })
    expect(updated.description).toBe(composeSoul(next))
    expect(updated.soul).toEqual(next)
  })

  // The invariant is a property of the ROW, not of the request. This is the hole
  // it exists to close: a PATCH carrying only a description, on a character that
  // already HAS a soul. If the client's prose won here, the row would claim one
  // character and the model would keep drawing another — and nothing would ever
  // report the divergence.
  it('refuses a client description on a soul-bearing entity, even with no soul in the payload', async () => {
    const entity = await service.create('u1', {
      kind: 'character',
      name: 'Рогатая',
      description: '',
      soul: SOUL,
    })

    const updated = await service.update('u1', entity.id, {
      description: 'клиент переписывает описание в обход конструктора',
    })

    expect(updated.description).toBe(composeSoul(SOUL))
    expect(updated.description).not.toMatch(/в обход/)
    expect(updated.soul).toEqual(SOUL)
  })

  it('leaves a soul-less entity on free prose (legacy entities are untouched)', async () => {
    const entity = await service.create('u1', { kind: 'object', name: 'Меч', description: 'острый' })
    const updated = await service.update('u1', entity.id, { description: 'тупой' })
    expect(updated.description).toBe('тупой')
    expect(updated.soul).toBeNull()
  })

  // A hand-edited or half-migrated row must not take the whole library down:
  // list() renders every OTHER character even when one soul is unreadable.
  it('reads a corrupt soul column as null instead of throwing', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '', soul: SOUL })
    db.run(sql`UPDATE entity SET soul = '{"archetype":"not-a-real-one"}' WHERE id = ${entity.id}`)
    const list = await service.list('u1')
    expect(list.items).toHaveLength(1)
    expect(list.items[0]?.soul).toBeNull()
  })
})

describe('createEntityService.addImage — the generated (portrait) branch', () => {
  it('copies the asset INSIDE our storage and records the view', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '', soul: SOUL })
    const generationId = insertGeneration()

    const updated = await service.addImage('u1', entity.id, {
      source: 'generated',
      generationId,
      view: 'front',
    })
    expect(updated.images).toHaveLength(1)
    expect(updated.images[0]?.source).toBe('generated')
    expect(updated.images[0]?.view).toBe('front')
    // The bytes were re-saved under OUR key — the entity never points at the
    // generation's file, which the user may delete from the gallery tomorrow.
    expect(saved).toHaveLength(1)
    expect(updated.images[0]?.url).toBe(`/media/${saved[0]}.gif`)
    expect(updated.primaryImageId).toBe(updated.images[0]?.id)
  })

  it('refuses another user generation', async () => {
    const entity = await service.create('u2', { kind: 'character', name: 'Чужой', description: '', soul: SOUL })
    const generationId = insertGeneration() // owned by u1
    await expect(
      service.addImage('u2', entity.id, { source: 'generated', generationId, view: 'front' }),
    ).rejects.toThrow(/generation/i)
    expect(saved).toEqual([])
  })

  it('refuses a generation that has not succeeded', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '', soul: SOUL })
    const generationId = insertGeneration({ status: 'processing', mediaJson: '[]' })
    await expect(
      service.addImage('u1', entity.id, { source: 'generated', generationId, view: 'front' }),
    ).rejects.toThrow(/generation/i)
  })

  it('refuses a generation that is not an image (a video is not a portrait)', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '', soul: SOUL })
    const generationId = insertGeneration({ type: 'video' })
    await expect(
      service.addImage('u1', entity.id, { source: 'generated', generationId, view: 'front' }),
    ).rejects.toThrow(/generation/i)
  })

  // A re-roll REPLACES the view. Appending would grow a "four-view sheet" to
  // five, six, seven images and leave the user guessing which profile is current.
  it('replaces an existing view rather than appending a fifth image', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '', soul: SOUL })
    const first = await service.addImage('u1', entity.id, {
      source: 'generated',
      generationId: insertGeneration(),
      view: 'front',
    })
    const firstImageId = first.images[0]?.id
    const firstUrl = first.images[0]?.url ?? ''

    const rerolled = await service.addImage('u1', entity.id, {
      source: 'generated',
      generationId: insertGeneration(),
      view: 'front',
    })
    expect(rerolled.images).toHaveLength(1)
    expect(rerolled.images[0]?.id).not.toBe(firstImageId)
    // The primary follows the re-roll — otherwise the entity would keep
    // referencing a photo that no longer exists in its own sheet.
    expect(rerolled.primaryImageId).toBe(rerolled.images[0]?.id)
    // ...and the orphaned file leaves the disk with the row.
    expect(removed).toContain(firstUrl.replace('/media/', ''))
  })

  it('orders the sheet by view, with plain uploads after it', async () => {
    const entity = await service.create('u1', { kind: 'character', name: 'Аня', description: '', soul: SOUL })
    await service.addImage('u1', entity.id, { dataUri: GIF, source: 'upload' })
    // Attached out of sheet order on purpose: the ORDER must come from the view,
    // not from the order the user happened to re-roll in.
    await service.addImage('u1', entity.id, {
      source: 'generated',
      generationId: insertGeneration(),
      view: 'profile',
    })
    const final = await service.addImage('u1', entity.id, {
      source: 'generated',
      generationId: insertGeneration(),
      view: 'front',
    })
    expect(final.images.map((image) => image.view)).toEqual(['front', 'profile', null])
  })
})
