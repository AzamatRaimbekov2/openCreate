import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { createDb } from '../src/db/client'
import { DDL } from '../src/db/ddl'
import {
  chargeCredits,
  grantSignupBonus,
  refundCredits,
  InsufficientCreditsError,
} from '../src/modules/credits/ledger'
import { creditTransaction, user } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { buildTestApp } from './helpers/build-test-app'

function seedUser(db: ReturnType<typeof createDb>['db']) {
  db.insert(user)
    .values({ id: 'u1', email: 'u1@x.co', createdAt: new Date(), updatedAt: new Date() })
    .run()
  return 'u1'
}
const balance = (db: ReturnType<typeof createDb>['db'], id: string) =>
  db.select({ b: user.creditsBalance }).from(user).where(eq(user.id, id)).get()?.b

describe('ledger', () => {
  it('charge deducts, refund restores exactly once', () => {
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    grantSignupBonus(db, uid, 200)
    chargeCredits(db, uid, 35, 'gen1')
    expect(balance(db, uid)).toBe(165)
    refundCredits(db, uid, 'gen1')
    expect(balance(db, uid)).toBe(200)
    refundCredits(db, uid, 'gen1') // second refund is a no-op
    expect(balance(db, uid)).toBe(200)
  })
  it('charge beyond balance throws and changes nothing', () => {
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    grantSignupBonus(db, uid, 10)
    expect(() => chargeCredits(db, uid, 35, 'gen2')).toThrow(InsufficientCreditsError)
    expect(balance(db, uid)).toBe(10)
  })
})

// DB-level refund-once backstop (review finding): the app-level guard in
// applyRefund is transactional and correct, but nothing at the DATABASE level
// stopped a future code path from inserting a second refund row for the same
// generation. A UNIQUE index on (generation_id, kind) makes that physically
// impossible — while NULL generation_ids (signup bonuses) stay unconstrained,
// SQLite treats NULLs as distinct in unique indexes.
describe('refund-once unique index', () => {
  it('rejects a second refund row for one generation at the database level', () => {
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    grantSignupBonus(db, uid, 200)
    chargeCredits(db, uid, 35, 'gen1')
    expect(refundCredits(db, uid, 'gen1')).toBe(35)
    // Forced code path bypassing the app-level guard: a direct duplicate
    // insert must hit the unique index and raise.
    expect(() =>
      db
        .insert(creditTransaction)
        .values({
          id: 'dupe-refund',
          userId: uid,
          amount: 35,
          kind: 'refund',
          generationId: 'gen1',
          createdAt: new Date(),
        })
        .run(),
    ).toThrow(/UNIQUE/)
    // The app-level guard on top stays SILENT (no throw, no double credit).
    expect(refundCredits(db, uid, 'gen1')).toBe(0)
    expect(balance(db, uid)).toBe(200)
  })

  it('leaves NULL generation_ids unconstrained — multiple signup bonuses coexist', () => {
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    grantSignupBonus(db, uid, 200)
    expect(() => grantSignupBonus(db, uid, 5)).not.toThrow()
    expect(balance(db, uid)).toBe(205)
  })

  it('boot survives legacy duplicate rows — index skipped with a warning, guard still holds', () => {
    // A pre-index database that already violates the invariant must not brick
    // the boot: CREATE UNIQUE INDEX would throw, so client.ts wraps it in a
    // try + warn and continues on the app-level guard alone.
    const dir = mkdtempSync(join(tmpdir(), 'oc-legacy-db-'))
    const path = join(dir, 'legacy.db')
    const legacy = new Database(path)
    legacy.exec(DDL) // tables only — the unique index is NOT part of the base DDL
    legacy.exec(
      "INSERT INTO user (id, email, email_verified, created_at, updated_at, credits_balance)" +
        " VALUES ('u1', 'u1@x.co', 0, 0, 0, 270)",
    )
    legacy.exec(
      "INSERT INTO credit_transaction (id, user_id, amount, kind, generation_id, created_at)" +
        " VALUES ('t1', 'u1', 35, 'refund', 'gen1', 0), ('t2', 'u1', 35, 'refund', 'gen1', 0)",
    )
    legacy.close()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      let opened!: ReturnType<typeof createDb>
      expect(() => (opened = createDb(path))).not.toThrow()
      const indexes = opened.sqlite.pragma("index_list('credit_transaction')") as Array<{
        name: string
      }>
      expect(indexes.map((i) => i.name)).not.toContain('idx_credit_tx_generation_kind')
      expect(warn).toHaveBeenCalled()
      // The transactional app-level guard still refuses a second refund.
      expect(refundCredits(opened.db, 'u1', 'gen1')).toBe(0)
      opened.sqlite.close()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('GET /api/credits/transactions', () => {
  it('without session → 401 envelope', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/credits/transactions' })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('unauthorized')
  })
  it('returns the signup bonus transaction for a fresh user', async () => {
    const app = await buildTestApp()
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: 'tx@b.co', password: 'password123', name: 'Tx' },
    })
    const cookie = String(signUp.headers['set-cookie'])
    const res = await app.inject({
      method: 'GET',
      url: '/api/credits/transactions',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      items: {
        id: string
        amount: number
        kind: string
        generationId: string | null
        createdAt: string
      }[]
    }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ amount: 200, kind: 'signup_bonus', generationId: null })
    expect(typeof body.items[0]?.createdAt).toBe('string')
  })
})
