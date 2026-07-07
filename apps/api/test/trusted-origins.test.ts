// Cookie/session prod settings (ops hardening Task 6): better-auth's
// trustedOrigins come from config (TRUSTED_ORIGINS env comma list, default
// [WEB_ORIGIN]). better-auth rejects state-changing requests whose Origin
// header is not trusted — the CSRF wall for cookie sessions.
import { describe, expect, it } from 'vitest'
import { buildTestApp } from './helpers/build-test-app'

// better-auth only enforces the origin check when the request carries cookies
// (validateOrigin: `if (!(forceValidate || useCookies)) return`) — CSRF is a
// cookie-session attack. Browsers always attach cookies to the API origin, so
// a bare `x=1` cookie reproduces the real-world request shape.
const signUp = (app: Awaited<ReturnType<typeof buildTestApp>>, origin: string) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin, cookie: 'x=1' },
    payload: { email: 'a@b.co', password: 'password123', name: 'A' },
  })

describe('trusted origins', () => {
  it('rejects auth POSTs from an untrusted origin', async () => {
    const app = await buildTestApp()
    const res = await signUp(app, 'http://evil.example')
    expect(res.statusCode).toBe(403)
  })

  it('accepts auth POSTs from the default web origin', async () => {
    const app = await buildTestApp()
    const res = await signUp(app, 'http://localhost:5173')
    expect(res.statusCode).toBe(200)
  })

  it('accepts auth POSTs from an origin added via config', async () => {
    const app = await buildTestApp({ trustedOrigins: ['https://partner.example'] })
    const res = await signUp(app, 'https://partner.example')
    expect(res.statusCode).toBe(200)
  })
})
