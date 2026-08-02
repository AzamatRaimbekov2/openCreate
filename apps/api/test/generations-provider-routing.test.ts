// Provider routing (ADR: wan-selfhost-video-provider). The generation service
// resolves a VideoProvider from the catalog model's `provider` for VIDEO
// submit+poll: 'wan-runpod' → our ComfyUI adapter, everything else → Runware.
// The image path is never routed and stays Runware-only. Every money-path
// invariant is unchanged — only the provider CALL is swapped behind the seam.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeVideoProvider, registerAndGetCookie } from './helpers/build-test-app'

// Success paths download the produced asset via global fetch — stub it.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

const POD = 'https://pod123-8188.proxy.runpod.net'

describe('video provider routing', () => {
  it('routes a wan-runpod model to the wan-runpod provider (never Runware) and settles', async () => {
    const runware = fakeVideoProvider()
    const wan = fakeVideoProvider()
    wan.submit.mockResolvedValue({ providerJobId: 'pid-1' })
    wan.poll
      .mockResolvedValueOnce({ status: 'processing', progress: null })
      .mockResolvedValueOnce({
        status: 'success',
        assetUrl: `${POD}/view?filename=oc_1.mp4&subfolder=&type=output`,
        nsfw: false,
      })
    const app = await buildTestApp({
      videoProviders: { runware, 'wan-runpod': wan },
      assetHostAllowlist: ['runware.ai', 'proxy.runpod.net'],
    })
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'wan-2-2', prompt: 'a red fox running', aspectRatio: '16:9', duration: 5 },
    })
    expect(created.statusCode).toBe(202)
    const id = created.json().id

    // Submit went to wan-runpod with the neutral input; Runware untouched.
    expect(runware.submit).not.toHaveBeenCalled()
    expect(wan.submit).toHaveBeenCalledTimes(1)
    expect(wan.submit.mock.calls[0]![0]).toMatchObject({
      prompt: 'a red fox running',
      durationSeconds: 5,
      model: 'wan-runpod:wan2.2-t2v-a14b',
    })

    const p1 = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(p1.json().status).toBe('processing')
    const p2 = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(p2.json().status).toBe('succeeded')
    expect(p2.json().mediaUrls[0]).toMatch(/\.mp4$/)
    // Polled the persisted ComfyUI prompt_id (reused job-id column).
    expect(wan.poll).toHaveBeenCalledWith('pid-1')
    expect(runware.poll).not.toHaveBeenCalled()
  })

  it('routes a Runware video model to the Runware provider (never wan-runpod)', async () => {
    const runware = fakeVideoProvider()
    const wan = fakeVideoProvider()
    runware.submit.mockResolvedValue({ providerJobId: 'rw-1' })
    runware.poll.mockResolvedValue({ status: 'processing', progress: 20 })
    const app = await buildTestApp({ videoProviders: { runware, 'wan-runpod': wan } })
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'pixverse-v6', prompt: 'ocean waves', aspectRatio: '9:16', duration: 5 },
    })
    expect(created.statusCode).toBe(202)
    expect(runware.submit).toHaveBeenCalledTimes(1)
    expect(wan.submit).not.toHaveBeenCalled()
  })

  it('persists provider + the returned job id on the row', async () => {
    const runware = fakeVideoProvider()
    const wan = fakeVideoProvider()
    wan.submit.mockResolvedValue({ providerJobId: 'pid-xyz' })
    wan.poll.mockResolvedValue({ status: 'processing', progress: null })
    const app = await buildTestApp({ videoProviders: { runware, 'wan-runpod': wan } })
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'wan-2-2', prompt: 'x forest', aspectRatio: '1:1', duration: 5 },
    })
    const id = created.json().id
    // Poll once so the persisted job id is exercised by the poll path.
    await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(wan.poll).toHaveBeenCalledWith('pid-xyz')
  })

  it('a wan-runpod submit failure fails + refunds like any provider error (money invariant preserved)', async () => {
    const runware = fakeVideoProvider()
    const wan = fakeVideoProvider()
    // The unconfigured pod surfaces a provider_error at submit.
    wan.submit.mockRejectedValue(
      Object.assign(new Error('wan-runpod provider is not configured'), {
        statusCode: 502,
        apiCode: 'provider_error',
      }),
    )
    const app = await buildTestApp({ videoProviders: { runware, 'wan-runpod': wan } })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'wan-2-2', prompt: 'a mountain river', aspectRatio: '16:9', duration: 5 },
    })
    expect(res.statusCode).toBe(502)
    expect(res.json().error.code).toBe('provider_error')
    // Charged 60, refunded 60 → back to the signup bonus.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('routes seedance-2-0 to the DeepInfra provider (never Runware) and settles', async () => {
    const runware = fakeVideoProvider()
    const segmind = fakeVideoProvider()
    segmind.submit.mockResolvedValue({ providerJobId: 'cgt-1' })
    segmind.poll.mockResolvedValueOnce({ status: 'processing', progress: null }).mockResolvedValueOnce({
      status: 'success',
      assetUrl: 'https://deepinfra.com/model/inference/x.mp4',
      costUsd: 0.756,
      nsfw: false,
    })
    const app = await buildTestApp({
      videoProviders: { runware, segmind },
      assetHostAllowlist: ['runware.ai', 'deepinfra.com'],
    })
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'seedance-2-0', prompt: 'a lighthouse in a storm', aspectRatio: '16:9', duration: 5 },
    })
    expect(created.statusCode).toBe(202)
    const id = created.json().id

    expect(runware.submit).not.toHaveBeenCalled()
    expect(segmind.submit).toHaveBeenCalledTimes(1)
    // The adapter receives the AIR id verbatim and strips the prefix itself — the
    // service must not pre-mangle it.
    expect(segmind.submit.mock.calls[0]![0]).toMatchObject({
      prompt: 'a lighthouse in a storm',
      durationSeconds: 5,
      model: 'segmind:seedance-2.0',
      // resolutionProfile 'hd' → the 720p row of ByteDance's own table.
      width: 1280,
      height: 720,
    })

    await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    const p2 = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(p2.json().status).toBe('succeeded')
    expect(p2.json().mediaUrls[0]).toMatch(/\.mp4$/)
    expect(segmind.poll).toHaveBeenCalledWith('cgt-1')
    expect(runware.poll).not.toHaveBeenCalled()
  })

  it('a ByteDance real-face rejection at submit fails as content_blocked AND refunds', async () => {
    // The defining Seedance 2.0 constraint: the 2.0 series refuses any input image
    // containing a real human face. The user must get their credits back and a
    // message that names the actual reason — not an opaque provider error they
    // would "fix" by retrying the same portrait.
    const segmind = fakeVideoProvider()
    segmind.submit.mockRejectedValue(
      Object.assign(
        new Error('ByteDance refused this input. Seedance 2.0 does not accept images or video containing real human faces.'),
        { statusCode: 400, apiCode: 'content_blocked' },
      ),
    )
    const app = await buildTestApp({ videoProviders: { segmind } })
    const cookie = await registerAndGetCookie(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'seedance-2-0',
        prompt: 'she turns to the camera',
        aspectRatio: '16:9',
        duration: 5,
        inputImage: 'data:image/png;base64,AAAA',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('content_blocked')
    // Charged 130, refunded 130 → back to the signup bonus. The money invariant
    // holds for a content refusal exactly as it does for an outage.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('a ByteDance output-moderation kill at poll fails as content_blocked AND refunds', async () => {
    const segmind = fakeVideoProvider()
    segmind.submit.mockResolvedValue({ providerJobId: 'cgt-blocked' })
    segmind.poll.mockResolvedValue({
      status: 'error',
      message: 'The generated video may contain sensitive information.',
      blocked: true,
    })
    const app = await buildTestApp({ videoProviders: { segmind } })
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'seedance-2-0', prompt: 'a crowd', aspectRatio: '16:9', duration: 5 },
    })
    const id = created.json().id
    const p = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(p.json().status).toBe('failed')
    // The row explains itself: 'content_blocked', not a generic provider failure.
    expect(p.json().errorCode).toBe('content_blocked')
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('an ordinary ByteDance poll failure stays a plain provider failure (not content_blocked)', async () => {
    const segmind = fakeVideoProvider()
    segmind.submit.mockResolvedValue({ providerJobId: 'cgt-err' })
    segmind.poll.mockResolvedValue({ status: 'error', message: 'model worker crashed' })
    const app = await buildTestApp({ videoProviders: { segmind } })
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'seedance-2-0', prompt: 'a river', aspectRatio: '16:9', duration: 5 },
    })
    const id = created.json().id
    const p = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(p.json().status).toBe('failed')
    expect(p.json().errorCode).toBeNull()
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('routes a wan-runpod poll error to fail + refund', async () => {
    const runware = fakeVideoProvider()
    const wan = fakeVideoProvider()
    wan.submit.mockResolvedValue({ providerJobId: 'pid-err' })
    wan.poll.mockResolvedValue({ status: 'error', message: 'CUDA out of memory' })
    const app = await buildTestApp({ videoProviders: { runware, 'wan-runpod': wan } })
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'wan-2-2', prompt: 'a quiet harbor', aspectRatio: '16:9', duration: 5 },
    })
    const id = created.json().id
    const p = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(p.json().status).toBe('failed')
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })
})
