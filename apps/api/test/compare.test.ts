// HTTP tests for POST /api/compare/generate (hidden /compare utility). The
// provider itself is unit-tested in deepinfra-image.test.ts; here we pin the
// route's boundary behavior: auth, validation, the unconfigured-token 502, the
// success envelope, and — because this endpoint bypasses the credit ledger by
// design — that a call never touches the caller's balance.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/compare/generate', () => {
  it('requires a session', async () => {
    const app = await buildTestApp({ deepinfraToken: 'di-key' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/generate',
      payload: { prompt: 'a cat' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects an invalid prompt with the validation envelope', async () => {
    const app = await buildTestApp({ deepinfraToken: 'di-key' })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/generate',
      headers: { cookie },
      payload: { prompt: 'x' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })

  it('answers 502 provider_error when DEEPINFRA_TOKEN is unset (boot stays healthy)', async () => {
    const app = await buildTestApp() // deepinfraToken defaults to null
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/generate',
      headers: { cookie },
      payload: { prompt: 'a cat' },
    })
    expect(res.statusCode).toBe(502)
    expect(res.json().error.code).toBe('provider_error')
  })

  it('returns imageUrl + costUsd + durationMs on success and charges NOTHING', async () => {
    // The route calls the real generateQwenImage, which defaults to global
    // fetch — stub it; app.inject never uses fetch, so this only intercepts
    // the outbound DeepInfra call.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ images: [DATA_URL], inference_status: { cost: 0.075 } }),
          { status: 200 },
        ),
      ),
    )
    const app = await buildTestApp({ deepinfraToken: 'di-key' })
    const cookie = await registerAndGetCookie(app)

    const before = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json() as {
      credits: number
    }

    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/generate',
      headers: { cookie },
      payload: { prompt: 'a cat wearing a hat' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { imageUrl: string; costUsd: number; durationMs: number }
    expect(body.imageUrl).toBe(DATA_URL)
    expect(body.costUsd).toBe(0.075)
    expect(body.durationMs).toBeGreaterThanOrEqual(0)

    // The whole point of the ledger bypass: an evaluation render must never
    // spend user credits.
    const after = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json() as {
      credits: number
    }
    expect(after.credits).toBe(before.credits)
  })

  it('maps a provider failure to the sanitized 502 envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: 'account has no balance' }), { status: 402 }),
      ),
    )
    const app = await buildTestApp({ deepinfraToken: 'di-key' })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/generate',
      headers: { cookie },
      payload: { prompt: 'a cat' },
    })
    expect(res.statusCode).toBe(502)
    const envelope = res.json() as { error: { code: string; message: string } }
    expect(envelope.error.code).toBe('provider_error')
    // The upstream's own words (which can name an account/balance) never
    // reach the browser.
    expect(envelope.error.message).not.toContain('balance')
  })
})
