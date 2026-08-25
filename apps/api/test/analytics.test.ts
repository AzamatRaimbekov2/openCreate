// Analytics read model + admin authorization (ADR: docs/wiki/decisions/analytics.md).
//
// The interesting assertions here are all about REFUSING TO GUESS: a success rate
// over zero settled jobs is null and not 0%, a margin without a configured credit
// price is null and not $0, and a provider that reports no cost is counted in its
// own column instead of being summed in as zero. Each of those is a number an
// operator would make a decision on, so each is tested as behaviour.
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb } from '../src/db/client'
import { creditTransaction, generation, user } from '../src/db/schema'
import { buildTestApp } from './helpers/build-test-app'

const ADMIN = { email: 'owner@example.com', password: 'a-long-enough-passphrase-01' }

type App = Awaited<ReturnType<typeof buildTestApp>>
type Db = ReturnType<typeof createDb>['db']

async function cookieFor(app: App, payload: { email: string; password: string }) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload })
  expect(res.statusCode).toBe(200)
  const raw = res.headers['set-cookie']
  return (Array.isArray(raw) ? raw : [raw ?? '']).map((c) => c.split(';')[0]).join('; ')
}

async function registerUser(app: App, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email, password: 'a-long-enough-passphrase-02', name: 'Test' },
  })
  expect(res.statusCode).toBe(200)
  return res.json().user.id as string
}

let seq = 0
// Writes the row shape the money path itself writes, so the read model is
// exercised against real column semantics — notably runwareCostUsd as TEXT and
// NULL for a provider that reports no figure.
function seedGeneration(
  db: Db,
  o: {
    userId: string
    status: 'processing' | 'succeeded' | 'failed'
    modelId?: string
    provider?: string
    type?: 'image' | 'video' | 'audio' | 'model3d'
    costCredits?: number
    costUsd?: string | null
    ageMinutes?: number
    durationMs?: number
  },
) {
  const id = `gen-${++seq}`
  const createdAt = new Date(Date.now() - (o.ageMinutes ?? 1) * 60_000)
  const settled = o.status !== 'processing'
  db.insert(generation)
    .values({
      id,
      userId: o.userId,
      type: o.type ?? 'video',
      mode: 'text',
      status: o.status,
      prompt: 'p',
      modelId: o.modelId ?? 'seedance-1-5-pro',
      paramsJson: '{}',
      costCredits: o.costCredits ?? 10,
      provider: o.provider ?? 'kie',
      runwareCostUsd: o.costUsd === undefined ? '0.25' : o.costUsd,
      mediaJson: '[]',
      createdAt,
      completedAt: settled ? new Date(createdAt.getTime() + (o.durationMs ?? 30_000)) : null,
    })
    .run()
  return id
}

function seedLedger(db: Db, userId: string, kind: 'charge' | 'refund', amount: number, generationId: string) {
  db.insert(creditTransaction)
    .values({
      id: `tx-${++seq}`,
      userId,
      amount,
      kind,
      generationId,
      createdAt: new Date(Date.now() - 60_000),
    })
    .run()
}

// One admin app plus a handle on its db, which is what every money/health test
// needs before it can assert on anything.
async function adminApp(overrides: Record<string, unknown> = {}) {
  const db = createDb(':memory:').db
  const app = await buildTestApp({ nodeEnv: 'production', superAdmin: ADMIN, db, ...overrides })
  const cookie = await cookieFor(app, ADMIN)
  const adminId = db.select({ id: user.id }).from(user).where(eq(user.email, ADMIN.email)).get()!.id
  return { app, db, cookie, adminId }
}

const get = (app: App, url: string, cookie?: string) =>
  app.inject({ method: 'GET', url, ...(cookie ? { headers: { cookie } } : {}) })

// ─── Authorization ───────────────────────────────────────────────────────────

