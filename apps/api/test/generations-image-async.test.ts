// apps/api/test/generations-image-async.test.ts
// The ASYNCHRONOUS image path. Until Seedream, an image was the one generation
// type that finished inside its own POST — so every money rule on the async
// lifecycle (the submit-window race guard, the poll throttle, the NSFW gate
// before the download, refund-once) had never run for an image at all.
//
// These tests exist because that lifecycle is where the money is, and "it works
// for video" is not evidence about a row whose type is 'image': the poll path
// branches on row.type, and the branch is new.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'
import type { ImageProvider, ImagePollResult } from '../src/integrations/image-provider'

// Settling downloads the asset through global fetch (storage.saveFromUrl).
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

// A backend shaped like kie.ai: submit mints a task id, poll answers whatever
// the test queues next.
function asyncProvider(polls: ImagePollResult[]): ImageProvider & { calls: () => number } {
  let i = 0
  return {
    submit: vi.fn(async () => ({ kind: 'pending' as const, providerJobId: 'kie#task-1' })),
    poll: vi.fn(async () => polls[Math.min(i++, polls.length - 1)]!),
    calls: () => i,
  }
}

const createImage = async (app: Awaited<ReturnType<typeof buildTestApp>>, cookie: string) =>
  app.inject({
    method: 'POST',
    url: '/api/generations',
    headers: { cookie },
    payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
  })

describe('image on an asynchronous backend', () => {
  it('charges at submit, returns a PROCESSING row, and settles on a later poll', async () => {
    const imageProvider = asyncProvider([
      { status: 'processing' },
      {
        status: 'success',
        // kie.ai serves finished assets from tempfile.aiquickdraw.com, and the
        // SSRF gate only lets that host through when the kie channel is
        // configured. Using any other host here would 500 on the download —
        // which is the gate working, and worth knowing it also guards images.
        assetUrl: 'https://tempfile.aiquickdraw.com/a.png',
        costUsd: 0.035,
        nsfw: false,
        ext: 'png',
      },
    ])
    // The SSRF gate is per-HOST, and the test helper builds its allowlist
    // literally rather than through loadConfig's withKieHost() — so the kie CDN
    // has to be named here. Worth stating: the gate guards the IMAGE download
    // too, and a Seedream asset served from an unlisted host would 500 on
    // settle, after the user was charged.
    const app = await buildTestApp({
      runware: fakeRunware(),
      imageProvider,
      kieApiKey: 'k',
      assetHostAllowlist: ['runware.ai', 'tempfile.aiquickdraw.com'],
    })
    const cookie = await registerAndGetCookie(app)

    const created = await createImage(app, cookie)
    expect(created.statusCode).toBe(201)
    // The user is charged at SUBMIT, exactly as on every other async type — the
    // refund path is what makes that safe, not a late charge.
    expect(created.json().status).toBe('processing')
    const afterSubmit = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(afterSubmit.json().creditsBalance).toBe(193)

    const id = created.json().id
    await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    const done = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(done.json().status).toBe('succeeded')
    // The provider's OWN format is what the asset is stored as: a png written as
    // .webp is served with the wrong mime by the static handler.
    expect(done.json().mediaUrls[0]).toMatch(/^\/media\/.+\.png$/)
    // Settled means the charge is final — no refund arrived.
    const afterSettle = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(afterSettle.json().creditsBalance).toBe(193)
  })

  it('refunds when the backend fails the job', async () => {
    const imageProvider = asyncProvider([{ status: 'error', message: 'kie.ai failed this generation' }])
    const app = await buildTestApp({ runware: fakeRunware(), imageProvider })
    const cookie = await registerAndGetCookie(app)

    const id = (await createImage(app, cookie)).json().id
    const polled = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(polled.json().status).toBe('failed')
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('blocks and refunds an NSFW result WITHOUT storing it', async () => {
    const fetchSpy = vi.fn(async () => new Response(Buffer.from('bytes'), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    const imageProvider = asyncProvider([
      { status: 'success', assetUrl: 'https://cdn.kie/nsfw.png', nsfw: true },
    ])
    const app = await buildTestApp({ runware: fakeRunware(), imageProvider })
    const cookie = await registerAndGetCookie(app)

    const id = (await createImage(app, cookie)).json().id
    const polled = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(polled.json().status).toBe('failed')
    expect(polled.json().errorCode).toBe('content_blocked')
    // The gate runs BEFORE the download: a flagged asset must never reach our
    // storage, let alone be served from it.
    expect(fetchSpy).not.toHaveBeenCalled()
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('refunds a success that carries no asset instead of polling it forever', async () => {
    const imageProvider = asyncProvider([{ status: 'success', assetUrl: '' }])
    const app = await buildTestApp({ runware: fakeRunware(), imageProvider })
    const cookie = await registerAndGetCookie(app)

    const id = (await createImage(app, cookie)).json().id
    const polled = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    // Every future poll would return the same empty payload, so "retry later"
    // holds the user's credits forever.
    expect(polled.json().status).toBe('failed')
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('routes an image poll to the IMAGE seam, never to the video registry', async () => {
    const imageProvider = asyncProvider([{ status: 'processing' }])
    const app = await buildTestApp({ runware: fakeRunware(), imageProvider })
    const cookie = await registerAndGetCookie(app)
    const id = (await createImage(app, cookie)).json().id

    await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    // The row's type is what picks the seam — a catalogue edit must never be able
    // to redirect an in-flight job's poll to a different registry.
    expect(imageProvider.poll).toHaveBeenCalledWith('kie#task-1')
  })
})
