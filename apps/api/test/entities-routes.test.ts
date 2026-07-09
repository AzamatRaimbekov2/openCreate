// Entity library over real HTTP: auth, ownership across two accounts, the
// upload path writing real bytes, and the error envelopes the SPA depends on.
// The service tests cover the domain; this file covers the wire.
import { describe, expect, it } from 'vitest'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'

// 1x1 transparent GIF
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

async function createEntity(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  cookie: string,
  body: Record<string, unknown> = { kind: 'character', name: 'Аня', description: 'd' },
) {
  const res = await app.inject({ method: 'POST', url: '/api/entities', cookies: { session: '' }, headers: { cookie }, payload: body })
  return res
}

describe('entity routes', () => {
  it('requires a session', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/entities' })
    expect(res.statusCode).toBe(401)
  })

  it('creates, lists and fetches an entity', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    const created = await createEntity(app, cookie)
    expect(created.statusCode).toBe(201)
    const entity = created.json()
    expect(entity.name).toBe('Аня')
    expect(entity.primaryImageId).toBeNull()

    const list = await app.inject({ method: 'GET', url: '/api/entities', headers: { cookie } })
    expect(list.json().items).toHaveLength(1)

    const one = await app.inject({ method: 'GET', url: `/api/entities/${entity.id}`, headers: { cookie } })
    expect(one.statusCode).toBe(200)
  })

  it('rejects an invalid body with a validation envelope', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await createEntity(app, cookie, { kind: 'dragon', name: '' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })

  it('uploads an image, elects it primary, and serves it from our storage', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const entity = (await createEntity(app, cookie)).json()

    const res = await app.inject({
      method: 'POST',
      url: `/api/entities/${entity.id}/images`,
      headers: { cookie },
      payload: { dataUri: GIF, source: 'upload' },
    })
    expect(res.statusCode).toBe(201)
    const updated = res.json()
    expect(updated.images).toHaveLength(1)
    expect(updated.primaryImageId).toBe(updated.images[0].id)
    // OUR storage, never a provider url — Runware assets expire after 7 days
    expect(updated.images[0].url).toMatch(/^\/media\//)
  })

  it('refuses an svg upload (an image mime that carries script)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const entity = (await createEntity(app, cookie)).json()
    const res = await app.inject({
      method: 'POST',
      url: `/api/entities/${entity.id}/images`,
      headers: { cookie },
      payload: { dataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', source: 'upload' },
    })
    // The zod schema lets "data:image/..." through; the STORAGE layer is the gate.
    // Exactly 400 — a rejected upload is the client's fault. Asserting >=400 here
    // once hid a real 500.
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })

  it('never lets one user touch another user entity', async () => {
    const app = await buildTestApp()
    const alice = await registerAndGetCookie(app, 'alice@x.co')
    const bob = await registerAndGetCookie(app, 'bob@x.co')

    const entity = (await createEntity(app, alice)).json()

    // Bob sees nothing
    const bobList = await app.inject({ method: 'GET', url: '/api/entities', headers: { cookie: bob } })
    expect(bobList.json().items).toEqual([])

    // ...and cannot read, mutate or delete Alice's entity. 404, never 403:
    // a 403 would confirm the id exists, which is the fact we are protecting.
    for (const [method, url] of [
      ['GET', `/api/entities/${entity.id}`],
      ['PATCH', `/api/entities/${entity.id}`],
      ['DELETE', `/api/entities/${entity.id}`],
    ] as const) {
      const res = await app.inject({ method, url, headers: { cookie: bob }, payload: { name: 'hack' } })
      expect(res.statusCode).toBe(404)
    }
  })

  it('soft-deletes: gone from the library, 404 afterwards', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const entity = (await createEntity(app, cookie)).json()

    const del = await app.inject({ method: 'DELETE', url: `/api/entities/${entity.id}`, headers: { cookie } })
    expect(del.statusCode).toBe(204)

    const list = await app.inject({ method: 'GET', url: '/api/entities', headers: { cookie } })
    expect(list.json().items).toEqual([])

    const after = await app.inject({ method: 'GET', url: `/api/entities/${entity.id}`, headers: { cookie } })
    expect(after.statusCode).toBe(404)
  })

  it('rejects a primaryImageId that belongs to another entity', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const mine = (await createEntity(app, cookie)).json()
    const other = (await createEntity(app, cookie, { kind: 'object', name: 'Меч', description: '' })).json()

    const withImage = (
      await app.inject({
        method: 'POST',
        url: `/api/entities/${other.id}/images`,
        headers: { cookie },
        payload: { dataUri: GIF, source: 'upload' },
      })
    ).json()

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/entities/${mine.id}`,
      headers: { cookie },
      payload: { primaryImageId: withImage.images[0].id },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })
})
