// Regression tests for money-path atomicity (review findings). Two invariants:
// (1) create()'s charge and its generation row insert commit or roll back
//     TOGETHER — a crash between them must not eat credits (charged balance
//     with no row means nothing can ever settle or refund it);
// (2) the failure settlement in get()'s poll-error path (mark failed + refund)
//     is ONE transaction — flip-then-refund in two transactions meant a crash
//     between them left a failed row whose charge was kept forever (the stale
//     sweep only rescues 'processing' rows).
// Service-level with a real in-memory sqlite: the "crash between the two
// halves" is simulated by renaming the table the SECOND half writes to — the
// sabotaged statement throws mid-sequence exactly where a crash would abort.
import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import type { CreateGenerationInput } from '@opencreate/contracts'
import { createDb, type Db } from '../src/db/client'
import { creditTransaction, generation, user } from '../src/db/schema'
import { grantSignupBonus } from '../src/modules/credits/ledger'
import {
  createGenerationService,
  settleStaleGenerations,
  STALE_PROCESSING_MS,
} from '../src/modules/generations/service'
import type { RunwareClient } from '../src/integrations/runware/client'
import type { StorageProvider } from '../src/storage/local'
import { fakeRunware } from './helpers/build-test-app'

// Failure paths never touch storage — a throwing stub proves it stays unused.
const stubStorage = (): StorageProvider => ({
  saveFromUrl: async () => {
    throw new Error('storage must not be touched by these paths')
  },
  saveDataUri: async () => {
    throw new Error('storage must not be touched by these paths')
  },
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
  grantSignupBonus(db, 'u1', 200)
  return 'u1'
}

const balance = (db: Db, id: string) =>
  db.select({ b: user.creditsBalance }).from(user).where(eq(user.id, id)).get()?.b

const ledgerRows = (db: Db, userId: string, kind: 'charge' | 'refund') =>
  db
    .select()
    .from(creditTransaction)
    .where(and(eq(creditTransaction.userId, userId), eq(creditTransaction.kind, kind)))
    .all()

describe('money-path atomicity', () => {
  it('create(): a failed generation insert rolls the charge back — no orphan charge row', async () => {
    const { db, sqlite } = createDb(':memory:')
    const uid = seedUser(db)
    const rw = fakeRunware()
    const service = createGenerationService({
      db,
      runware: rw as unknown as RunwareClient,
      storage: stubStorage(),
    })
    // Simulate a crash/failure between chargeCredits and the row insert: the
    // insert's target table is gone, so the second half of the sequence throws.
    sqlite.exec('ALTER TABLE generation RENAME TO generation_disabled')
    const input: CreateGenerationInput = {
      modelId: 'flux-schnell',
      prompt: 'red fox',
      aspectRatio: '1:1',
    }
    await expect(service.create(uid, input)).rejects.toThrow()
    sqlite.exec('ALTER TABLE generation_disabled RENAME TO generation')
    // Atomicity: balance untouched, no orphan charge ledger row, provider never called.
    expect(balance(db, uid)).toBe(200)
    expect(ledgerRows(db, uid, 'charge')).toHaveLength(0)
    expect(rw.imageInference).not.toHaveBeenCalled()
  })

  it('get(): poll-error settlement is atomic — a refund failure rolls the fail flip back', async () => {
    const { db, sqlite } = createDb(':memory:')
    const uid = seedUser(db)
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    rw.getResponse.mockResolvedValue({ status: 'error', message: 'provider exploded' })
    const service = createGenerationService({
      db,
      runware: rw as unknown as RunwareClient,
      storage: stubStorage(),
      // This test polls twice back-to-back on purpose (sabotaged settlement,
      // then recovery) — disable the poll throttle so both hit Runware.
      pollMinIntervalMs: 0,
    })
    const { dto } = await service.create(uid, {
      modelId: 'pixverse-v6',
      prompt: 'waves',
      aspectRatio: '9:16',
      duration: 5,
    })
    expect(balance(db, uid)).toBe(165)
    // Sabotage the refund half of the settlement (crash-order simulation): the
    // ledger table is gone, so marking failed must abort together with it.
    sqlite.exec('ALTER TABLE credit_transaction RENAME TO credit_transaction_disabled')
    await expect(service.get(uid, dto.id)).rejects.toThrow()
    sqlite.exec('ALTER TABLE credit_transaction_disabled RENAME TO credit_transaction')
    // Atomic: the row must NOT be failed while the refund is missing.
    const row = db.select().from(generation).where(eq(generation.id, dto.id)).get()
    expect(row?.status).toBe('processing')
    expect(balance(db, uid)).toBe(165)
    // Recovery: the next poll settles fail + refund together — exactly once.
    const settled = await service.get(uid, dto.id)
    expect(settled.status).toBe('failed')
    expect(balance(db, uid)).toBe(200)
    expect(ledgerRows(db, uid, 'refund')).toHaveLength(1)
  })

  it('failGeneration: a row that raced to succeeded is left alone — no refund, status keeps succeeded', async () => {
    // Refund-after-success race (review finding): the fail path used to run
    // refundCredits UNCONDITIONALLY — the status guard only gated the flip.
    // A row that another settler flipped to 'succeeded' between get()'s read
    // and the failure settlement was left succeeded but REFUNDED: the user
    // keeps the asset and the money. The whole fail path must be a
    // check-and-set inside one transaction — only processing → failed refunds.
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const service = createGenerationService({
      db,
      runware: rw as unknown as RunwareClient,
      storage: stubStorage(),
      pollMinIntervalMs: 0,
    })
    const { dto } = await service.create(uid, {
      modelId: 'pixverse-v6',
      prompt: 'waves',
      aspectRatio: '9:16',
      duration: 5,
    })
    expect(balance(db, uid)).toBe(165)
    // The provider poll reports an error, but WHILE it is in flight a
    // concurrent settler (other tab / other poll) lands the success: the row
    // is 'succeeded' by the time the failure settlement transaction runs.
    // better-sqlite3 is synchronous, so mutating inside the mock is exactly
    // "between get()'s initial read and failGeneration's transaction".
    rw.getResponse.mockImplementation(async () => {
      db.update(generation)
        .set({ status: 'succeeded', mediaJson: '["/media/x.mp4"]', completedAt: new Date() })
        .where(eq(generation.id, dto.id))
        .run()
      return { status: 'error', message: 'provider exploded' }
    })
    const out = await service.get(uid, dto.id)
    // Succeeded wins: no flip, no refund, the charge stays settled.
    expect(out.status).toBe('succeeded')
    const row = db.select().from(generation).where(eq(generation.id, dto.id)).get()
    expect(row?.status).toBe('succeeded')
    expect(balance(db, uid)).toBe(165)
    expect(ledgerRows(db, uid, 'refund')).toHaveLength(0)
  })

  it('create(): video submit-failure settlement is ONE transaction — a flip failure rolls the refund back', async () => {
    // Review finding: the video catch block ran refundCredits and the failed
    // flip as TWO transactions (refund first). A crash between them committed
    // the refund while the row stayed processing — inconsistent ledger state.
    // Sabotage the flip half (generation table gone): the refund must abort
    // WITH it, leaving the charge held and the row processing for recovery.
    const { db, sqlite } = createDb(':memory:')
    const uid = seedUser(db)
    const rw = fakeRunware()
    rw.submitVideo.mockImplementation(async () => {
      sqlite.exec('ALTER TABLE generation RENAME TO generation_disabled')
      throw new Error('runware down')
    })
    const service = createGenerationService({
      db,
      runware: rw as unknown as RunwareClient,
      storage: stubStorage(),
    })
    const input: CreateGenerationInput = {
      modelId: 'pixverse-v6',
      prompt: 'waves',
      aspectRatio: '9:16',
      duration: 5,
    }
    await expect(service.create(uid, input)).rejects.toThrow()
    sqlite.exec('ALTER TABLE generation_disabled RENAME TO generation')
    // Atomic: no committed refund without the failed flip.
    const rows = db.select().from(generation).where(eq(generation.userId, uid)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('processing')
    expect(balance(db, uid)).toBe(165)
    expect(ledgerRows(db, uid, 'refund')).toHaveLength(0)
    // Recovery: the stale sweep settles fail + refund together — exactly once.
    settleStaleGenerations(db, Date.now() + STALE_PROCESSING_MS + 1000)
    const settled = db.select().from(generation).where(eq(generation.id, rows[0]!.id)).get()
    expect(settled?.status).toBe('failed')
    expect(balance(db, uid)).toBe(200)
    expect(ledgerRows(db, uid, 'refund')).toHaveLength(1)
  })

  it('create(): video submit failure settles fail + refund together (happy failure path)', async () => {
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    const rw = fakeRunware()
    rw.submitVideo.mockRejectedValue(new Error('runware down'))
    const service = createGenerationService({
      db,
      runware: rw as unknown as RunwareClient,
      storage: stubStorage(),
    })
    await expect(
      service.create(uid, { modelId: 'pixverse-v6', prompt: 'waves', aspectRatio: '9:16', duration: 5 }),
    ).rejects.toThrow('runware down')
    const row = db.select().from(generation).where(eq(generation.userId, uid)).get()
    expect(row?.status).toBe('failed')
    expect(row?.errorMessage).toBe('runware down')
    expect(balance(db, uid)).toBe(200)
    expect(ledgerRows(db, uid, 'refund')).toHaveLength(1)
  })
})
