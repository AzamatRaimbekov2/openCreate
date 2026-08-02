// apps/api/test/failover-e2e.test.ts
// The chain through the WHOLE stack — not the wrapper in isolation, but a real
// POST /api/generations whose first backend is dead.
//
// The unit tests prove the wrapper picks the right link. These prove the thing that
// actually matters: that the SERVICE, the LEDGER and the SPA never find out. One
// charge, one 202, one poll, one asset — with a dead provider in the middle of it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'
import { createFailoverProvider } from '../src/integrations/failover-provider'
import type { VideoProvider } from '../src/integrations/video-provider'

// The settle path DOWNLOADS the finished asset into our storage (provider URLs
// expire), so a test that reaches 'succeeded' would otherwise hit the network.
// Same stub the other routing tests use.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })))
})

const fake = () =>
  ({ submit: vi.fn(), poll: vi.fn() }) as unknown as VideoProvider & {
    submit: ReturnType<typeof vi.fn>
    poll: ReturnType<typeof vi.fn>
  }

// The exact shape a real adapter throws when it cannot TAKE a job: ArkError,
// DashscopeError and DeepinfraError all carry BOTH an apiCode and a 502. A fake
// that carried only the code would let a broken chain answer 500 and still pass.
const infra = () =>
  Object.assign(new Error('out of balance'), { apiCode: 'provider_error', statusCode: 502 })

describe('failover — through the real generation lifecycle', () => {
  it('a dead first backend is invisible: one charge, one 202, the video arrives', async () => {
    const dead = fake()
    const alive = fake()
    dead.submit.mockRejectedValue(infra())
    alive.submit.mockResolvedValue({ providerJobId: 'cgt-1' })
    alive.poll
      .mockResolvedValueOnce({ status: 'processing', progress: null })
      .mockResolvedValueOnce({
        status: 'success',
        assetUrl: 'https://deepinfra.com/model/inference/x.mp4',
        costUsd: 0.756,
      })

    const app = await buildTestApp({
      videoProviders: {
        segmind: createFailoverProvider([
          { id: 'segmind', provider: dead },
          { id: 'bytedance', provider: alive },
        ]),
      },
      segmindApiKey: 'sg-key',
      assetHostAllowlist: ['runware.ai', 'deepinfra.com'],
    })
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'seedance-2-0', prompt: 'a fox', aspectRatio: '16:9', duration: 5 },
    })

    // The user's experience is UNCHANGED. They asked for Auteur and got a 202.
    expect(created.statusCode).toBe(202)
    const id = created.json().id

    expect(dead.submit).toHaveBeenCalledTimes(1)
    expect(alive.submit).toHaveBeenCalledTimes(1)

    await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    const done = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(done.json().status).toBe('succeeded')
    expect(done.json().mediaUrls[0]).toMatch(/\.mp4$/)

    // The poll found its way back to the backend that ACCEPTED the job — the id it
    // was persisted with carries the link, so a restart between submit and poll
    // could not have sent it to the dead one.
    expect(alive.poll).toHaveBeenCalledWith('cgt-1')
    expect(dead.poll).not.toHaveBeenCalled()

    // ONE charge. 200 (signup bonus) − 130 (seedance-2-0 @ 5s) = 70. A chain that
    // charged per attempt would read 200 − 260 here, and that is the whole reason
    // failover lives BELOW the money path rather than above it.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(70)
  })

  it('every backend down = one ordinary provider_error, charged once and refunded once', async () => {
    const a = fake()
    const b = fake()
    a.submit.mockRejectedValue(infra())
    b.submit.mockRejectedValue(infra())

    const app = await buildTestApp({
      videoProviders: {
        segmind: createFailoverProvider([
          { id: 'segmind', provider: a },
          { id: 'bytedance', provider: b },
        ]),
      },
      segmindApiKey: 'sg-key',
    })
    const cookie = await registerAndGetCookie(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'seedance-2-0', prompt: 'a fox', aspectRatio: '16:9', duration: 5 },
    })

    // A chain that fails must fail like ONE provider — the service already knows how
    // to settle and refund that, and nobody had to write a new branch for it.
    expect(res.statusCode).toBe(502)
    expect(res.json().error.code).toBe('provider_error')

    // Charged 130, refunded 130 → back to the signup bonus. The money invariant
    // survives an outage of the entire chain.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })
})
