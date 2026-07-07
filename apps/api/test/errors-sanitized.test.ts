// Sanitized error responses (ops hardening Task 3). Unexpected 5xx errors —
// anything WITHOUT a stable apiCode set by a domain error — must answer with
// the generic { internal_error, 'Something went wrong' } envelope; the real
// message and stack are operator-only material and go to the logs. Known
// ApiErrors (apiCode present: insufficient_credits, provider_error, …) keep
// their client-facing messages.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

const SECRET_DETAIL = 'connect ECONNREFUSED 10.9.8.7:5432'

describe('sanitized errors', () => {
  it('unexpected 500 returns the generic envelope and never leaks the real message', async () => {
    const rw = fakeRunware()
    // A plain Error without apiCode/statusCode — e.g. a network failure deep
    // inside the provider call — must NOT surface its message to the client.
    rw.imageInference.mockRejectedValue(new Error(SECRET_DETAIL))
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
    })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({
      error: { code: 'internal_error', message: 'Something went wrong' },
    })
    expect(res.body).not.toContain('ECONNREFUSED')
  })

  it('writes the real message and stack to the logs', async () => {
    const lines: string[] = []
    const rw = fakeRunware()
    rw.imageInference.mockRejectedValue(new Error(SECRET_DETAIL))
    const app = await buildTestApp({
      runware: rw,
      logLevel: 'info',
      logStream: { write: (msg: string) => void lines.push(msg) },
    })
    const cookie = await registerAndGetCookie(app)
    await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
    })
    const raw = lines.join('')
    expect(raw).toContain('ECONNREFUSED')
    // pino's err serializer includes the stack — the operator can trace it.
    expect(raw).toContain('errors-sanitized.test.ts')
  })

  it('known ApiErrors keep their messages (insufficient credits)', async () => {
    const app = await buildTestApp({ signupBonusCredits: 0 })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
    })
    expect(res.statusCode).toBe(402)
    expect(res.json().error).toEqual({ code: 'insufficient_credits', message: 'Not enough credits' })
  })
})
