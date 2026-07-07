// DELETE /api/generations/:id rules (review finding): deleting a PROCESSING
// generation must be refused with 409 'conflict'. Deleting the row mid-flight
// would forfeit the user's refund (every failure settlement needs the row to
// flip + refund against) and orphan the Runware task the operator still pays
// for. Terminal rows (succeeded/failed) delete normally, media file included.
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

describe('DELETE /api/generations/:id', () => {
  it('processing generation → 409 conflict, row and charge stay intact', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    rw.getResponse.mockResolvedValue({ status: 'processing', progress: 10 })
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

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(del.statusCode).toBe(409)
    expect(del.json().error.code).toBe('conflict')

    // The row survives — the charge is still settleable/refundable.
    const still = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(still.statusCode).toBe(200)
    expect(still.json().status).toBe('processing')
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(165)
  })

  it('succeeded generation → 204 and the row is gone', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    rw.getResponse.mockResolvedValue({
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
    const id = created.json().id
    // Settle to succeeded via the poll, then deletion is allowed.
    const settled = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(settled.json().status).toBe('succeeded')

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(del.statusCode).toBe(204)
    const gone = await app.inject({
      method: 'GET',
      url: `/api/generations/${id}`,
      headers: { cookie },
    })
    expect(gone.statusCode).toBe(404)
  })
})