describe('admin analytics authorization', () => {
  const ADMIN_ROUTES = [
    '/api/admin/analytics/health',
    '/api/admin/analytics/money',
    '/api/admin/analytics/users',
  ]

  it('refuses an anonymous caller with 401 on every admin route', async () => {
    const { app } = await adminApp()
    for (const url of ADMIN_ROUTES) {
      expect((await get(app, url)).statusCode).toBe(401)
    }
  })

  it('refuses a signed-in ordinary user with 403 on every admin route', async () => {
    // The whole point of the feature is that one account can read every other
    // user's spend. If this test ever goes green for a plain user, the dashboard
    // has become a data leak.
    const { app } = await adminApp()
    await registerUser(app, 'plain@example.com')
    const cookie = await cookieFor(app, { email: 'plain@example.com', password: 'a-long-enough-passphrase-02' })
    for (const url of ADMIN_ROUTES) {
      const res = await get(app, url, cookie)
      expect(res.statusCode).toBe(403)
      // 403, not 401: an SPA that conflates them bounces the caller to a login
      // screen they are already past, forever.
      expect(res.json().error.code).toBe('forbidden')
    }
  })

  it('admits the super_admin', async () => {
    const { app, cookie } = await adminApp()
    for (const url of ADMIN_ROUTES) {
      expect((await get(app, url, cookie)).statusCode).toBe(200)
    }
  })

  it('revoking the role takes effect on the NEXT request, mid-session', async () => {
    // This is the whole reason the guard reads user.role from the DATABASE
    // instead of a claim carried in the session (ADR §2). The cookie below stays
    // valid the entire time — only the row changes.
    const { app, db, cookie, adminId } = await adminApp()
    expect((await get(app, '/api/admin/analytics/money', cookie)).statusCode).toBe(200)

    db.update(user).set({ role: 'user' }).where(eq(user.id, adminId)).run()

    expect((await get(app, '/api/admin/analytics/money', cookie)).statusCode).toBe(403)
  })
})

// ─── Health ──────────────────────────────────────────────────────────────────

describe('health read model', () => {
  it('reports success rate as NULL when nothing settled, not 0%', async () => {
    // An idle window has an unknown success rate. Rendering 0% paints a healthy
    // system red and sends the operator hunting for a fault that isn't there.
    const { app, db, cookie, adminId } = await adminApp()
    seedGeneration(db, { userId: adminId, status: 'processing' })

    const body = (await get(app, '/api/admin/analytics/health', cookie)).json()
    expect(body.generations.processing).toBe(1)
    expect(body.generations.successRate).toBeNull()
  })

  it('computes the success rate over SETTLED jobs only', async () => {
    const { app, db, cookie, adminId } = await adminApp()
    seedGeneration(db, { userId: adminId, status: 'succeeded' })
    seedGeneration(db, { userId: adminId, status: 'succeeded' })
    seedGeneration(db, { userId: adminId, status: 'failed' })
    // In flight, and therefore not yet evidence of anything.
    seedGeneration(db, { userId: adminId, status: 'processing' })

    const body = (await get(app, '/api/admin/analytics/health', cookie)).json()
    expect(body.generations.successRate).toBeCloseTo(2 / 3)
    expect(body.generations.total).toBe(4)
  })

  it('sorts the model breakdown worst-first so a failing model is never below the fold', async () => {
    const { app, db, cookie, adminId } = await adminApp()
    for (let i = 0; i < 4; i++) seedGeneration(db, { userId: adminId, status: 'succeeded', modelId: 'healthy' })
    seedGeneration(db, { userId: adminId, status: 'failed', modelId: 'broken' })

    const body = (await get(app, '/api/admin/analytics/health', cookie)).json()
    expect(body.byModel[0].modelId).toBe('broken')
    expect(body.byModel[0].successRate).toBe(0)
  })

  it('surfaces a job stranded OUTSIDE the window — old stuck jobs are the ones that matter', async () => {
    // A 7-day filter that hides a three-week-old stranded generation is how it
    // stays stranded, and it may still owe the user a refund.
    const { app, db, cookie, adminId } = await adminApp()
    seedGeneration(db, { userId: adminId, status: 'processing', ageMinutes: 30 * 24 * 60 })

    const body = (await get(app, '/api/admin/analytics/health?days=1', cookie)).json()
    expect(body.stuck).toHaveLength(1)
    expect(body.stuck[0].ageMinutes).toBeGreaterThan(60)
  })

  it('does not call a freshly-submitted job stuck', async () => {
    const { app, db, cookie, adminId } = await adminApp()
    seedGeneration(db, { userId: adminId, status: 'processing', ageMinutes: 2 })

    expect((await get(app, '/api/admin/analytics/health', cookie)).json().stuck).toHaveLength(0)
  })

  it('reports the MEDIAN duration, which one stranded outlier cannot drag', async () => {
    const { app, db, cookie, adminId } = await adminApp()
    for (const ms of [1000, 2000, 3000, 4000, 3_600_000]) {
      seedGeneration(db, { userId: adminId, status: 'succeeded', modelId: 'm', durationMs: ms })
    }
    const body = (await get(app, '/api/admin/analytics/health', cookie)).json()
    const row = body.byModel.find((r: { modelId: string }) => r.modelId === 'm')
    // Median is 3000. The mean would be ~722_000 — off by 240x, and describing a
    // wait no user in this sample actually experienced.
    expect(row.medianDurationMs).toBe(3000)
  })
})

