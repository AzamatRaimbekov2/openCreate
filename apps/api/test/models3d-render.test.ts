// Studio3D turntable renders + public share links (src/modules/models3d/{service,routes}.ts).
// Zero prior coverage: generations-3d.test.ts only exercises the image→3D
// GENERATION lifecycle (charge/poll/refund via the Mesh3dProvider seam); this
// module is the SEPARATE, uncharged render+share feature layered on top of a
// succeeded model3d generation. Mirrors films-render.test.ts's service-level
// pattern (direct service construction + a fake ffmpeg runner) plus a thin
// routes layer using buildTestApp, matching films.test.ts.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createDb } from '../src/db/client'
import { createLocalStorage } from '../src/storage/local'
import { generation, modelShare, user } from '../src/db/schema'
import {
  createModels3dService,
  settleStaleModelRenders,
  STALE_MODEL_RENDER_MS,
} from '../src/modules/models3d/service'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'

const USER = 'user-1'
const VIDEO = `data:video/mp4;base64,${'A'.repeat(64)}`
const POSTER = `data:image/webp;base64,${'A'.repeat(64)}`

function service(runNormalize?: Parameters<typeof createModels3dService>[0]['runNormalize']) {
  const db = createDb(':memory:').db
  const now = new Date()
  db.insert(user)
    .values({ id: USER, email: 'u@t.co', emailVerified: false, createdAt: now, updatedAt: now })
    .run()
  const storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'oc-model3d-')))
  const svc = createModels3dService({ db, storage, ...(runNormalize ? { runNormalize } : {}) })
  return { db, storage, svc }
}

// Minimal succeeded model3d generation, inserted directly — requireModel only
// cares about type/status, not how the row got there.
function seedModel(db: ReturnType<typeof createDb>['db'], overrides: Partial<typeof generation.$inferInsert> = {}) {
  const id = overrides.id ?? 'gen-1'
  db.insert(generation)
    .values({
      id,
      userId: USER,
      type: 'model3d',
      mode: 'image',
      status: 'succeeded',
      prompt: 'a toy robot',
      modelId: 'microsoft:trellis-2@4b',
      paramsJson: '{}',
      costCredits: 40,
      mediaJson: JSON.stringify(['/media/gen-1.glb']),
      createdAt: new Date(),
      completedAt: new Date(),
      ...overrides,
    })
    .run()
  return id
}

describe('requireModel ownership + state guards', () => {
  it('404s for a generation that does not exist', () => {
    const { svc } = service()
    expect(() => svc.listRenders(USER, 'nope')).toThrow()
  })

  it("404s for another user's generation (not a 403 — no enumeration oracle)", () => {
    const { db, svc } = service()
    db.insert(user)
      .values({ id: 'user-2', email: 'b@t.co', emailVerified: false, createdAt: new Date(), updatedAt: new Date() })
      .run()
    const id = seedModel(db, { userId: 'user-2' })
    expect(() => svc.listRenders(USER, id)).toThrow()
  })

  it('400s for a generation that is not type model3d', () => {
    const { db, svc } = service()
    const id = seedModel(db, { type: 'image' })
    expect(() => svc.listRenders(USER, id)).toThrow()
  })

  it('400s for a model3d generation that has not succeeded yet', () => {
    const { db, svc } = service()
    const id = seedModel(db, { status: 'processing' })
    expect(() => svc.listRenders(USER, id)).toThrow()
  })
})

