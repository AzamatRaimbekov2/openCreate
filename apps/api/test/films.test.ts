import { describe, expect, it } from 'vitest'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'
import { createDb } from '../src/db/client'
import { film } from '../src/db/schema'

// A minimal but valid raster image data URI (8-byte PNG signature).
const PNG = 'data:image/png;base64,iVBORw0KGgo='
const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='

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

// The create dialog collapsed to "title + optional cover" (owner, 2026-07-31).
// Two things have to hold: the ratio the user no longer picks still gets decided
// (by the server, once), and a cover that cannot be stored must not leave a film
// behind — the picture is part of the create, not a decoration bolted on after.
describe('film create: title-only, with an optional cover', () => {
  it('creates a 16:9 film from a bare title', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/films',
      headers: { cookie },
      payload: { title: 'Только название' },
    })
    expect(res.statusCode).toBe(201)
    // The server owns the default — there is one place it is decided.
    expect(res.json().aspectRatio).toBe('16:9')
    expect(res.json().coverUrl).toBeNull()
    expect(res.json().defaultStyleId).toBeNull()
  })

  it('still honours an explicit aspectRatio — the change is widening', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/films',
      headers: { cookie },
      payload: { title: 'Вертикальный', aspectRatio: '9:16', defaultStyleId: 'anime' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().aspectRatio).toBe('9:16')
    expect(res.json().defaultStyleId).toBe('anime')
  })

  it('stores a cover and answers its media path — in the create, the list and the detail', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/films',
      headers: { cookie },
      payload: { title: 'С обложкой', coverDataUri: PNG },
    })
    expect(created.statusCode).toBe(201)
    // A path we minted, never the bytes back.
    expect(created.json().coverUrl).toMatch(/^\/media\/.+\.png$/)

    const list = await app.inject({ method: 'GET', url: '/api/films', headers: { cookie } })
    expect(list.json().items[0].coverUrl).toBe(created.json().coverUrl)

    const detail = await app.inject({
      method: 'GET',
      url: `/api/films/${created.json().id}`,
      headers: { cookie },
    })
    expect(detail.json().film.coverUrl).toBe(created.json().coverUrl)
  })

  it('reads an older film — one with no cover — as null rather than missing', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const created = await makeFilm(app, cookie)
    expect(created.json()).toHaveProperty('coverUrl', null)
  })

  // The whole reason the bytes are stored BEFORE the row: a cover we cannot keep
  // must not leave a half-made film the user then has to notice and delete.
  it('refuses an svg cover with 400 and creates NO film', async () => {
    const db = createDb(':memory:').db
    const app = await buildTestApp({ db })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/films',
      headers: { cookie },
      payload: { title: 'Злая обложка', coverDataUri: SVG },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
    // The table is empty — not "a film without a cover".
    expect(db.select().from(film).all()).toHaveLength(0)
  })

  it('refuses a cover that is a URL rather than bytes, creating no film', async () => {
    const db = createDb(':memory:').db
    const app = await buildTestApp({ db })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/films',
      headers: { cookie },
      payload: { title: 'SSRF', coverDataUri: 'https://evil.example/x.png' },
    })
    expect(res.statusCode).toBe(400)
    expect(db.select().from(film).all()).toHaveLength(0)
  })

  // The wire schema refuses svg first, so this proves the SERVER-side guard is
  // real on its own: a data URI that passes zod but is not a storable raster
  // still fails at the disk boundary, and still leaves no row.
  it('refuses a well-formed data URI the storage layer cannot decode, creating no film', async () => {
    const db = createDb(':memory:').db
    const app = await buildTestApp({ db })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/films',
      headers: { cookie },
      // Passes `startsWith('data:image/')` and is not svg, but names a mime the
      // storage layer's closed raster table does not carry.
      payload: { title: 'Не растр', coverDataUri: 'data:image/tiff;base64,AAAA' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
    expect(db.select().from(film).all()).toHaveLength(0)
  })

  it('leaves the cover file alone when the film is deleted (the orphan precedent)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({
      method: 'POST',
      url: '/api/films',
      headers: { cookie },
      payload: { title: 'Удалю', coverDataUri: PNG },
    })
    const coverUrl = created.json().coverUrl as string
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/films/${created.json().id}`,
      headers: { cookie },
    })
    expect(del.statusCode).toBe(204)
    // Still served: deleting a film does not chase its uploaded bytes, the same
    // way a detached shot/style reference leaves a harmless orphan behind.
    const media = await app.inject({ method: 'GET', url: coverUrl })
    expect(media.statusCode).toBe(200)
  })
})

// Editing the cover from the film's settings (owner follow-up, 2026-08-02).
// The three-valued PATCH field, and the atomicity that makes a bad picture cost
// the user nothing — not even the rename they sent in the same body.
describe('film update: replacing and clearing the cover', () => {
  const withCover = async (app: Awaited<ReturnType<typeof buildTestApp>>, cookie: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/films',
      headers: { cookie },
      payload: { title: 'Исходный', coverDataUri: PNG },
    })
    return res.json() as { id: string; coverUrl: string }
  }

  it('replaces the cover with new bytes and answers a different media path', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const created = await withCover(app, cookie)

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/films/${created.id}`,
      headers: { cookie },
      payload: { coverDataUri: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().coverUrl).toMatch(/^\/media\/.+\.gif$/)
    expect(patched.json().coverUrl).not.toBe(created.coverUrl)

    // The OLD file is deliberately left behind — a harmless orphan, the same
    // treatment a detached shot or style reference gets.
    const old = await app.inject({ method: 'GET', url: created.coverUrl })
    expect(old.statusCode).toBe(200)
  })

  it('clears the cover when sent null', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const created = await withCover(app, cookie)

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/films/${created.id}`,
      headers: { cookie },
      payload: { coverDataUri: null },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().coverUrl).toBeNull()
  })

  // THE PARTIAL TRAP. If absent and null ever collapse into the same branch,
  // every rename silently wipes the picture — and nobody would connect the two.
  it('KEEPS the cover through a patch that does not mention it', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const created = await withCover(app, cookie)

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/films/${created.id}`,
      headers: { cookie },
      payload: { title: 'Только переименование' },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().title).toBe('Только переименование')
    expect(patched.json().coverUrl).toBe(created.coverUrl)
  })

  // Atomicity: the bytes are stored BEFORE the row is written, so a cover the
  // storage layer refuses must leave the ENTIRE row alone — including a title
  // that rode along in the same body. A partial update here would be the worst
  // outcome: renamed, un-covered, and no error the user could act on.
  it('leaves the whole row untouched — title included — when the cover is refused', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const created = await withCover(app, cookie)

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/films/${created.id}`,
      headers: { cookie },
      payload: {
        title: 'Это имя не должно сохраниться',
        // Passes the wire rule (data:image/, not svg) but names a mime the
        // storage layer's closed raster table does not carry.
        coverDataUri: 'data:image/tiff;base64,AAAA',
      },
    })
    expect(patched.statusCode).toBe(400)
    expect(patched.json().error.code).toBe('validation_failed')

    const detail = await app.inject({
      method: 'GET',
      url: `/api/films/${created.id}`,
      headers: { cookie },
    })
    expect(detail.json().film.title).toBe('Исходный')
    expect(detail.json().film.coverUrl).toBe(created.coverUrl)
  })

  it('refuses an svg cover at the wire, changing nothing', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const created = await withCover(app, cookie)
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/films/${created.id}`,
      headers: { cookie },
      payload: { title: 'Тоже не сохранится', coverDataUri: SVG },
    })
    expect(patched.statusCode).toBe(400)
    const detail = await app.inject({
      method: 'GET',
      url: `/api/films/${created.id}`,
      headers: { cookie },
    })
    expect(detail.json().film.title).toBe('Исходный')
  })

  it('still applies the patch fields that existed before the cover', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const created = await withCover(app, cookie)
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/films/${created.id}`,
      headers: { cookie },
      payload: { title: 'Переименован', aspectRatio: '9:16', defaultStyleId: 'anime' },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json()).toMatchObject({
      title: 'Переименован',
      aspectRatio: '9:16',
      defaultStyleId: 'anime',
      coverUrl: created.coverUrl,
    })
  })

  it("404s another user's film without storing anything", async () => {
    const app = await buildTestApp()
    const mine = await registerAndGetCookie(app, 'mine@b.co')
    const theirs = await registerAndGetCookie(app, 'theirs@b.co')
    const created = await withCover(app, theirs)
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/films/${created.id}`,
      headers: { cookie: mine },
      payload: { coverDataUri: PNG },
    })
    expect(patched.statusCode).toBe(404)
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
