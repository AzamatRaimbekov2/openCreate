// Cursor pagination correctness (review findings):
// (1) rows sharing the same createdAt millisecond must never be skipped — the
//     old cursor was createdAt-only with a strict `<`, so a page boundary
//     inside a same-ms group dropped the rest of the group;
// (2) the ?cursor= query param is attacker-controlled input — it must be
//     zod-validated at the route boundary, not fed into Number() blindly.
import { describe, expect, it } from 'vitest'
import { createDb, type Db } from '../src/db/client'
import { generation, user } from '../src/db/schema'
import { createGenerationService } from '../src/modules/generations/service'
import type { RunwareClient } from '../src/integrations/runware/client'
import type { StorageProvider } from '../src/storage/local'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'

const stubStorage = (): StorageProvider => ({
  saveFromUrl: async () => '/media/unused.webp',
  saveDataUri: async () => '/media/entity.png',
  readAsDataUri: async () => 'data:image/png;base64,AAA',
  serve: async () => ({ kind: 'file', root: '/tmp/unused' }),
  materialize: async (key, ext) => ({ path: `/media/${key}.${ext}`, release: async () => undefined }),
  scratchPath: (key, ext) => `/media/${key}.${ext}`,
  publishLocalFile: async (_path, key, ext) => `/media/${key}.${ext}`,
  remove: async () => undefined,
})

function seedUser(db: Db): string {
  db.insert(user)
    .values({ id: 'u1', email: 'u1@x.co', createdAt: new Date(), updatedAt: new Date() })
    .run()
  return 'u1'
}

function insertGeneration(db: Db, id: string, userId: string, createdAt: Date) {
  db.insert(generation)
    .values({
      id,
      userId,
      type: 'image',
      mode: 'text',
      status: 'succeeded',
      prompt: `prompt ${id}`,
      modelId: 'flux-schnell',
      paramsJson: '{"aspectRatio":"1:1"}',
      costCredits: 1,
      createdAt,
    })
    .run()
}

describe('list cursor pagination', () => {
  it('does not skip rows that share the same createdAt millisecond', async () => {
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    const service = createGenerationService({
      db,
      runware: fakeRunware() as unknown as RunwareClient,
      storage: stubStorage(),
    })
    // Three rows created in the SAME millisecond — realistic under bursts
    // (sqlite timestamps are ms-resolution).
    const sameInstant = new Date(1_700_000_000_000)
    insertGeneration(db, 'gen-a', uid, sameInstant)
    insertGeneration(db, 'gen-b', uid, sameInstant)
    insertGeneration(db, 'gen-c', uid, sameInstant)

    const page1 = service.list(uid, 2)
    expect(page1.items).toHaveLength(2)
    expect(page1.nextCursor).not.toBeNull()

    const page2 = service.list(uid, 2, page1.nextCursor!)
    expect(page2.items).toHaveLength(1)
    expect(page2.nextCursor).toBeNull()

    // Every row appears exactly once across the pages — nothing skipped or duplicated.
    const seen = [...page1.items, ...page2.items].map((g) => g.id).sort()
    expect(seen).toEqual(['gen-a', 'gen-b', 'gen-c'])
  })

  it('keeps rows with distinct timestamps in newest-first order across pages', async () => {
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    const service = createGenerationService({
      db,
      runware: fakeRunware() as unknown as RunwareClient,
      storage: stubStorage(),
    })
    insertGeneration(db, 'gen-old', uid, new Date(1_700_000_000_000))
    insertGeneration(db, 'gen-new', uid, new Date(1_700_000_001_000))

    const page1 = service.list(uid, 1)
    expect(page1.items[0]?.id).toBe('gen-new')
    const page2 = service.list(uid, 1, page1.nextCursor!)
    expect(page2.items[0]?.id).toBe('gen-old')
  })
})

describe('GET /api/generations cursor validation', () => {
  it('rejects a malformed cursor with a 400 validation envelope', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'GET',
      url: '/api/generations?cursor=not-a-cursor',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })

  it('accepts a bare epoch-ms cursor (legacy pre-tiebreaker format)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'GET',
      url: '/api/generations?cursor=1700000000000',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
  })
})
