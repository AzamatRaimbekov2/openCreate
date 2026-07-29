// inputGenerationId (canvas chain edge, ADR canvas-mode D2): the server
// resolves an OWN succeeded image generation's stored media as the provider
// reference — image models receive it via referenceImages, video models as the
// seed frame. Every refusal must land BEFORE the charge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildTestApp,
  fakeRunware,
  fakeVideoProvider,
  registerAndGetCookie,
} from './helpers/build-test-app'

// Success paths download the produced asset via global fetch (saveFromUrl).
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

// Seed one succeeded image generation and return its id.
async function seedImage(app: Awaited<ReturnType<typeof buildTestApp>>, cookie: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/generations',
    headers: { cookie },
    payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
  })
  expect(res.statusCode).toBe(201)
  return (res.json() as { id: string }).id
}

describe('inputGenerationId', () => {
  it('image chain: resolves own succeeded image into referenceImages (data URI)', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({
      imageURL: 'https://im.runware.ai/a.webp',
      cost: 0.002,
      seed: 1,
      NSFWContent: false,
    })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const parentId = await seedImage(app, cookie)

    // flux-kontext-pro has referenceMode 'both' — the chain-capable image model
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-kontext-pro',
        prompt: 'same fox, snowy forest',
        aspectRatio: '1:1',
        inputGenerationId: parentId,
      },
    })
    expect(res.statusCode).toBe(201)
    // Second imageInference call (first was the seed) carries the resolved
    // stored asset as a DATA URI — never a URL (providers can't reach /media).
    const call = rw.imageInference.mock.calls[1]![0] as { referenceImages?: string[] }
    expect(call.referenceImages).toHaveLength(1)
    expect(call.referenceImages![0]).toMatch(/^data:image\/webp;base64,/)
    // The chain is an image-conditioned run — recorded as mode 'image'
    expect((res.json() as { mode: string }).mode).toBe('image')
  })

  it('video chain: resolves the citation into the provider seed frame', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({
      imageURL: 'https://im.runware.ai/a.webp',
      cost: 0.002,
      seed: 1,
      NSFWContent: false,
    })
    const video = fakeVideoProvider()
    video.submit.mockResolvedValue({ providerJobId: 'job-1' })
    const app = await buildTestApp({ runware: rw, videoProviders: { runware: video } })
    const cookie = await registerAndGetCookie(app)
    const parentId = await seedImage(app, cookie)

    // pixverse-v6 is a runware video model with supportsImageInput
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'pixverse-v6',
        prompt: 'the fox walks away',
        aspectRatio: '16:9',
        duration: 5,
        inputGenerationId: parentId,
      },
    })
    expect(res.statusCode).toBe(202)
    const submitted = video.submit.mock.calls[0]![0] as { inputImage?: string }
    expect(submitted.inputImage).toMatch(/^data:image\/webp;base64,/)
  })

  it("refuses a stranger's generation with one default-deny message, charging nothing", async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({
      imageURL: 'https://im.runware.ai/a.webp',
      cost: 0.002,
      seed: 1,
      NSFWContent: false,
    })
    const app = await buildTestApp({ runware: rw })
    const owner = await registerAndGetCookie(app, 'owner@x.co')
    const thief = await registerAndGetCookie(app, 'thief@x.co')
    const parentId = await seedImage(app, owner)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie: thief },
      payload: {
        modelId: 'flux-kontext-pro',
        prompt: 'steal the fox',
        aspectRatio: '1:1',
        inputGenerationId: parentId,
      },
    })
    expect(res.statusCode).toBe(400)
    const balance = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: thief } })
    expect((balance.json() as { creditsBalance: number }).creditsBalance).toBe(200)
  })

  it('refuses an unknown generation id with the same message (no existence leak)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-kontext-pro',
        prompt: 'x y',
        aspectRatio: '1:1',
        inputGenerationId: 'no-such-id',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('refuses a chain into an image model with no referenceMode (flux-schnell), charging nothing', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({
      imageURL: 'https://im.runware.ai/a.webp',
      cost: 0.002,
      seed: 1,
      NSFWContent: false,
    })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const parentId = await seedImage(app, cookie)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-schnell',
        prompt: 'remix',
        aspectRatio: '1:1',
        inputGenerationId: parentId,
      },
    })
    expect(res.statusCode).toBe(400)
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    // 200 signup − 1 for the seed, nothing for the refused chain
    expect((me.json() as { creditsBalance: number }).creditsBalance).toBe(199)
  })

  it('rejects inputGenerationId together with inputImage (contract exclusivity)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'pixverse-v6',
        prompt: 'x y',
        aspectRatio: '16:9',
        duration: 5,
        inputImage: 'data:image/png;base64,AAAA',
        inputGenerationId: 'g1',
      },
    })
    expect(res.statusCode).toBe(400)
  })
})
