// Structured logging (ops hardening Task 2). The app logger is pino via
// Fastify: level from config (LOG_LEVEL, silent in tests), authorization /
// cookie headers redacted, and every request-scoped line carries a reqId.
// Money-path events (signup bonus, charge, refund, settle, provider errors)
// must emit structured entries so a support question ("where did my credits
// go?") is answerable from logs alone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

// pino writes NDJSON — one parseable object per line.
function captureStream() {
  const lines: Record<string, unknown>[] = []
  return {
    lines,
    stream: {
      write: (msg: string) => {
        lines.push(JSON.parse(msg) as Record<string, unknown>)
      },
    },
  }
}

describe('structured logging', () => {
  it('logs signup bonus, charge and settle events for a successful image generation', async () => {
    const { lines, stream } = captureStream()
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({
      imageURL: 'https://im.runware.ai/a.webp',
      cost: 0.002,
      seed: 1,
      NSFWContent: false,
    })
    const app = await buildTestApp({ runware: rw, logLevel: 'info', logStream: stream })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
    })
    expect(res.statusCode).toBe(201)

    const bonus = lines.find((l) => l.event === 'credits.signup_bonus')
    expect(bonus).toBeDefined()
    expect(bonus!.amount).toBe(200)

    const charge = lines.find((l) => l.event === 'credits.charge')
    expect(charge).toBeDefined()
    expect(charge!.amount).toBe(7)
    expect(charge!.generationId).toBe(res.json().id)
    // Money events are logged through the request logger → reqId correlation.
    expect(charge!.reqId).toBeDefined()

    const settle = lines.find((l) => l.event === 'generation.settle')
    expect(settle).toBeDefined()
    expect(settle!.generationId).toBe(res.json().id)
    expect(settle!.reqId).toBeDefined()
  })

  it('logs provider error, fail and refund events when the provider fails', async () => {
    const { lines, stream } = captureStream()
    const rw = fakeRunware()
    rw.imageInference.mockRejectedValue(
      Object.assign(new Error('provider down'), { apiCode: 'provider_error', statusCode: 502 }),
    )
    const app = await buildTestApp({ runware: rw, logLevel: 'info', logStream: stream })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
    })
    expect(res.statusCode).toBe(502)

    expect(lines.find((l) => l.event === 'provider.error')).toBeDefined()
    expect(lines.find((l) => l.event === 'generation.fail')).toBeDefined()
    const refund = lines.find((l) => l.event === 'credits.refund')
    expect(refund).toBeDefined()
    expect(refund!.amount).toBe(7)
    expect(refund!.reqId).toBeDefined()
  })

  it('redacts authorization and cookie headers in log lines', async () => {
    const { lines, stream } = captureStream()
    const app = await buildTestApp({ logLevel: 'info', logStream: stream })
    await app.ready()
    // Note: fastify's default `req` serializer never logs headers at all, so
    // request logs cannot leak cookies. The redact paths guard the remaining
    // vector — hand-rolled log objects that include a `headers` bag.
    app.log.info(
      { headers: { authorization: 'Bearer topsecret', cookie: 'session=hushhush' } },
      'redact probe',
    )
    const raw = JSON.stringify(lines)
    expect(raw).not.toContain('topsecret')
    expect(raw).not.toContain('hushhush')
    expect(raw).toContain('[Redacted]')
  })

  it('request logs carry a reqId', async () => {
    const { lines, stream } = captureStream()
    const app = await buildTestApp({ logLevel: 'info', logStream: stream })
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    const reqLine = lines.find((l) => l.reqId !== undefined)
    expect(reqLine).toBeDefined()
  })
})