describe('createRender', () => {
  it('rejects an unknown scene preset before writing anything', async () => {
    const { db, svc } = service()
    const id = seedModel(db)
    await expect(
      svc.createRender(USER, id, { presetId: 'not-a-preset', video: VIDEO, poster: POSTER }),
    ).rejects.toThrow()
  })

  it('rejects a malformed video data URI before inserting a row', async () => {
    const { db, svc } = service()
    const id = seedModel(db)
    await expect(
      svc.createRender(USER, id, { presetId: 'studio', video: 'not-a-data-uri', poster: POSTER }),
    ).rejects.toThrow()
  })

  it('runs normalize and settles succeeded with a media + poster url', async () => {
    const runNormalize = vi.fn(async () => ({ ok: true as const }))
    const { db, svc } = service(runNormalize)
    const id = seedModel(db)
    const render = await svc.createRender(USER, id, { presetId: 'studio', video: VIDEO, poster: POSTER })
    expect(render.status).toBe('succeeded')
    expect(render.progress).toBe(100)
    expect(render.mediaUrl).toMatch(/^\/media\/.+\.mp4$/)
    expect(render.posterUrl).toMatch(/^\/media\/.+\.webp$/)
    expect(runNormalize).toHaveBeenCalledOnce()
  })

  it('settles failed when normalize reports an error, with no media url', async () => {
    const { db, svc } = service(vi.fn(async () => ({ ok: false as const, error: 'bad mp4' })))
    const id = seedModel(db)
    const render = await svc.createRender(USER, id, { presetId: 'studio', video: VIDEO, poster: POSTER })
    expect(render.status).toBe('failed')
    expect(render.errorMessage).toBe('bad mp4')
    expect(render.mediaUrl).toBeNull()
  })

  it('settles failed (not a thrown error to the caller) when the runner throws', async () => {
    const { db, svc } = service(vi.fn(async () => { throw new Error('ffmpeg crashed') }))
    const id = seedModel(db)
    const render = await svc.createRender(USER, id, { presetId: 'studio', video: VIDEO, poster: POSTER })
    expect(render.status).toBe('failed')
    expect(render.errorMessage).toBe('ffmpeg crashed')
  })

  it('allows a second concurrent render (semaphore of 2, unlike film’s single slot)', async () => {
    const gate = vi.fn(() => new Promise<{ ok: true }>((resolve) => setTimeout(() => resolve({ ok: true }), 10)))
    const { db, svc } = service(gate)
    const id = seedModel(db)
    const [a, b] = await Promise.all([
      svc.createRender(USER, id, { presetId: 'studio', video: VIDEO, poster: POSTER }),
      svc.createRender(USER, id, { presetId: 'product', video: VIDEO, poster: POSTER }),
    ])
    expect(a.status).toBe('succeeded')
    expect(b.status).toBe('succeeded')
    expect(gate).toHaveBeenCalledTimes(2)
  })
})

describe('listRenders / getRender / deleteRender', () => {
  it('lists only the requesting user’s renders, newest first', async () => {
    const { db, svc } = service(vi.fn(async () => ({ ok: true as const })))
    const id = seedModel(db)
    await svc.createRender(USER, id, { presetId: 'studio', video: VIDEO, poster: POSTER })
    await svc.createRender(USER, id, { presetId: 'product', video: VIDEO, poster: POSTER })
    const list = svc.listRenders(USER, id)
    expect(list).toHaveLength(2)
    expect(list[0]?.presetId).toBe('product')
  })

  it('getRender 404s for a render owned by someone else', async () => {
    const { db, svc } = service(vi.fn(async () => ({ ok: true as const })))
    const id = seedModel(db)
    const render = await svc.createRender(USER, id, { presetId: 'studio', video: VIDEO, poster: POSTER })
    db.insert(user)
      .values({ id: 'user-2', email: 'b@t.co', emailVerified: false, createdAt: new Date(), updatedAt: new Date() })
      .run()
    expect(() => svc.getRender('user-2', render.id)).toThrow()
  })

  it('deleteRender removes the row and nulls a share pointing at it', async () => {
    const { db, svc } = service(vi.fn(async () => ({ ok: true as const })))
    const id = seedModel(db)
    const render = await svc.createRender(USER, id, { presetId: 'studio', video: VIDEO, poster: POSTER })
    const { token } = svc.share(USER, id)
    expect(db.select().from(modelShare).where(eq(modelShare.id, token)).get()?.renderId).toBe(render.id)

    await svc.deleteRender(USER, render.id)
    expect(() => svc.getRender(USER, render.id)).toThrow()
    expect(db.select().from(modelShare).where(eq(modelShare.id, token)).get()?.renderId).toBeNull()
  })

  it('deleteRender 404s for an unknown id', async () => {
    const { svc } = service()
    await expect(svc.deleteRender(USER, 'nope')).rejects.toThrow()
  })
})

describe('share / revokeShare (idempotent token)', () => {
  it('mints one token and returns the SAME token on a repeat share', () => {
    const { db, svc } = service()
    const id = seedModel(db)
    const first = svc.share(USER, id)
    const second = svc.share(USER, id)
    expect(second.token).toBe(first.token)
  })

  it('refreshes the linked render on a later share without changing the token', async () => {
    const { db, svc } = service(vi.fn(async () => ({ ok: true as const })))
    const id = seedModel(db)
    const before = svc.share(USER, id)
    const render = await svc.createRender(USER, id, { presetId: 'studio', video: VIDEO, poster: POSTER })
    const after = svc.share(USER, id)
    expect(after.token).toBe(before.token)
    expect(db.select().from(modelShare).where(eq(modelShare.id, after.token)).get()?.renderId).toBe(render.id)
  })

  it('revokeShare deletes the row; a second revoke is a no-op, not a throw', () => {
    const { db, svc } = service()
    const id = seedModel(db)
    const { token } = svc.share(USER, id)
    svc.revokeShare(USER, id)
    expect(db.select().from(modelShare).where(eq(modelShare.id, token)).get()).toBeUndefined()
    expect(() => svc.revokeShare(USER, id)).not.toThrow()
  })
})

