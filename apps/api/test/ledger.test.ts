import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/client'
import {
  chargeCredits,
  grantSignupBonus,
  refundCredits,
  InsufficientCreditsError,
} from '../src/modules/credits/ledger'
import { user } from '../src/db/schema'
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
