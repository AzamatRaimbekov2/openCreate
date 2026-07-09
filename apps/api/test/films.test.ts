import { describe, expect, it } from 'vitest'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'

async function makeFilm(app: Awaited<ReturnType<typeof buildTestApp>>, cookie: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/films',
    headers: { cookie },
    payload: { title: 'My Film', aspectRatio: '16:9', defaultStyleId: 'disney' },
  })
  return res
}

describe('films CRUD', () => {
  it('creates, lists, and reads a film with empty shots/audio', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const created = await makeFilm(app, cookie)
    expect(created.statusCode).toBe(201)
    const film = created.json()
    expect(film.title).toBe('My Film')
    expect(film.defaultStyleId).toBe('disney')

    const list = await app.inject({ method: 'GET', url: '/api/films', headers: { cookie } })
    expect(list.json().items).toHaveLength(1)

    const detail = await app.inject({ method: 'GET', url: `/api/films/${film.id}`, headers: { cookie } })
    expect(detail.statusCode).toBe(200)
    expect(detail.json()).toMatchObject({ film: { id: film.id }, shots: [], audio: [] })
  })

  it('requires auth', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/films' })
    expect(res.statusCode).toBe(401)
  })

  it("does not leak another user's film (same 404 as missing)", async () => {
    const app = await buildTestApp()
    const cookieA = await registerAndGetCookie(app, 'a@b.co')
    const filmId = (await makeFilm(app, cookieA)).json().id
    const cookieB = await registerAndGetCookie(app, 'b@b.co')
    const res = await app.inject({ method: 'GET', url: `/api/films/${filmId}`, headers: { cookie: cookieB } })
    expect(res.statusCode).toBe(404)
    // A truly missing id also 404s — indistinguishable.
    const missing = await app.inject({ method: 'GET', url: `/api/films/nope`, headers: { cookie: cookieB } })
    expect(missing.statusCode).toBe(404)
  })

  it('updates a film', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = (await makeFilm(app, cookie)).json().id
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/films/${filmId}`,
      headers: { cookie },
      payload: { title: 'Renamed', aspectRatio: '9:16' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ title: 'Renamed', aspectRatio: '9:16' })
  })

  it('deletes a film (and cascades)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = (await makeFilm(app, cookie)).json().id
    const del = await app.inject({ method: 'DELETE', url: `/api/films/${filmId}`, headers: { cookie } })
    expect(del.statusCode).toBe(204)
    const list = await app.inject({ method: 'GET', url: '/api/films', headers: { cookie } })
    expect(list.json().items).toHaveLength(0)
  })
})

describe('film shots', () => {
  it('adds, updates, reorders, and deletes shots', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = (await makeFilm(app, cookie)).json().id

    const addShot = (title: string) =>
      app.inject({
        method: 'POST',
        url: `/api/films/${filmId}/shots`,
        headers: { cookie },
        payload: { title: { text: title, position: 'center' }, durationMs: 3000 },
      })
    const s1 = (await addShot('one')).json()
    const s2 = (await addShot('two')).json()
    expect(s1.orderIndex).toBeLessThan(s2.orderIndex)

    // Update a shot's duration + preset.
    const upd = await app.inject({
      method: 'PATCH',
      url: `/api/films/${filmId}/shots/${s1.id}`,
      headers: { cookie },
      payload: { durationMs: 5000, promptPreset: { styleId: 'anime' } },
    })
    expect(upd.json()).toMatchObject({ durationMs: 5000, promptPreset: { styleId: 'anime' } })

    // Reorder: put s2 before s1.
    const re = await app.inject({
      method: 'POST',
      url: `/api/films/${filmId}/shots/reorder`,
      headers: { cookie },
      payload: { shotIds: [s2.id, s1.id] },
    })
    expect(re.statusCode).toBe(200)
    expect(re.json().items.map((s: { id: string }) => s.id)).toEqual([s2.id, s1.id])

    // Reorder rejects a set that isn't exactly this film's shots.
    const bad = await app.inject({
      method: 'POST',
      url: `/api/films/${filmId}/shots/reorder`,
      headers: { cookie },
      payload: { shotIds: [s1.id] },
    })
    expect(bad.statusCode).toBe(400)

    // Delete a shot.
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/films/${filmId}/shots/${s1.id}`,
      headers: { cookie },
    })
    expect(del.statusCode).toBe(204)
    const detail = await app.inject({ method: 'GET', url: `/api/films/${filmId}`, headers: { cookie } })
    expect(detail.json().shots).toHaveLength(1)
  })
})

describe('film audio validation', () => {
  it('rejects an audio track that does not point at an audio generation', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = (await makeFilm(app, cookie)).json().id
    const res = await app.inject({
      method: 'POST',
      url: `/api/films/${filmId}/audio`,
      headers: { cookie },
      payload: { kind: 'music', generationId: 'does-not-exist' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })
})

describe('film render validation', () => {
  it('refuses to render a film with no renderable shots', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = (await makeFilm(app, cookie)).json().id
    const res = await app.inject({ method: 'POST', url: `/api/films/${filmId}/renders`, headers: { cookie } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toMatch(/no renderable shots/)
  })
})
