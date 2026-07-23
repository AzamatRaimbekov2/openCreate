// Attaching arbitrary reference images DIRECTLY to a Cinema shot (not tagged
// Entities), and having them SURVIVE a re-generate. Two things are load-bearing
// and every one is tested here:
//   1. The image PERSISTS on the shot, so the clip route re-sends it on every
//      (re-)generate — the whole point of storing it server-side.
//   2. The shared reference budget (entity tags + attached images) is enforced
//      at UPLOAD, before storing, so the composer's "5/5" counter is truth.
//   3. The client can NEVER inject raw reference-image bytes: the delivery seam
//      reads the shot's stored images into the closed referenceImages channel.
//   4. Ownership: a foreign film/shot is a 404 and the provider is never called.
import { describe, expect, it } from 'vitest'
import {
  buildTestApp,
  fakeVideoProvider,
  registerAndGetCookie,
} from './helpers/build-test-app'

// A minimal but valid raster image data URI (8-byte PNG signature). saveDataUri
// decodes + stores it; readAsDataUri reads it back at generation time.
const PNG = 'data:image/png;base64,iVBORw0KGgo='
const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='

async function makeFilm(app: Awaited<ReturnType<typeof buildTestApp>>, cookie: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/films',
    headers: { cookie },
    payload: { title: 'Ref Film', aspectRatio: '16:9' },
  })
  return res.json().id as string
}

async function addShot(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  cookie: string,
  filmId: string,
  body: Record<string, unknown> = {},
) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/films/${filmId}/shots`,
    headers: { cookie },
    payload: { durationMs: 5000, ...body },
  })
  return res.json().id as string
}

const uploadRef = (
  app: Awaited<ReturnType<typeof buildTestApp>>,
  cookie: string,
  filmId: string,
  shotId: string,
  dataUri = PNG,
) =>
  app.inject({
    method: 'POST',
    url: `/api/films/${filmId}/shots/${shotId}/references`,
    headers: { cookie },
    payload: { dataUri },
  })

describe('shot reference upload', () => {
  it('appends an attached image and returns the updated shot', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotId = await addShot(app, cookie, filmId)

    const res = await uploadRef(app, cookie, filmId, shotId)
    expect(res.statusCode).toBe(201)
    const shot = res.json()
    expect(shot.referenceImages).toHaveLength(1)
    expect(shot.referenceImages[0]).toMatchObject({ id: expect.any(String) })
    // A stable server media path — never the bytes back.
    expect(shot.referenceImages[0].path).toMatch(/^\/media\/.+\.png$/)

    // It is visible on the film detail too (persisted, not just echoed).
    const detail = await app.inject({ method: 'GET', url: `/api/films/${filmId}`, headers: { cookie } })
    expect(detail.json().shots[0].referenceImages).toHaveLength(1)
  })

  it('rejects an svg upload at the boundary (stored-XSS carrier)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotId = await addShot(app, cookie, filmId)
    const res = await uploadRef(app, cookie, filmId, shotId, SVG)
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })

  it('deletes an attached image and returns the updated shot', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotId = await addShot(app, cookie, filmId)
    await uploadRef(app, cookie, filmId, shotId)
    const two = await uploadRef(app, cookie, filmId, shotId)
    const refId = two.json().referenceImages[0].id as string

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/films/${filmId}/shots/${shotId}/references/${refId}`,
      headers: { cookie },
    })
    expect(del.statusCode).toBe(200)
    expect(del.json().referenceImages).toHaveLength(1)
    expect(del.json().referenceImages.some((r: { id: string }) => r.id === refId)).toBe(false)
  })

  it('enforces the shared budget (entity tags + images) at the N+1th upload', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    // 3 tagged entities already occupy the shared budget of 5.
    const shotId = await addShot(app, cookie, filmId, {
      entityRefs: [
        { placeholder: 'e1', entityId: 'x1' },
        { placeholder: 'e2', entityId: 'x2' },
        { placeholder: 'e3', entityId: 'x3' },
      ],
    })
    // Two images fit (3 + 2 = 5).
    expect((await uploadRef(app, cookie, filmId, shotId)).statusCode).toBe(201)
    expect((await uploadRef(app, cookie, filmId, shotId)).statusCode).toBe(201)
    // The third would be the sixth reference — refused before storing.
    const overflow = await uploadRef(app, cookie, filmId, shotId)
    expect(overflow.statusCode).toBe(400)
    expect(overflow.json().error.code).toBe('validation_failed')

    // ...and it was NOT stored: the shot still has exactly two images.
    const detail = await app.inject({ method: 'GET', url: `/api/films/${filmId}`, headers: { cookie } })
    expect(detail.json().shots[0].referenceImages).toHaveLength(2)
  })

  it('refuses the 6th image even with no entity tags (pure image budget = 5)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotId = await addShot(app, cookie, filmId)
    for (let i = 0; i < 5; i++) expect((await uploadRef(app, cookie, filmId, shotId)).statusCode).toBe(201)
    expect((await uploadRef(app, cookie, filmId, shotId)).statusCode).toBe(400)
  })

  it("does not leak another user's shot (same 404 as missing)", async () => {
    const app = await buildTestApp()
    const cookieA = await registerAndGetCookie(app, 'a@b.co')
    const filmId = await makeFilm(app, cookieA)
    const shotId = await addShot(app, cookieA, filmId)
    const cookieB = await registerAndGetCookie(app, 'b@b.co')
    const res = await uploadRef(app, cookieB, filmId, shotId)
    expect(res.statusCode).toBe(404)
  })
})

