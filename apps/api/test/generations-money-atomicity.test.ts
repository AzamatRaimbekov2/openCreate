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
import { createGenerationService } from '../src/modules/generations/service'
import type { RunwareClient } from '../src/integrations/runware/client'
import type { StorageProvider } from '../src/storage/local'
import { fakeRunware } from './helpers/build-test-app'

// Failure paths never touch storage — a throwing stub proves it stays unused.
const stubStorage = (): StorageProvider => ({
  dir: '/tmp/unused',
  saveFromUrl: async () => {
    throw new Error('storage must not be touched by these paths')
  },
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
})
