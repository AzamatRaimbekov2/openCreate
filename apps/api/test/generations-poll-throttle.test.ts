// Poll throttling (review finding): GET /:id doubles as the Runware poll, so
// N browser tabs (or a hostile script) polling one processing generation used
// to translate 1:1 into provider getResponse calls. The service now keeps a
// per-generation last-poll timestamp (in-memory Map) and answers polls inside
// the min interval (default 3s) from the DB state without touching Runware.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, type Db } from '../src/db/client'
import { generation, user } from '../src/db/schema'
import { grantSignupBonus } from '../src/modules/credits/ledger'
import { createGenerationService } from '../src/modules/generations/service'
import type { RunwareClient } from '../src/integrations/runware/client'
import type { StorageProvider } from '../src/storage/local'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

const stubStorage = (): StorageProvider => ({
  dir: '/tmp/unused',
  saveFromUrl: async () => '/media/unused.mp4',
  remove: async () => undefined,
})

function seedUser(db: Db): string {
  db.insert(user)
    .values({ id: 'u1', email: 'u1@x.co', createdAt: new Date(), updatedAt: new Date() })
    .run()
  grantSignupBonus(db, 'u1', 200)
  return 'u1'
}

describe('poll throttling', () => {
  it('two immediate HTTP polls → exactly one runware.getResponse call', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    rw.getResponse.mockResolvedValue({ status: 'processing', progress: 40 })
    const app = await buildTestApp({ runware: rw, pollMinIntervalMs: 3000 })
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'pixverse-v6', prompt: 'waves', aspectRatio: '9:16', duration: 5 },
    })
    expect(created.statusCode).toBe(202)
    const id = created.json().id

    const p1 = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    const p2 = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    // The second poll is inside the window: answered from the DB (state the
    // first poll persisted), no second provider call.
    expect(rw.getResponse).toHaveBeenCalledTimes(1)
    expect(p1.json()).toMatchObject({ status: 'processing', progress: 40 })
    expect(p2.json()).toMatchObject({ status: 'processing', progress: 40 })
  })

  it('defaults to a 3s min interval when no override is given', async () => {
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    rw.getResponse.mockResolvedValue({ status: 'processing', progress: 10 })
    const service = createGenerationService({
      db,
      runware: rw as unknown as RunwareClient,
      storage: stubStorage(),
    })
    const { dto } = await service.create(uid, {
      modelId: 'pixverse-v6',
      prompt: 'waves',
      aspectRatio: '9:16',
      duration: 5,
    })
    await service.get(uid, dto.id)
    await service.get(uid, dto.id)
    expect(rw.getResponse).toHaveBeenCalledTimes(1)
  })

  it('polls Runware again once the interval has elapsed', async () => {
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    rw.getResponse.mockResolvedValue({ status: 'processing', progress: 10 })
    const service = createGenerationService({
      db,
      runware: rw as unknown as RunwareClient,
      storage: stubStorage(),
      pollMinIntervalMs: 30,
    })
    const { dto } = await service.create(uid, {
      modelId: 'pixverse-v6',
      prompt: 'waves',
      aspectRatio: '9:16',
      duration: 5,
    })
    await service.get(uid, dto.id)
    await new Promise((r) => setTimeout(r, 40))
    await service.get(uid, dto.id)
    expect(rw.getResponse).toHaveBeenCalledTimes(2)
  })

  it('a throttled poll still settles nothing — the row stays pollable and finishes later', async () => {
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    rw.getResponse
      .mockResolvedValueOnce({ status: 'processing', progress: 50 })
      .mockResolvedValueOnce({
        status: 'success',
        videoURL: 'https://vm.runware.ai/v.mp4',
        cost: 0.35,
      })
    const service = createGenerationService({
      db,
      runware: rw as unknown as RunwareClient,
      storage: stubStorage(),
      pollMinIntervalMs: 30,
    })
    const { dto } = await service.create(uid, {
      modelId: 'pixverse-v6',
      prompt: 'waves',
      aspectRatio: '9:16',
      duration: 5,
    })
    await service.get(uid, dto.id) // real poll (processing 50)
    const throttled = await service.get(uid, dto.id) // inside window → DB state
    expect(throttled.status).toBe('processing')
    await new Promise((r) => setTimeout(r, 40))
    const settled = await service.get(uid, dto.id) // window elapsed → settles
    expect(settled.status).toBe('succeeded')
    const row = db.select().from(generation).where(eq(generation.id, dto.id)).get()
    expect(row?.status).toBe('succeeded')
    expect(rw.getResponse).toHaveBeenCalledTimes(2)
  })
})