describe('shot clip generation (the delivery seam)', () => {
  const clip = (
    app: Awaited<ReturnType<typeof buildTestApp>>,
    cookie: string,
    filmId: string,
    shotId: string,
    body: Record<string, unknown> = {},
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/films/${filmId}/shots/${shotId}/clip`,
      headers: { cookie },
      payload: { modelId: 'wan-2-7', prompt: 'a fox on a beach', aspectRatio: '16:9', duration: 5, ...body },
    })

  it('sends the shot’s stored reference images to the provider (as data URIs)', async () => {
    const alibaba = fakeVideoProvider()
    alibaba.submit.mockResolvedValue({ providerJobId: 'job-1' })
    const app = await buildTestApp({ videoProviders: { alibaba } })
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotId = await addShot(app, cookie, filmId)
    await uploadRef(app, cookie, filmId, shotId)

    const res = await clip(app, cookie, filmId, shotId)
    // Video is async → 202 accepted.
    expect(res.statusCode).toBe(202)
    expect(res.json().type).toBe('video')

    // The stored image reached the closed referenceImages channel as a data URI —
    // the client never sent bytes, the server sourced them from the shot.
    const submitted = alibaba.submit.mock.calls[0]?.[0]
    expect(submitted.referenceImages).toHaveLength(1)
    expect(submitted.referenceImages[0]).toMatch(/^data:image\/png;base64,/)
  })

  it('re-sends the stored references on a RE-generate (they survive)', async () => {
    const alibaba = fakeVideoProvider()
    alibaba.submit.mockResolvedValue({ providerJobId: 'job-x' })
    const app = await buildTestApp({ videoProviders: { alibaba } })
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotId = await addShot(app, cookie, filmId)
    await uploadRef(app, cookie, filmId, shotId)

    await clip(app, cookie, filmId, shotId)
    await clip(app, cookie, filmId, shotId)
    // Both generations carried the stored reference — it persists on the shot.
    expect(alibaba.submit).toHaveBeenCalledTimes(2)
    expect(alibaba.submit.mock.calls[1]?.[0].referenceImages).toHaveLength(1)
  })

  it('sends no referenceImages when the shot has none attached', async () => {
    const alibaba = fakeVideoProvider()
    alibaba.submit.mockResolvedValue({ providerJobId: 'job-2' })
    const app = await buildTestApp({ videoProviders: { alibaba } })
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotId = await addShot(app, cookie, filmId)

    const res = await clip(app, cookie, filmId, shotId)
    expect(res.statusCode).toBe(202)
    expect(alibaba.submit.mock.calls[0]?.[0].referenceImages).toBeUndefined()
  })

  it("404s a foreign film/shot and never calls the provider", async () => {
    const alibaba = fakeVideoProvider()
    const app = await buildTestApp({ videoProviders: { alibaba } })
    const cookieA = await registerAndGetCookie(app, 'a@b.co')
    const filmId = await makeFilm(app, cookieA)
    const shotId = await addShot(app, cookieA, filmId)
    const cookieB = await registerAndGetCookie(app, 'b@b.co')

    const res = await clip(app, cookieB, filmId, shotId)
    expect(res.statusCode).toBe(404)
    expect(alibaba.submit).not.toHaveBeenCalled()
  })
})
