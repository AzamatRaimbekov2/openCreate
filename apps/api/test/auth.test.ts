import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { buildTestApp } from './helpers/build-test-app'
import { createAuth } from '../src/modules/auth/auth'
import { registerAuth } from '../src/modules/auth/plugin'
import { createDb } from '../src/db/client'
import { user } from '../src/db/schema'
import type { AppConfig } from '../src/config'
import type { Auth } from '../src/modules/auth/auth'

async function register(app: Awaited<ReturnType<typeof buildTestApp>>) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: 'a@b.co', password: 'password123', name: 'A' },
  })
  return res
}

describe('auth', () => {
  it('registers, sets session cookie, grants 200 signup credits', async () => {
    const app = await buildTestApp()
    const res = await register(app)
    expect(res.statusCode).toBe(200)
    const cookie = res.headers['set-cookie']
    expect(cookie).toBeDefined()

    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: String(cookie) },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ email: 'a@b.co', creditsBalance: 200 })
  })
  it('GET /api/me without session → 401 envelope', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/me' })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('unauthorized')
  })

  // Gap: the session is still valid but the underlying user row is gone.
  // Normally session.user_id CASCADEs on user delete, so this can only happen
  // via an out-of-band admin/migration delete that bypasses the FK (simulated
  // here by toggling the pragma) — users/routes.ts must still answer a clean
  // 404 not_found rather than a null-dereference 500 in that case.
  it('GET /api/me → 404 not_found when the session outlives its user row', async () => {
    const { db, sqlite } = createDb(':memory:')
    const app = await buildTestApp({ db })
    const res = await register(app)
    const cookie = String(res.headers['set-cookie'])
    const me = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json() as {
      id: string
    }
    sqlite.pragma('foreign_keys = OFF')
    db.delete(user).where(eq(user.id, me.id)).run()
    sqlite.pragma('foreign_keys = ON')

    const after = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(after.statusCode).toBe(404)
    expect(after.json().error.code).toBe('not_found')
  })

  it('Google may link to an existing email+password account (no local email verification exists)', () => {
    // The live bug: Google sign-in with the email of an existing password
    // account died on better-auth's error page with account_not_linked. Root
    // cause (better-auth 1.6.x oauth2/link-account): requireLocalEmailVerified
    // defaults to TRUE, and this app has NO email-verification flow — every
    // password user stays emailVerified=false forever, so linking was refused
    // for ALL of them. The instance must trust google (its emails are verified
    // by Google) and drop the local-verified wall.
    // createAuth only reads the auth-related config fields — a focused stub
    // keeps this a unit test (same cast idiom as the provider fakes).
    const { db } = createDb(':memory:')
    const auth = createAuth(db, {
      betterAuthSecret: 'test-secret-test-secret-test-secret',
      betterAuthUrl: 'http://localhost:8787',
      trustedOrigins: ['http://localhost:5173'],
      googleClientId: 'test-client-id',
      googleClientSecret: 'test-client-secret',
      signupBonusCredits: 200,
    } as unknown as AppConfig)
    expect(auth.options.account?.accountLinking).toMatchObject({
      trustedProviders: ['google'],
      requireLocalEmailVerified: false,
    })
  })
})

describe('registerAuth response bridge', () => {
  it('forwards multiple Set-Cookie headers as separate headers, not comma-joined', async () => {
    // The bug this guards: undici's Headers.forEach folds repeated headers
    // (like Set-Cookie) into one comma-joined string. plugin.ts special-cases
    // set-cookie via response.headers.getSetCookie() specifically to avoid
    // this — no test in the suite has ever driven a real multi-cookie
    // response through the bridge, since better-auth's normal sign-up/sign-in
    // flow here only ever sets one cookie.
    const fakeAuth = {
      handler: async () =>
        new Response('{}', {
          status: 200,
          headers: [
            ['set-cookie', 'session=abc; Path=/; HttpOnly'],
            ['set-cookie', 'csrf=def; Path=/'],
            ['content-type', 'application/json'],
          ],
        }),
      api: { getSession: async () => null },
    } as unknown as Auth

    const app = Fastify()
    // This test exercises the cookie bridge only; the db is reached solely by
    // requireSuperAdmin, which it never calls.
    await registerAuth(app, fakeAuth, createDb(':memory:').db)
    const res = await app.inject({ method: 'GET', url: '/api/auth/get-session' })

    const setCookie = res.headers['set-cookie']
    expect(Array.isArray(setCookie)).toBe(true)
    expect(setCookie).toHaveLength(2)
    expect(setCookie).toEqual(
      expect.arrayContaining([
        expect.stringContaining('session=abc'),
        expect.stringContaining('csrf=def'),
      ]),
    )
  })
})
