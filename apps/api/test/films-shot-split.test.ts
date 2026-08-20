// Shot split (the NLE's split-at-playhead) — POST /api/films/:id/shots/:shotId/split.
// Covers the service's real logic (modules/films/shot-split.ts): order-index
// midpoint insertion, the 0 < atMs < durationMs bound, the selective field copy
// from A to the new shot B, ownership, and the no-charge invariant.
import { describe, expect, it } from 'vitest'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'

async function makeFilm(app: Awaited<ReturnType<typeof buildTestApp>>, cookie: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/films',
    headers: { cookie },
    payload: { title: 'Split Film', aspectRatio: '16:9' },
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
    payload: { durationMs: 10_000, ...body },
  })
  return res.json().id as string
}

const split = (
  app: Awaited<ReturnType<typeof buildTestApp>>,
  cookie: string,
  filmId: string,
  shotId: string,
  atMs: number,
) =>
  app.inject({
    method: 'POST',
    url: `/api/films/${filmId}/shots/${shotId}/split`,
    headers: { cookie },
    payload: { atMs },
  })

describe('POST /api/films/:id/shots/:shotId/split', () => {
  it('splits a shot into two contiguous shots at atMs', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotId = await addShot(app, cookie, filmId)

    const res = await split(app, cookie, filmId, shotId, 4000)
    expect(res.statusCode).toBe(200)
    const detail = res.json()
    expect(detail.shots).toHaveLength(2)

    const [a, b] = detail.shots as Array<Record<string, unknown>>
    expect(a.id).toBe(shotId)
    expect(a.durationMs).toBe(4000)
    expect(a.trimStartMs).toBe(0)
    expect(b.durationMs).toBe(6000)
    expect(b.trimStartMs).toBe(4000)
    expect(b.generationId).toBe(a.generationId)
    expect(b.transition).toBe('none')
    expect((b.orderIndex as number) > (a.orderIndex as number)).toBe(true)
  })

  it('does NOT copy per-moment fields onto the new shot', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotId = await addShot(app, cookie, filmId, {
      title: { text: 'Opening title', position: 'bottom' },
      voiceover: { text: 'Once upon a time', voice: 'Svetlana' },
      entityRefs: [{ placeholder: 'e1', entityId: 'x1' }],
    })

    const res = await split(app, cookie, filmId, shotId, 4000)
    expect(res.statusCode).toBe(200)
    const [a, b] = res.json().shots as Array<Record<string, unknown>>
    expect(a.title).toBeTruthy()
    expect(b.title).toBeNull()
    expect(b.voiceover).toBeNull()
    expect(b.entityRefs).toEqual([])
    expect(b.referenceImages).toEqual([])
  })

  it('rejects atMs <= 0 and atMs >= durationMs with 400 validation_failed', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotId = await addShot(app, cookie, filmId, { durationMs: 5000 })

    for (const atMs of [0, -1, 5000, 6000]) {
      const res = await split(app, cookie, filmId, shotId, atMs)
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('validation_failed')
    }
  })

  it('inserts B at the midpoint order index when A has a successor shot', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotIdA = await addShot(app, cookie, filmId)
    const shotIdC = await addShot(app, cookie, filmId)

    const res = await split(app, cookie, filmId, shotIdA, 4000)
    expect(res.statusCode).toBe(200)
    const shots = res.json().shots as Array<Record<string, unknown>>
    const a = shots.find((s) => s.id === shotIdA)!
    const c = shots.find((s) => s.id === shotIdC)!
    const b = shots.find((s) => s.id !== shotIdA && s.id !== shotIdC)!
    expect((a.orderIndex as number) < (b.orderIndex as number)).toBe(true)
    expect((b.orderIndex as number) < (c.orderIndex as number)).toBe(true)
  })

  it('foreign film or shot id → 404, same as a missing one (no enumeration oracle)', async () => {
    const app = await buildTestApp()
    const ownerCookie = await registerAndGetCookie(app, 'owner@b.co')
    const thiefCookie = await registerAndGetCookie(app, 'thief@b.co')
    const filmId = await makeFilm(app, ownerCookie)
    const shotId = await addShot(app, ownerCookie, filmId)

    const res = await split(app, thiefCookie, filmId, shotId, 1000)
    expect(res.statusCode).toBe(404)
  })

  it('bumps the film updatedAt in the same transaction as the split', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotId = await addShot(app, cookie, filmId)

    const before = (
      await app.inject({ method: 'GET', url: `/api/films/${filmId}`, headers: { cookie } })
    ).json().film.updatedAt as string

    const res = await split(app, cookie, filmId, shotId, 4000)
    expect(res.statusCode).toBe(200)
    expect(res.json().film.updatedAt).not.toBe(before)
  })

  it('never touches the credit ledger', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const filmId = await makeFilm(app, cookie)
    const shotId = await addShot(app, cookie, filmId)

    const before = (
      await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    ).json().creditsBalance as number

    const res = await split(app, cookie, filmId, shotId, 4000)
    expect(res.statusCode).toBe(200)

    const after = (
      await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    ).json().creditsBalance as number
    expect(after).toBe(before)
  })
})
