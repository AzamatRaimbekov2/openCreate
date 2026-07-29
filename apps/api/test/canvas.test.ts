// HTTP tests for the canvas aggregate: CRUD, ownership scoping, full-document
// PATCH semantics (replace, not merge), and the bounds. Mirrors films.test.ts.
import { describe, expect, it } from 'vitest'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'

const NODE = {
  id: 'n1',
  kind: 'image',
  position: { x: 10, y: 20 },
  config: { prompt: 'a fox', modelId: 'flux-dev', aspectRatio: '1:1' },
  generationIds: [],
}

describe('canvas CRUD', () => {
  it('requires a session on every route', async () => {
    const app = await buildTestApp()
    for (const [method, url] of [
      ['GET', '/api/canvases'],
      ['POST', '/api/canvases'],
      ['GET', '/api/canvases/c1'],
      ['PATCH', '/api/canvases/c1'],
      ['DELETE', '/api/canvases/c1'],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        ...(method === 'POST' || method === 'PATCH' ? { payload: {} } : {}),
      })
      expect(res.statusCode, `${method} ${url}`).toBe(401)
    }
  })

  it('creates, lists, reads, patches (full replace) and deletes a canvas', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/canvases',
      headers: { cookie },
      payload: { title: 'Fox chain' },
    })
    expect(created.statusCode).toBe(201)
    const { id } = created.json() as { id: string }

    const list = await app.inject({ method: 'GET', url: '/api/canvases', headers: { cookie } })
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1)

    // PATCH the full doc: nodes + edges + viewport land
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/canvases/${id}`,
      headers: { cookie },
      payload: {
        viewport: { x: 5, y: 6, zoom: 1.5 },
        nodes: [
          NODE,
          {
            id: 'n2',
            kind: 'note',
            position: { x: 0, y: 0 },
            config: { text: 'todo' },
            generationIds: [],
          },
        ],
        edges: [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' }],
      },
    })
    expect(patched.statusCode).toBe(200)

    const detail = await app.inject({
      method: 'GET',
      url: `/api/canvases/${id}`,
      headers: { cookie },
    })
    const doc = detail.json() as { nodes: unknown[]; edges: unknown[]; viewport: { zoom: number } }
    expect(doc.nodes).toHaveLength(2)
    expect(doc.edges).toHaveLength(1)
    expect(doc.viewport.zoom).toBe(1.5)

    // Second PATCH REPLACES the collections (fewer nodes → fewer stored)
    await app.inject({
      method: 'PATCH',
      url: `/api/canvases/${id}`,
      headers: { cookie },
      payload: { nodes: [NODE], edges: [] },
    })
    const after = (
      await app.inject({ method: 'GET', url: `/api/canvases/${id}`, headers: { cookie } })
    ).json() as {
      nodes: unknown[]
      edges: unknown[]
    }
    expect(after.nodes).toHaveLength(1)
    expect(after.edges).toHaveLength(0)

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/canvases/${id}`,
      headers: { cookie },
    })
    expect(del.statusCode).toBe(204)
    const gone = await app.inject({
      method: 'GET',
      url: `/api/canvases/${id}`,
      headers: { cookie },
    })
    expect(gone.statusCode).toBe(404)
  })

  it('scopes by owner: a foreign canvas 404s on read, patch and delete', async () => {
    const app = await buildTestApp()
    const owner = await registerAndGetCookie(app, 'owner@x.co')
    const stranger = await registerAndGetCookie(app, 'stranger@x.co')
    const { id } = (
      await app.inject({
        method: 'POST',
        url: '/api/canvases',
        headers: { cookie: owner },
        payload: { title: 'Mine' },
      })
    ).json() as { id: string }

    for (const [method, url] of [
      ['GET', `/api/canvases/${id}`],
      ['PATCH', `/api/canvases/${id}`],
      ['DELETE', `/api/canvases/${id}`],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        headers: { cookie: stranger },
        ...(method === 'PATCH' ? { payload: { title: 'Stolen' } } : {}),
      })
      expect(res.statusCode, `${method}`).toBe(404)
    }
  })

  it('rejects an invalid document with the validation envelope', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const { id } = (
      await app.inject({
        method: 'POST',
        url: '/api/canvases',
        headers: { cookie },
        payload: { title: 'X' },
      })
    ).json() as { id: string }
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/canvases/${id}`,
      headers: { cookie },
      payload: {
        nodes: [
          { id: 'n1', kind: 'shader', position: { x: 0, y: 0 }, config: {}, generationIds: [] },
        ],
      },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: { code: string } }).error.code).toBe('validation_failed')
  })

  it('stores an upload and returns its /media path; rejects svg', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const { id } = (
      await app.inject({
        method: 'POST',
        url: '/api/canvases',
        headers: { cookie },
        payload: { title: 'U' },
      })
    ).json() as { id: string }
    // 1x1 png
    const PNG =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const ok = await app.inject({
      method: 'POST',
      url: `/api/canvases/${id}/uploads`,
      headers: { cookie },
      payload: { dataUri: PNG },
    })
    expect(ok.statusCode).toBe(201)
    expect((ok.json() as { uploadUrl: string }).uploadUrl).toMatch(/^\/media\//)

    const svg = await app.inject({
      method: 'POST',
      url: `/api/canvases/${id}/uploads`,
      headers: { cookie },
      payload: { dataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
    })
    expect(svg.statusCode).toBe(400)
  })
})