describe('resolveShare (the one public, unauthenticated read)', () => {
  it('404s for an unknown token', () => {
    const { svc } = service()
    expect(() => svc.resolveShare('nope')).toThrow()
  })

  it('returns the model with no render yet — glbUrl set, videoUrl/posterUrl null', () => {
    const { db, svc } = service()
    const id = seedModel(db)
    const { token } = svc.share(USER, id)
    const resolved = svc.resolveShare(token)
    expect(resolved).toEqual({
      token,
      glbUrl: '/media/gen-1.glb',
      posterUrl: null,
      videoUrl: null,
      title: 'a toy robot',
    })
  })

  it('includes the turntable video once a render has succeeded', async () => {
    const { db, svc } = service(vi.fn(async () => ({ ok: true as const })))
    const id = seedModel(db)
    await svc.createRender(USER, id, { presetId: 'studio', video: VIDEO, poster: POSTER })
    const { token } = svc.share(USER, id)
    const resolved = svc.resolveShare(token)
    expect(resolved.videoUrl).toMatch(/^\/media\/.+\.mp4$/)
    expect(resolved.posterUrl).toMatch(/^\/media\/.+\.webp$/)
  })

  it('does not leak the owner id, cost, or provider job id', () => {
    const { db, svc } = service()
    const id = seedModel(db)
    const { token } = svc.share(USER, id)
    expect(Object.keys(svc.resolveShare(token)).sort()).toEqual(
      ['glbUrl', 'posterUrl', 'title', 'token', 'videoUrl'].sort(),
    )
  })

  it('404s once the underlying generation is gone (dangling token, no FK)', () => {
    const { db, svc } = service()
    const id = seedModel(db)
    const { token } = svc.share(USER, id)
    db.delete(generation).where(eq(generation.id, id)).run()
    expect(() => svc.resolveShare(token)).toThrow()
  })

  it('404s while the model is mid-regeneration (status flipped off succeeded)', () => {
    const { db, svc } = service()
    const id = seedModel(db)
    const { token } = svc.share(USER, id)
    db.update(generation).set({ status: 'processing' }).where(eq(generation.id, id)).run()
    expect(() => svc.resolveShare(token)).toThrow()
  })
})

describe('settleStaleModelRenders reaper', () => {
  it('fails a processing render whose ffmpeg process died mid-normalize', async () => {
    const hang = vi.fn(() => new Promise<{ ok: true } | { ok: false; error: string }>(() => {}))
    const { db, svc } = service(hang)
    const id = seedModel(db)
    // Fire-and-don't-await: createRender holds the row 'processing' until the
    // never-resolving runner "completes".
    void svc.createRender(USER, id, { presetId: 'studio', video: VIDEO, poster: POSTER })
    await vi.waitFor(() => expect(hang).toHaveBeenCalledOnce())

    expect(svc.listRenders(USER, id)[0]?.status).toBe('processing')
    const failedCount = settleStaleModelRenders(db, Date.now() + STALE_MODEL_RENDER_MS + 1000)
    expect(failedCount).toBe(1)
    expect(svc.listRenders(USER, id)[0]?.status).toBe('failed')
  })

  it('leaves a fresh processing render alone', () => {
    const { db, svc } = service()
    expect(settleStaleModelRenders(db, Date.now())).toBe(0)
  })
})

describe('routes: auth + validation + the one public endpoint', () => {
  it('every render/share route requires a session except GET /api/share/:token', async () => {
    const app = await buildTestApp()
    const anon = await app.inject({ method: 'GET', url: '/api/models/x/renders' })
    expect(anon.statusCode).toBe(401)

    const publicRes = await app.inject({ method: 'GET', url: '/api/share/does-not-exist' })
    expect(publicRes.statusCode).toBe(404) // reached the handler, not an auth wall
  })

  it('400s on a render body that fails schema validation', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/models/whatever/renders',
      headers: { cookie },
      payload: { presetId: 'studio' }, // missing video/poster
    })
    expect(res.statusCode).toBe(400)
  })
})
