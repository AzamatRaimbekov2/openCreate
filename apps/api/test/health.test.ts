import { describe, expect, it } from 'vitest'
import { buildTestApp } from './helpers/build-test-app'

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })
})
