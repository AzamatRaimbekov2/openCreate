import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createDb } from '../src/db/client'
import { createLocalStorage } from '../src/storage/local'
import {
  createFilmService,
  FilmRenderInProgressError,
  settleStaleRenders,
  STALE_RENDER_MS,
} from '../src/modules/films/service'
import { filmRender, user } from '../src/db/schema'
import { eq } from 'drizzle-orm'

const USER = 'user-1'

function service(runRender?: Parameters<typeof createFilmService>[0]['runRender']) {
  const db = createDb(':memory:').db
  // film.user_id has an FK to user(id) (foreign_keys=ON), so a service-level
  // test must seed the owning user before creating films.
  const now = new Date()
  db.insert(user).values({ id: USER, email: 'u@t.co', emailVerified: false, createdAt: now, updatedAt: now }).run()
  const storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'oc-render-')))
  const svc = createFilmService({ db, storage, ...(runRender ? { runRender } : {}) })
  return { db, svc }
}

// Poll getRender until it leaves 'processing' (the render is fire-and-forget).
async function waitTerminal(svc: ReturnType<typeof createFilmService>, userId: string, filmId: string, renderId: string) {
  for (let i = 0; i < 50; i++) {
    const r = svc.getRender(userId, filmId, renderId)
    if (r.status !== 'processing') return r
    await new Promise((res) => setTimeout(res, 5))
  }
  return svc.getRender(userId, filmId, renderId)
}

describe('film render lifecycle', () => {
  it('runs the render and settles succeeded with a media url', async () => {
    const fakeRunner = vi.fn(async (_args, _totalMs, onProgress) => {
      onProgress(50)
      return { ok: true as const }
    })
    const { svc } = service(fakeRunner)
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    // A title-only shot needs no media file — renders as a card.
    svc.addShot(USER, film.id, { title: { text: 'THE END', position: 'center' }, durationMs: 2000 })

    const render = svc.createRender(USER, film.id)
    expect(render.status).toBe('processing')

    const done = await waitTerminal(svc, USER, film.id, render.id)
    expect(done.status).toBe('succeeded')
    expect(done.mediaUrl).toMatch(/^\/media\/.+\.mp4$/)
    expect(fakeRunner).toHaveBeenCalledOnce()
  })

  it('settles failed when ffmpeg reports an error', async () => {
    const fakeRunner = vi.fn(async () => ({ ok: false as const, error: 'boom' }))
    const { svc } = service(fakeRunner)
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '1:1' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'top' }, durationMs: 1500 })

    const render = svc.createRender(USER, film.id)
    const done = await waitTerminal(svc, USER, film.id, render.id)
    expect(done.status).toBe('failed')
    expect(done.errorMessage).toBe('boom')
    expect(done.mediaUrl).toBeNull()
  })

  it('the stale reaper fails a render whose process died', async () => {
    // A runner that never resolves simulates a crashed/hung ffmpeg.
    const hang = vi.fn(() => new Promise<{ ok: true } | { ok: false; error: string }>(() => {}))
    const { db, svc } = service(hang)
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 1000 })
    const render = svc.createRender(USER, film.id)

    // Backdate the row well past the staleness threshold.
    db.update(filmRender)
      .set({ createdAt: new Date(Date.now() - STALE_RENDER_MS - 1000) })
      .where(eq(filmRender.id, render.id))
      .run()
    const failed = settleStaleRenders(db, Date.now())
    expect(failed).toBe(1)
    expect(svc.getRender(USER, film.id, render.id).status).toBe('failed')
  })
})

// A render used to be visible ONLY to the tab that started it: the id lived in
// React state and the detail DTO carried nothing, so a reload lost the job — the
// strip vanished, Export was offered again (starting a SECOND ffmpeg run), and a
// finished mp4 became unreachable from the UI. The film's own detail now carries
// its latest render, which is what makes recovery possible at all.
describe('film detail carries the latest render', () => {
  it('is null for a film that has never been exported', async () => {
    const { svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    expect(svc.getFilm(USER, film.id).latestRender).toBeNull()
  })

  it('exposes a finished render — the mp4 stays reachable after a reload', async () => {
    const { svc } = service(vi.fn(async () => ({ ok: true as const })))
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 1000 })
    const render = svc.createRender(USER, film.id)
    await waitTerminal(svc, USER, film.id, render.id)

    // A fresh load of the film — the only thing a reloaded editor gets
    const latest = svc.getFilm(USER, film.id).latestRender
    expect(latest?.id).toBe(render.id)
    expect(latest?.status).toBe('succeeded')
    expect(latest?.mediaUrl).toMatch(/^\/media\/.+\.mp4$/)
  })

  it('reports the NEWEST render when a film has been exported more than once', async () => {
    const { svc } = service(vi.fn(async () => ({ ok: true as const })))
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 1000 })

    const first = svc.createRender(USER, film.id)
    await waitTerminal(svc, USER, film.id, first.id)
    const second = svc.createRender(USER, film.id)
    await waitTerminal(svc, USER, film.id, second.id)

    expect(svc.getFilm(USER, film.id).latestRender?.id).toBe(second.id)
  })

  it('does not leak another user’s render onto a film', async () => {
    const { db, svc } = service()
    const now = new Date()
    db.insert(user)
      .values({ id: 'user-2', email: 'b@t.co', emailVerified: false, createdAt: now, updatedAt: now })
      .run()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    expect(() => svc.getFilm('user-2', film.id)).toThrow()
  })
})

// One film, one ffmpeg job. The old UI gate (`isExporting`) only knew about the
// current TAB, so two tabs — or a reload mid-render — could put two encodes of
// the same film on the CPU at once. The refusal has to live on the server.
describe('concurrent renders are refused', () => {
  it('refuses a second render while one is still processing', async () => {
    const hang = vi.fn(() => new Promise<{ ok: true } | { ok: false; error: string }>(() => {}))
    const { svc } = service(hang)
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 1000 })

    svc.createRender(USER, film.id)
    expect(() => svc.createRender(USER, film.id)).toThrow(FilmRenderInProgressError)
    // And only ONE ffmpeg job was ever started. The runner is reached through an
    // async semaphore acquire, so this has to wait for the job to actually start
    // rather than assert on the same tick as the refusal.
    await vi.waitFor(() => expect(hang).toHaveBeenCalledOnce())
  })

  it('allows a new render once the previous one has settled', async () => {
    const { svc } = service(vi.fn(async () => ({ ok: true as const })))
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 1000 })

    const first = svc.createRender(USER, film.id)
    await waitTerminal(svc, USER, film.id, first.id)
    expect(() => svc.createRender(USER, film.id)).not.toThrow()
  })
})
