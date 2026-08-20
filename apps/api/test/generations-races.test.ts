// Regression tests for the create/poll race (review findings: free-generation
// double-spend). create() used to persist the row with runwareTaskUuid BEFORE
// awaiting the provider call; a concurrent GET /:id during that window polled
// Runware for a task it didn't know yet, got an error, marked the row failed
// and refunded — then create() unconditionally flipped it to succeeded. Net:
// charge + refund = 0 while the asset was still delivered. These tests pin the
// fixed behavior: rows are not pollable until the provider call completes, and
// the create() success transition is status-guarded.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'

// Success paths download the produced asset via global fetch — stub it.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

const tick = () => new Promise((r) => setTimeout(r, 5))

type TestApp = Awaited<ReturnType<typeof buildTestApp>>

// The processing row appears in the list as soon as create() has charged and
// inserted it — before the provider call resolves. That is the attack window.
async function waitForRow(app: TestApp, cookie: string): Promise<string> {
  for (let i = 0; i < 200; i++) {
    const res = await app.inject({ method: 'GET', url: '/api/generations', headers: { cookie } })
    const id = res.json().items[0]?.id as string | undefined
    if (id) return id
    await tick()
  }
  throw new Error('generation row never appeared')
}

describe('create/poll race', () => {
  it('image: a poll during the in-flight provider call cannot fail + refund the row', async () => {
    const rw = fakeRunware()
    let resolveImage!: (value: unknown) => void
    // Provider call hangs until the test releases it — the attack window.
    rw.imageInference.mockImplementation(() => new Promise((resolve) => (resolveImage = resolve)))
    // If the service DID poll Runware now, the unknown task would report an
    // error and trigger the bogus refund.
    rw.getResponse.mockResolvedValue({ status: 'error', message: 'unknown task' })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)

    const postPromise = app
      .inject({
        method: 'POST',
        url: '/api/generations',
        headers: { cookie },
        payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
      })
      .then((res) => res)
    const id = await waitForRow(app, cookie)

    // Concurrent poll during the window: stays processing, provider untouched.
    const during = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(during.json().status).toBe('processing')
    expect(rw.getResponse).not.toHaveBeenCalled()

    resolveImage({ imageURL: 'https://im.runware.ai/a.webp', seed: 1, cost: 0.002 })
    const created = await postPromise
    expect(created.statusCode).toBe(201)
    expect(created.json().status).toBe('succeeded')

    // Net ledger effect: exactly one charge, never a refund.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(193)
    const tx = await app.inject({
      method: 'GET',
      url: '/api/credits/transactions',
      headers: { cookie },
    })
    const kinds = tx.json().items.map((item: { kind: string }) => item.kind)
    expect(kinds).not.toContain('refund')
  })

  it('video: a poll during the submit window neither fails nor refunds the job', async () => {
    const rw = fakeRunware()
    let resolveSubmit!: () => void
    rw.submitVideo.mockImplementation(() => new Promise<void>((resolve) => (resolveSubmit = resolve)))
    rw.getResponse.mockResolvedValue({ status: 'error', message: 'unknown task' })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)

    const postPromise = app
      .inject({
        method: 'POST',
        url: '/api/generations',
        headers: { cookie },
        payload: { modelId: 'pixverse-v6', prompt: 'waves', aspectRatio: '9:16', duration: 5 },
      })
      .then((res) => res)
    const id = await waitForRow(app, cookie)

    const during = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(during.json().status).toBe('processing')
    expect(rw.getResponse).not.toHaveBeenCalled()
    // The charge is still held — no refund happened during the window.
    const meDuring = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(meDuring.json().creditsBalance).toBe(165)

    resolveSubmit()
    const created = await postPromise
    expect(created.statusCode).toBe(202)

    // Once the submit completed the row becomes pollable and settles normally.
    rw.getResponse.mockResolvedValue({
      status: 'success',
      videoURL: 'https://vm.runware.ai/v.mp4',
      cost: 0.35,
    })
    const after = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(after.json().status).toBe('succeeded')
    expect(after.json().mediaUrls[0]).toMatch(/\.mp4$/)
  })
})
