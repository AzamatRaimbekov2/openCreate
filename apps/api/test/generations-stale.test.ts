// Regression tests for stuck-processing settlement (review finding: paths that
// never settle nor refund). Two guarantees are pinned here, unit-level against
// the service (no HTTP layer needed):
// 1. get() treats a processing row older than STALE_PROCESSING_MS as abandoned
//    — fail + refund instead of holding the user's credits forever (covers
//    permanently failing downloads / expired 7-day Runware URLs / crashes
//    between insert and submit).
// 2. settleStaleGenerations(db) — the boot-time sweep app.ts runs — settles
//    abandoned rows even when nobody polls them again.
import { describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb } from '../src/db/client'
import { generation, user } from '../src/db/schema'
import { chargeCredits, grantSignupBonus } from '../src/modules/credits/ledger'
import {
  STALE_PROCESSING_MS,
  createGenerationService,
  settleStaleGenerations,
} from '../src/modules/generations/service'
import type { RunwareClient } from '../src/integrations/runware/client'
import type { StorageProvider } from '../src/storage/local'

type Db = ReturnType<typeof createDb>['db']

const storage: StorageProvider = {
  dir: '/tmp/unused',
  saveFromUrl: async () => '/media/unused.mp4',
  saveDataUri: async () => '/media/entity.png',
  readAsDataUri: async () => 'data:image/png;base64,AAA',
  localPath: (key, ext) => `/media/${key}.${ext}`,
  remove: async () => undefined,
}

const fakeRunware = () => ({
  imageInference: vi.fn(),
  submitVideo: vi.fn(),
  submitAudio: vi.fn(),
  getResponse: vi.fn(),
})

const balance = (db: Db) =>
  db.select({ b: user.creditsBalance }).from(user).where(eq(user.id, 'u1')).get()?.b

function seedUser(db: Db) {
  db.insert(user)
    .values({ id: 'u1', email: 'u1@x.co', createdAt: new Date(), updatedAt: new Date() })
    .run()
  grantSignupBonus(db, 'u1', 200)
}

function seedProcessing(db: Db, id: string, ageMs: number, taskUuid: string | null = 'task-1') {
  db.insert(generation)
    .values({
      id,
      userId: 'u1',
      type: 'video',
      mode: 'text',
      status: 'processing',
      prompt: 'waves',
      modelId: 'pixverse-v6',
      paramsJson: JSON.stringify({ aspectRatio: '9:16', duration: 5 }),
      costCredits: 35,
      runwareTaskUuid: taskUuid,
      createdAt: new Date(Date.now() - ageMs),
    })
    .run()
  chargeCredits(db, 'u1', 35, id)
}

describe('stale processing settlement', () => {
  it('get() settles a stale processing row as failed + refund without polling the provider', async () => {
    const { db } = createDb(':memory:')
    seedUser(db)
    seedProcessing(db, 'g1', STALE_PROCESSING_MS + 60_000)
    const rw = fakeRunware()
    const service = createGenerationService({
      db,
      runware: rw as unknown as RunwareClient,
      storage,
    })

    const dto = await service.get('u1', 'g1')
    expect(dto.status).toBe('failed')
    expect(dto.errorMessage).toBeTruthy()
    expect(balance(db)).toBe(200)
    // The provider is never asked about an abandoned task.
    expect(rw.getResponse).not.toHaveBeenCalled()
  })

  it('get() still polls fresh processing rows', async () => {
    const { db } = createDb(':memory:')
    seedUser(db)
    seedProcessing(db, 'g1', 5_000)
    const rw = fakeRunware()
    rw.getResponse.mockResolvedValue({ status: 'processing', progress: 10 })
    const service = createGenerationService({
      db,
      runware: rw as unknown as RunwareClient,
      storage,
    })

    const dto = await service.get('u1', 'g1')
    expect(dto.status).toBe('processing')
    expect(dto.progress).toBe(10)
    expect(balance(db)).toBe(165)
  })

  it('boot sweep settleStaleGenerations refunds abandoned rows and leaves fresh ones alone', () => {
    const { db } = createDb(':memory:')
    seedUser(db)
    // A row without a task uuid models a crash between insert and submit — it
    // can never be polled to completion, only the sweep can settle it.
    seedProcessing(db, 'g-old', STALE_PROCESSING_MS + 60_000, null)
    seedProcessing(db, 'g-new', 5_000)
    expect(balance(db)).toBe(130)

    settleStaleGenerations(db)

    const oldRow = db.select().from(generation).where(eq(generation.id, 'g-old')).get()
    const newRow = db.select().from(generation).where(eq(generation.id, 'g-new')).get()
    expect(oldRow?.status).toBe('failed')
    expect(newRow?.status).toBe('processing')
    // Only the abandoned charge came back.
    expect(balance(db)).toBe(165)
  })
})
