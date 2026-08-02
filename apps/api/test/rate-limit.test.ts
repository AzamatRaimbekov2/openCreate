// Rate limiting (ops hardening Task 4). Global sane default (300/min per IP)
// plus strict buckets on the abuse-prone endpoints: /api/auth/* (credential
// stuffing) and POST /api/generations (each call spends provider money).
// 429s use the shared ApiError envelope with the stable 'rate_limited' code.
import { describe, expect, it } from 'vitest'
import { apiErrorSchema } from '@opencreate/contracts'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'

describe('rate limiting', () => {
  it('applies a global limit to every route (limit headers present)', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-ratelimit-limit']).toBe('300')
  })

  it('auth endpoints are strictly limited: the 11th attempt in a minute gets 429', async () => {
    const app = await buildTestApp()
    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        payload: { email: 'nobody@example.com', password: 'wrong-password' },
      })
    for (let i = 0; i < 10; i++) {
      const res = await attempt()
      // Wrong credentials → auth error, but NOT rate limited yet.
      expect(res.statusCode).not.toBe(429)
    }
    const blocked = await attempt()
    expect(blocked.statusCode).toBe(429)
    const body = blocked.json()
    expect(body.error.code).toBe('rate_limited')
    // The 429 body must be a valid shared ApiError envelope.
    expect(() => apiErrorSchema.parse(body)).not.toThrow()
  })

  it('auth session reads (GET) are not starved by the strict sign-in bucket', async () => {
    const app = await buildTestApp()
    // The SPA polls get-session on every route change / window focus. Well above
    // the strict POST bucket of 10 — reads only consume the global 300.
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({ method: 'GET', url: '/api/auth/get-session' })
      expect(res.statusCode).toBe(200)
    }
    // And the read traffic must NOT have consumed the sign-in budget: the very
    // next credential attempt still reaches the auth handler (not 429).
    const signInRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: 'nobody@example.com', password: 'wrong-password' },
    })
    expect(signInRes.statusCode).not.toBe(429)
  })

  it('POST /api/generations is strictly limited: the 21st submit in a minute gets 429', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const submit = () =>
      app.inject({
        method: 'POST',
        url: '/api/generations',
        headers: { cookie },
        // Invalid body on purpose: counts against the bucket (the limiter runs
        // before the handler) without spending credits or provider calls.
        payload: { nope: true },
      })
    for (let i = 0; i < 20; i++) {
      const res = await submit()
      expect(res.statusCode).toBe(400)
    }
    const blocked = await submit()
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().error.code).toBe('rate_limited')
  })

  // trustProxy (review finding): production runs behind a reverse proxy
  // (PROD.md) that forwards everyone from 127.0.0.1 — without trustProxy every
  // user shares ONE bucket per limit (an attacker's 10 cheap auth requests/min
  // lock ALL users out of sign-in). With TRUST_PROXY set, req.ip comes from
  // X-Forwarded-For, so buckets are per real client again.
  it('with trustProxy enabled, rate-limit buckets are per forwarded client, not per socket', async () => {
    const app = await buildTestApp({ trustProxy: true })
    const attempt = (forwardedFor: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { 'x-forwarded-for': forwardedFor },
        payload: { email: 'nobody@example.com', password: 'wrong-password' },
      })
    // The attacker exhausts THEIR bucket…
    for (let i = 0; i < 10; i++) {
      const res = await attempt('203.0.113.9')
      expect(res.statusCode).not.toBe(429)
    }
    expect((await attempt('203.0.113.9')).statusCode).toBe(429)
    // …while a different forwarded client is untouched (no auth-lockout DoS).
    expect((await attempt('198.51.100.7')).statusCode).not.toBe(429)
  })

  it('without trustProxy (default), X-Forwarded-For is ignored — a forged header cannot reset buckets', async () => {
    const app = await buildTestApp()
    const attempt = (forwardedFor: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { 'x-forwarded-for': forwardedFor },
        payload: { email: 'nobody@example.com', password: 'wrong-password' },
      })
    // Ten "different clients" by header only — all land in the ONE socket
    // bucket, so the 11th is blocked no matter what the header claims.
    for (let i = 0; i < 10; i++) await attempt(`203.0.113.${i}`)
    expect((await attempt('198.51.100.7')).statusCode).toBe(429)
  })

  it('the strict generations bucket does not throttle reads (list/get)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    // Well above the write bucket of 20 — reads only consume the global 300.
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({ method: 'GET', url: '/api/generations', headers: { cookie } })
      expect(res.statusCode).toBe(200)
    }
  })
})
