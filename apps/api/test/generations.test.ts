import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'

// Generation success paths download the produced asset via global fetch
// (storage.saveFromUrl) — stub it so tests never hit the network.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

// Distinct createdAt timestamps for cursor pagination (ms resolution).
const tick = () => new Promise((r) => setTimeout(r, 5))

describe('generations', () => {
  it('image: charges credits, calls runware, stores asset, returns succeeded', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({
      imageURL: 'https://im.runware.ai/a.webp',
      cost: 0.002,
      seed: 1,
      NSFWContent: false,
    })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
    })
    expect(res.statusCode).toBe(201)
    const gen = res.json()
    expect(gen.status).toBe('succeeded')
    expect(gen.mediaUrls[0]).toMatch(/^\/media\/.+\.webp$/)
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(199)
  })

  it('image: refunds on runware failure', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockRejectedValue(
      Object.assign(new Error('provider down'), { apiCode: 'provider_error', statusCode: 502 }),
    )
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
    })
    expect(res.statusCode).toBe(502)
    expect(res.json().error.code).toBe('provider_error')
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('video: 202 processing, then poll transitions to succeeded and downloads asset', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    rw.getResponse
      .mockResolvedValueOnce({ status: 'processing', progress: 40 })
      .mockResolvedValueOnce({
        status: 'success',
        videoURL: 'https://vm.runware.ai/v.mp4',
        cost: 0.35,
      })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'pixverse-v6', prompt: 'waves', aspectRatio: '9:16', duration: 5 },
    })
    expect(created.statusCode).toBe(202)
    const id = created.json().id

    const p1 = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(p1.json()).toMatchObject({ status: 'processing', progress: 40 })

    const p2 = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(p2.json().status).toBe('succeeded')
    expect(p2.json().mediaUrls[0]).toMatch(/\.mp4$/)
  })

  it('video: poll error → failed + refund', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    rw.getResponse.mockResolvedValue({ status: 'error', message: 'timeoutProvider' })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'pixverse-v6', prompt: 'waves', aspectRatio: '9:16', duration: 5 },
    })
    const id = created.json().id
    const p = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(p.json().status).toBe('failed')
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('image: NSFW-flagged result → 422 content_blocked, refund, asset never stored', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({
      imageURL: 'https://im.runware.ai/a.webp',
      seed: 1,
      NSFWContent: true,
    })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    // Fresh reference to the global fetch stub — storage downloads go through it.
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockClear()
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('content_blocked')
    // Flagged content must never be downloaded to our storage.
    expect(fetchMock).not.toHaveBeenCalled()
    // The charge was refunded.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
    // The row is failed and carries the machine-readable code for the SPA.
    const list = await app.inject({ method: 'GET', url: '/api/generations', headers: { cookie } })
    expect(list.json().items[0]).toMatchObject({ status: 'failed', errorCode: 'content_blocked' })
  })

  it('video: NSFW-flagged poll → failed + refund + content_blocked, asset never stored', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    rw.getResponse.mockResolvedValue({
      status: 'success',
      videoURL: 'https://vm.runware.ai/v.mp4',
      NSFWContent: true,
    })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockClear()
    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'pixverse-v6', prompt: 'waves', aspectRatio: '9:16', duration: 5 },
    })
    const id = created.json().id
    const p = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(p.json()).toMatchObject({ status: 'failed', errorCode: 'content_blocked' })
    expect(p.json().mediaUrls).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('video: poll success without a media URL settles as failed + refund', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    // Provider claims success but hands back no asset — before the fix this
    // left the row processing forever with the user's credits held.
    rw.getResponse.mockResolvedValue({ status: 'success' })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'pixverse-v6', prompt: 'waves', aspectRatio: '9:16', duration: 5 },
    })
    const id = created.json().id
    const p = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(p.json().status).toBe('failed')
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('insufficient credits → 402, no runware call', async () => {
    const rw = fakeRunware()
    const app = await buildTestApp({ runware: rw, signupBonusCredits: 5 })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'pixverse-v6', prompt: 'waves', aspectRatio: '9:16', duration: 5 },
    })
    expect(res.statusCode).toBe(402)
    expect(res.json().error.code).toBe('insufficient_credits')
    expect(rw.submitVideo).not.toHaveBeenCalled()
  })

  it('rejects an unknown model with 400 validation envelope', async () => {
    const rw = fakeRunware()
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'nope', prompt: 'red fox', aspectRatio: '1:1' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
    expect(rw.imageInference).not.toHaveBeenCalled()
  })

  it('list returns own items newest-first with cursor; delete removes; other users see nothing', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)

    const ids: string[] = []
    for (const prompt of ['first fox', 'second fox', 'third fox']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/generations',
        headers: { cookie },
        payload: { modelId: 'flux-schnell', prompt, aspectRatio: '1:1' },
      })
      expect(res.statusCode).toBe(201)
      ids.push(res.json().id)
      await tick()
    }

    const page1 = await app.inject({
      method: 'GET',
      url: '/api/generations?limit=2',
      headers: { cookie },
    })
    expect(page1.statusCode).toBe(200)
    const body1 = page1.json()
    expect(body1.items).toHaveLength(2)
    expect(body1.items[0].prompt).toBe('third fox')
    expect(body1.items[1].prompt).toBe('second fox')
    expect(body1.nextCursor).not.toBeNull()

    const page2 = await app.inject({
      method: 'GET',
      url: `/api/generations?limit=2&cursor=${body1.nextCursor}`,
      headers: { cookie },
    })
    const body2 = page2.json()
    expect(body2.items).toHaveLength(1)
    expect(body2.items[0].prompt).toBe('first fox')
    expect(body2.nextCursor).toBeNull()

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/generations/${ids[0]}`,
      headers: { cookie },
    })
    expect(del.statusCode).toBe(204)
    const after = await app.inject({ method: 'GET', url: '/api/generations', headers: { cookie } })
    expect(after.json().items).toHaveLength(2)

    // Another account must not see (or fetch) this user's generations.
    const otherCookie = await registerAndGetCookie(app, 'other@b.co')
    const otherList = await app.inject({
      method: 'GET',
      url: '/api/generations',
      headers: { cookie: otherCookie },
    })
    expect(otherList.json().items).toHaveLength(0)
    const otherGet = await app.inject({
      method: 'GET',
      url: `/api/generations/${ids[1]}`,
      headers: { cookie: otherCookie },
    })
    expect(otherGet.statusCode).toBe(404)
  })
})

describe('provider parameter compatibility wiring', () => {
  it('video create passes omitSafety for models flagged supportsSafetyParam=false', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'seedance-1-5-pro',
        prompt: 'glowing jellyfish in a violet void',
        aspectRatio: '9:16',
        duration: 5,
      },
    })
    expect(res.statusCode).toBe(202)
    expect(rw.submitVideo).toHaveBeenCalledWith(expect.objectContaining({ omitSafety: true }))
  })
  it('video create does NOT set omitSafety for models that accept safety', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    // minimax-hailuo carries no supportsSafetyParam flag — it accepts the
    // param. (pixverse-v6 was the example here until Runware started rejecting
    // safety on it too — d881897 flipped its flag, see catalog.ts.)
    await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'minimax-hailuo', prompt: 'ocean waves at dusk', aspectRatio: '16:9', duration: 6 },
    })
    const arg = rw.submitVideo.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.omitSafety).toBeUndefined()
  })
  it('video create OMITS negativePrompt for models flagged supportsNegativePrompt=false', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    // Runware started rejecting the whole task on `negativePrompt` for
    // Seedance 1.5 Pro ("Unsupported use of 'negativePrompt' parameter",
    // verified live 2026-07-30 on a brick-template beat) — the same provider
    // drift pattern as pixverse's `safety`. The anime style preset is what
    // PRODUCES a negative here; the gate must swallow it for this model.
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'seedance-1-5-pro',
        prompt: 'a girl by the window',
        aspectRatio: '9:16',
        duration: 5,
        promptPreset: { styleId: 'anime' },
      },
    })
    expect(res.statusCode).toBe(202)
    const arg = rw.submitVideo.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.negativePrompt).toBeUndefined()
    // The positive side of the preset still travels — only the negative is cut.
    expect(String(arg.positivePrompt)).toContain('anime style')
  })
  it('video create still sends negativePrompt to models that accept it', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'minimax-hailuo',
        prompt: 'a girl by the window',
        aspectRatio: '16:9',
        duration: 6,
        promptPreset: { styleId: 'anime' },
      },
    })
    const arg = rw.submitVideo.mock.calls[0]![0] as Record<string, unknown>
    expect(String(arg.negativePrompt)).toContain('photorealistic')
  })
})
