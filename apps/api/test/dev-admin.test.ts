// Dev-only super-admin seed (owner request, 2026-07-16): admin@dev.local /
// "admin" must exist and sign in ONLY when the API runs in development.
// The password is shorter than better-auth's 8-char signup minimum on purpose —
// the seed writes the credential hash directly (it never passes through
// sign-up), and better-auth 1.6 validates minPasswordLength on sign-up /
// change-password / reset-password but NOT on sign-in, which is what makes a
// 5-char dev password loggable-in at all.
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb } from '../src/db/client'
import { user } from '../src/db/schema'
import { DEV_ADMIN_CREDITS, DEV_ADMIN_EMAIL } from '../src/modules/auth/dev-admin'
import { buildTestApp } from './helpers/build-test-app'

const signInAdmin = (app: Awaited<ReturnType<typeof buildTestApp>>) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email: 'admin@dev.local', password: 'admin' },
  })

describe('dev super-admin seed', () => {
  it('development boot seeds admin@dev.local/admin with the super_admin role', async () => {
    const app = await buildTestApp({ nodeEnv: 'development' })
    const res = await signInAdmin(app)
    expect(res.statusCode).toBe(200)
    // The role must surface on the auth user object (additionalFields), so the
    // SPA and future admin gates can read it off the session.
    expect(res.json().user.role).toBe('super_admin')
  })

  it('grants an effectively-unlimited balance so the dev admin never runs out (owner request)', async () => {
    // The dev admin exists to exercise money paths without ever hitting a wall,
    // so it is topped up to DEV_ADMIN_CREDITS regardless of the configured
    // real-user signup bonus (123 here) — that bonus is for real sign-ups only.
    const app = await buildTestApp({ nodeEnv: 'development', signupBonusCredits: 123 })
    const res = await signInAdmin(app)
    expect(res.statusCode).toBe(200)
    expect(res.json().user.creditsBalance).toBeGreaterThanOrEqual(DEV_ADMIN_CREDITS)
  })

  it('replenishes the balance back up to the floor on every boot (self-refill after spend)', async () => {
    // "Infinite" is delivered as a huge floor that each boot tops back up — a
    // dev session that spent credits gets them back on the next restart, and a
    // balance can never strand the admin below the floor.
    const { db } = createDb(':memory:')
    await buildTestApp({ nodeEnv: 'development', db })
    // Simulate a dev session spending the admin down well below the floor.
    db.update(user).set({ creditsBalance: 42 }).where(eq(user.email, DEV_ADMIN_EMAIL)).run()
    await buildTestApp({ nodeEnv: 'development', db })
    const admin = db.select().from(user).where(eq(user.email, DEV_ADMIN_EMAIL)).get()
    expect(admin?.creditsBalance).toBeGreaterThanOrEqual(DEV_ADMIN_CREDITS)
  })

  it('does not grow unbounded across boots when nothing was spent', async () => {
    // The top-up grants only the DIFFERENCE to reach the floor, so an untouched
    // admin sits exactly at the floor rather than climbing by a floor each boot.
    const { db } = createDb(':memory:')
    await buildTestApp({ nodeEnv: 'development', db })
    await buildTestApp({ nodeEnv: 'development', db })
    const admin = db.select().from(user).where(eq(user.email, DEV_ADMIN_EMAIL)).get()
    expect(admin?.creditsBalance).toBe(DEV_ADMIN_CREDITS)
  })

  it('does NOT exist outside development (default test env)', async () => {
    const app = await buildTestApp()
    const res = await signInAdmin(app)
    expect(res.statusCode).toBe(401)
  })

  it('does NOT exist in production', async () => {
    const app = await buildTestApp({ nodeEnv: 'production' })
    const res = await signInAdmin(app)
    expect(res.statusCode).toBe(401)
  })

  it('is idempotent: a second boot over the same db keeps exactly one admin row', async () => {
    const { db } = createDb(':memory:')
    await buildTestApp({ nodeEnv: 'development', db })
    const app2 = await buildTestApp({ nodeEnv: 'development', db })
    const rows = db.select().from(user).all()
    expect(rows.filter((r) => r.email === 'admin@dev.local')).toHaveLength(1)
    // And the seeded credential still signs in after the second boot.
    const res = await signInAdmin(app2)
    expect(res.statusCode).toBe(200)
  })
})
