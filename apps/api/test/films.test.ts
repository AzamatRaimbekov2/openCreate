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

describe('film shot split', () => {
  it('splits a shot atomically into two contiguous halves and charges nothing', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = (await makeFilm(app, cookie)).json().id

    // Shot A: cites a generation, 6s long, trimmed to start 1s into its clip, with
    // a title, a cast, and a native-audio flag — so we can prove which fields carry.
    const s1 = (
      await app.inject({
        method: 'POST',
        url: `/api/films/${filmId}/shots`,
        headers: { cookie },
        payload: {
          generationId: 'gen-abc',
          prompt: 'a fox runs',
          promptPreset: { styleId: 'anime' },
          modelId: 'wan-2-2',
          durationMs: 6000,
          trimStartMs: 1000,
          audio: true,
          title: { text: 'Beat One', position: 'center' },
        },
      })
    ).json()
    // A trailing shot so B must land DIRECTLY AFTER A (not merely at the end).
    const s2 = (
      await app.inject({
        method: 'POST',
        url: `/api/films/${filmId}/shots`,
        headers: { cookie },
        payload: { title: { text: 'end', position: 'center' }, durationMs: 2000 },
      })
    ).json()

    const before = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json()
      .creditsBalance

    const res = await app.inject({
      method: 'POST',
      url: `/api/films/${filmId}/shots/${s1.id}/split`,
      headers: { cookie },
      payload: { atMs: 2000 },
    })
    expect(res.statusCode).toBe(200)
    const detail = res.json()
    // FilmDetail shape (same as GET /api/films/:id) so the client replaces its cache.
    expect(detail).toMatchObject({ film: { id: filmId } })
    expect(detail).toHaveProperty('audio')
    expect(detail).toHaveProperty('latestRender')

    const ids = detail.shots.map((s: { id: string }) => s.id)
    expect(ids).toHaveLength(3)
    // A stays first, the NEW shot B is directly after it, s2 stays last.
    expect(ids[0]).toBe(s1.id)
    expect(ids[2]).toBe(s2.id)
    const [a, b] = [detail.shots[0], detail.shots[1]]
    // A: same trim in-point, duration truncated to the split offset.
    expect(a).toMatchObject({ trimStartMs: 1000, durationMs: 2000, generationId: 'gen-abc' })
    // B: same source generation + footage-describing fields, trim shifted by atMs,
    // duration is the remainder.
    expect(b).toMatchObject({
      generationId: 'gen-abc',
      trimStartMs: 3000, // 1000 + 2000
      durationMs: 4000, // 6000 - 2000
      prompt: 'a fox runs',
      promptPreset: { styleId: 'anime' },
      modelId: 'wan-2-2',
      audio: true,
    })
    expect(b.id).not.toBe(s1.id)
    // Beat-scoped fields are NOT carried onto B — title/voiceover/refs belong to A's moment.
    expect(a.title).toMatchObject({ text: 'Beat One' })
    expect(b.title).toBeNull()
    expect(b.voiceover).toBeNull()
    expect(b.entityRefs).toEqual([])
    expect(b.referenceImages).toEqual([])
    // Contiguous halves: B enters from A with no transition (a crossfade would double-expose).
    expect(b.transition).toBe('none')

    // A split is not a generation — nothing was charged.
    const after = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json()
      .creditsBalance
    expect(after).toBe(before)
  })

  it('rejects a split offset outside the shot (0 < atMs < durationMs)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = (await makeFilm(app, cookie)).json().id
    const s1 = (
      await app.inject({
        method: 'POST',
        url: `/api/films/${filmId}/shots`,
        headers: { cookie },
        payload: { durationMs: 3000 },
      })
    ).json()
    const split = (atMs: number) =>
      app.inject({
        method: 'POST',
        url: `/api/films/${filmId}/shots/${s1.id}/split`,
        headers: { cookie },
        payload: { atMs },
      })
    // At the end (or past it): nothing left for the second half → service rejects.
    const tooLate = await split(3000)
    expect(tooLate.statusCode).toBe(400)
    expect(tooLate.json().error.code).toBe('validation_failed')
    // Non-positive: rejected by the wire schema.
    const nonPositive = await split(0)
    expect(nonPositive.statusCode).toBe(400)
    expect(nonPositive.json().error.code).toBe('validation_failed')
    // The shot was NOT mutated by either rejected call.
    const detail = await app.inject({ method: 'GET', url: `/api/films/${filmId}`, headers: { cookie } })
    expect(detail.json().shots).toHaveLength(1)
    expect(detail.json().shots[0].durationMs).toBe(3000)
  })

  it("does not split another user's shot (same 404 as missing)", async () => {
    const app = await buildTestApp()
    const cookieA = await registerAndGetCookie(app, 'a@b.co')
    const filmId = (await makeFilm(app, cookieA)).json().id
    const s1 = (
      await app.inject({
        method: 'POST',
        url: `/api/films/${filmId}/shots`,
        headers: { cookie: cookieA },
        payload: { durationMs: 3000 },
      })
    ).json()
    const cookieB = await registerAndGetCookie(app, 'b@b.co')
    // Foreign film (B's cookie on A's film) → 404.
    const foreign = await app.inject({
      method: 'POST',
      url: `/api/films/${filmId}/shots/${s1.id}/split`,
      headers: { cookie: cookieB },
      payload: { atMs: 1000 },
    })
    expect(foreign.statusCode).toBe(404)
    // A shot id that isn't in this film → also 404 (indistinguishable from foreign).
    const missingShot = await app.inject({
      method: 'POST',
      url: `/api/films/${filmId}/shots/nope/split`,
      headers: { cookie: cookieA },
      payload: { atMs: 1000 },
    })
    expect(missingShot.statusCode).toBe(404)
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
