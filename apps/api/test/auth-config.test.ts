// Behavior: GET /api/auth/config is the PUBLIC, runtime source of truth for
// which optional auth providers this deployment has enabled. The SPA reads it to
// decide whether to render the Google button — so it can never drift from the
// server's actual config (ADR google-oauth). Google is enabled iff BOTH creds
// are set (the same pair better-auth's provider gates on).
import { describe, expect, it } from 'vitest'
import { buildTestApp } from './helpers/build-test-app'

describe('GET /api/auth/config', () => {
  it('reports googleEnabled:false when Google is not configured', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ googleEnabled: false })
    await app.close()
  })

  it('reports googleEnabled:true when both Google creds are set', async () => {
    const app = await buildTestApp({ googleClientId: 'gid', googleClientSecret: 'gsecret' })
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ googleEnabled: true })
    await app.close()
  })

  it('reports googleEnabled:false when only one cred is set', async () => {
    const app = await buildTestApp({ googleClientId: 'gid' })
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' })
    expect(res.json()).toEqual({ googleEnabled: false })
    await app.close()
  })

  it('is public — no session required', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' })
    expect(res.statusCode).not.toBe(401)
    await app.close()
  })
})