// ─── Money ───────────────────────────────────────────────────────────────────

describe('money read model', () => {
  it('reports margin as NULL, not zero, when no credit price is configured', async () => {
    // "$0.00 margin" and "we cannot compute margin" must never render the same:
    // the first invites a pricing decision, the second forbids one (ADR §4).
    const { app, db, cookie, adminId } = await adminApp()
    seedGeneration(db, { userId: adminId, status: 'succeeded', costUsd: '0.50' })
    seedLedger(db, adminId, 'charge', -100, 'gen-x')

    const m = (await get(app, '/api/admin/analytics/money', cookie)).json().margin
    expect(m.creditPriceUsd).toBeNull()
    expect(m.revenueUsd).toBeNull()
    expect(m.marginUsd).toBeNull()
    expect(m.marginPercent).toBeNull()
  })

  it('computes revenue and margin from the configured credit price', async () => {
    const { app, db, cookie, adminId } = await adminApp({ creditPriceUsd: 0.02 })
    seedGeneration(db, { userId: adminId, status: 'succeeded', costUsd: '0.50' })
    seedLedger(db, adminId, 'charge', -100, 'gen-y')

    const body = (await get(app, '/api/admin/analytics/money', cookie)).json()
    expect(body.creditsCharged).toBe(100)
    expect(body.cost.billedUsd).toBe(0.5)
    // 100 credits × $0.02 = $2.00 revenue, minus $0.50 billed = $1.50.
    expect(body.margin.revenueUsd).toBe(2)
    expect(body.margin.marginUsd).toBe(1.5)
    expect(body.margin.marginPercent).toBe(75)
  })

  it('subtracts refunds from revenue, so a failing provider cannot look profitable', async () => {
    // A refunded generation charged the user and gave it back. If the refund did
    // not net out, a provider that fails half its jobs would read as pure margin.
    const { app, db, cookie, adminId } = await adminApp({ creditPriceUsd: 0.02 })
    seedLedger(db, adminId, 'charge', -100, 'gen-a')
    seedLedger(db, adminId, 'refund', 100, 'gen-a')

    const body = (await get(app, '/api/admin/analytics/money', cookie)).json()
    expect(body.creditsCharged).toBe(100)
    expect(body.creditsRefunded).toBe(100)
    expect(body.creditsNet).toBe(0)
    expect(body.margin.revenueUsd).toBe(0)
    // Zero revenue is an idle window, not a 0% margin — and the division would be
    // Infinity, which JSON cannot carry at all.
    expect(body.margin.marginPercent).toBeNull()
  })

  it('counts a provider that reports NO cost separately instead of summing it as zero', async () => {
    // Segmind reports no billed figure and its adapter refuses to invent one.
    // The gap must be VISIBLE next to the total, or the operator reads a number
    // that is short by whatever Segmind cost and cannot tell (ADR §3).
    const { app, db, cookie, adminId } = await adminApp()
    seedGeneration(db, { userId: adminId, status: 'succeeded', provider: 'kie', costUsd: '0.40' })
    seedGeneration(db, { userId: adminId, status: 'succeeded', provider: 'segmind', costUsd: null })

    const cost = (await get(app, '/api/admin/analytics/money', cookie)).json().cost
    expect(cost.billedUsd).toBe(0.4)
    expect(cost.pricedCount).toBe(1)
    expect(cost.unpricedCount).toBe(1)
  })

  it('does not count an in-flight generation as unpriced', async () => {
    // A processing job has been charged but not yet billed. Counting it as a gap
    // reports a permanent hole that closes by itself in ninety seconds.
    const { app, db, cookie, adminId } = await adminApp()
    seedGeneration(db, { userId: adminId, status: 'processing', costUsd: null })

    const cost = (await get(app, '/api/admin/analytics/money', cookie)).json().cost
    expect(cost.unpricedCount).toBe(0)
  })

  it('excludes rows older than the window', async () => {
    const { app, db, cookie, adminId } = await adminApp()
    seedGeneration(db, { userId: adminId, status: 'succeeded', costUsd: '9.99', ageMinutes: 60 * 24 * 30 })

    const cost = (await get(app, '/api/admin/analytics/money?days=7', cookie)).json().cost
    expect(cost.billedUsd).toBe(0)
  })
})

