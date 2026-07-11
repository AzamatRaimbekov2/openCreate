// Studio3D lifecycle (ADR: photo-to-3d-studio). A model3d generation rides the
// EXISTING async lifecycle — charge at submit, poll, download-before-flip, refund
// on failure — behind the Mesh3dProvider seam. These tests pin the four things a
// new media type can plausibly get wrong on the money path:
//   · it must be ASYNC (202) and charged exactly once,
//   · it must land on disk as .glb (a mesh saved as .webp is an unopenable file),
//   · it must never be submitted to the VIDEO registry (a videoInference task can
//     never produce a mesh — the user would pay for a job that cannot succeed),
//   · every failure (provider error, success-with-no-asset) must still refund.
// Plus the one pre-charge guard 3D adds: v1 is image→3D only, so a request with
// no photo is rejected BEFORE the charge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildTestApp,
  fakeMeshProvider,
  fakeVideoProvider,
  registerAndGetCookie,
} from './helpers/build-test-app'

// The success path downloads the produced GLB through global fetch — stub it.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('fake-glb'), { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

// A 1x1 PNG data URI: the source photo. Studio3D is image→3D, so every legal
// request carries one.
const PHOTO = 'data:image/png;base64,iVBORw0KGgo='
// The cheapest tier (catalog 'Sketch', TRELLIS.2) — 6 credits.
const MESH_CREDITS = 6

describe('model3d generation lifecycle', () => {
  it('accepts a 3D job asynchronously (202, not 201) and charges exactly once', async () => {
    const mesh = fakeMeshProvider()
    mesh.submit.mockResolvedValue({ providerJobId: 'mesh-1' })
    const app = await buildTestApp({ meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'trellis-2', prompt: 'my chair', inputImage: PHOTO },
    })
    // 202, not 201: a mesh takes minutes, so the row is 'processing' and the SPA
    // polls it — exactly like video. A 201 here would mean the route believed the
    // asset was already final.
    expect(created.statusCode).toBe(202)
    expect(created.json().type).toBe('model3d')
    expect(created.json().status).toBe('processing')
    expect(created.json().costCredits).toBe(MESH_CREDITS)

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200 - MESH_CREDITS)
  })

  it('downloads the GLB and settles on a successful poll', async () => {
    const mesh = fakeMeshProvider()
    mesh.submit.mockResolvedValue({ providerJobId: 'mesh-ok' })
    mesh.poll.mockResolvedValue({
      status: 'success',
      assetUrl: 'https://im.runware.ai/x.glb',
      costUsd: 0.0256,
      nsfw: false,
    })
    const app = await buildTestApp({ meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'trellis-2', prompt: 'my chair', inputImage: PHOTO },
    })
    const id = created.json().id

    const polled = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(polled.json().status).toBe('succeeded')
    // The extension is the assertion: a mesh stored as .webp is a file no viewer
    // (and no <model-viewer>/three.js loader) can open. assetExt must map model3d
    // → glb, and the poll path must use it.
    expect(polled.json().mediaUrls[0]).toMatch(/^\/media\/[\w-]+\.glb$/)
    // Polled the persisted provider job id (the neutral reused column).
    expect(mesh.poll).toHaveBeenCalledWith('mesh-ok')
  })

  it('refunds when the provider fails the 3D job', async () => {
    const mesh = fakeMeshProvider()
    mesh.submit.mockResolvedValue({ providerJobId: 'mesh-err' })
    mesh.poll.mockResolvedValue({ status: 'error', message: 'reconstruction failed' })
    const app = await buildTestApp({ meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'trellis-2', prompt: 'my chair', inputImage: PHOTO },
    })
    const id = created.json().id

    const polled = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(polled.json().status).toBe('failed')
    expect(polled.json().errorMessage).toBe('reconstruction failed')
    // Charged 6, refunded 6 → back to the signup bonus. The guarded fail+refund
    // transaction is shared with video/audio; this pins that 3D actually reaches it.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('never submits a 3D job to the video provider', async () => {
    const mesh = fakeMeshProvider()
    const video = fakeVideoProvider()
    mesh.submit.mockResolvedValue({ providerJobId: 'mesh-2' })
    const app = await buildTestApp({
      meshProvider: mesh,
      videoProviders: { runware: video },
    })
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'trellis-2', prompt: 'my chair', inputImage: PHOTO },
    })
    expect(created.statusCode).toBe(202)
    // A 3D job that fell through to the video arm would send a videoInference task
    // and burn the user's credits on a job that can never return a mesh.
    expect(video.submit).not.toHaveBeenCalled()
    expect(mesh.submit).toHaveBeenCalledTimes(1)
    expect(mesh.submit.mock.calls[0]![0]).toMatchObject({
      model: 'microsoft:trellis-2@4b',
      inputImage: PHOTO,
      pbr: true,
    })
  })

  it('rejects a 3D job with no photo, before charging', async () => {
    const mesh = fakeMeshProvider()
    const app = await buildTestApp({ meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'trellis-2', prompt: 'a chair' },
    })
    // v1 is image→3D only. Text→3D exists on the provider but the composer UX does
    // not, and a photo-less 3D submit would fail AFTER the charge.
    expect(res.statusCode).toBe(400)
    expect(mesh.submit).not.toHaveBeenCalled()
    // The guard runs BEFORE chargeCredits: a job we know will fail costs nothing.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('settles as failed + refunded when the poll returns success with no asset', async () => {
    const mesh = fakeMeshProvider()
    mesh.submit.mockResolvedValue({ providerJobId: 'mesh-empty' })
    // 'success' with no assetUrl is unrecoverable: every future poll returns the
    // same empty payload, so leaving the row processing would hold the user's
    // credits forever. The existing no-asset guard must cover 3D too.
    mesh.poll.mockResolvedValue({ status: 'success', nsfw: false })
    const app = await buildTestApp({ meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'trellis-2', prompt: 'my chair', inputImage: PHOTO },
    })
    const id = created.json().id

    const polled = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(polled.json().status).toBe('failed')
    expect(polled.json().errorMessage).toBe('provider returned no asset')
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })
})
