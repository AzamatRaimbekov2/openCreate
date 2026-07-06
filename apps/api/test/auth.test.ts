import { describe, expect, it } from 'vitest'
import { buildTestApp } from './helpers/build-test-app'

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
})