// ─── Personal usage ──────────────────────────────────────────────────────────

describe('personal usage', () => {
  it('scopes to the caller and never leaks another user’s generations', async () => {
    const { app, db, cookie: adminCookie, adminId } = await adminApp()
    const otherId = await registerUser(app, 'other@example.com')
    const otherCookie = await cookieFor(app, {
      email: 'other@example.com',
      password: 'a-long-enough-passphrase-02',
    })
    seedGeneration(db, { userId: adminId, status: 'succeeded' })
    seedGeneration(db, { userId: adminId, status: 'succeeded' })
    seedGeneration(db, { userId: otherId, status: 'succeeded' })

    expect((await get(app, '/api/me/usage', adminCookie)).json().generations.total).toBe(2)
    expect((await get(app, '/api/me/usage', otherCookie)).json().generations.total).toBe(1)
  })

  it('carries CREDITS ONLY — no provider cost, no margin, no billed USD', async () => {
    // The guarantee is structural (the MeUsage contract has nowhere to put it),
    // and this asserts the structure rather than trusting the comment. A user must
    // not learn our cost basis, and this is the endpoint they can actually call.
    const { app, db, cookie, adminId } = await adminApp({ creditPriceUsd: 0.02 })
    seedGeneration(db, { userId: adminId, status: 'succeeded', costUsd: '7.77' })

    const body = (await get(app, '/api/me/usage', cookie)).json()
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('7.77')
    expect(serialized.toLowerCase()).not.toContain('usd')
    expect(serialized).not.toContain('margin')
    expect(body.creditsNet).toBeTypeOf('number')
  })

  it('requires a session', async () => {
    const { app } = await adminApp()
    expect((await get(app, '/api/me/usage')).statusCode).toBe(401)
  })
})

// ─── Window parsing ──────────────────────────────────────────────────────────

describe('window parameter', () => {
  it('defaults to 7 days', async () => {
    const { app, cookie } = await adminApp()
    expect((await get(app, '/api/admin/analytics/health', cookie)).json().windowDays).toBe(7)
  })

  it('rejects a window outside 1..365 rather than scanning the whole table', async () => {
    const { app, cookie } = await adminApp()
    expect((await get(app, '/api/admin/analytics/health?days=0', cookie)).statusCode).toBe(400)
    expect((await get(app, '/api/admin/analytics/health?days=9999', cookie)).statusCode).toBe(400)
  })
})
