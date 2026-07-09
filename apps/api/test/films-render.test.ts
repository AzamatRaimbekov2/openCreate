import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createDb } from '../src/db/client'
import { createLocalStorage } from '../src/storage/local'
import { createFilmService, settleStaleRenders, STALE_RENDER_MS } from '../src/modules/films/service'
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
    const film = svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
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
    const film = svc.createFilm(USER, { title: 'F', aspectRatio: '1:1' })
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
    const film = svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
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
