// HTTP E2E suite for Modular 3D Assets (ADR modular-3d-assets, plan Task 10).
// Drives the whole aggregate THROUGH the routes with app.inject — CRUD, the FREE
// analyze 502, paid extract (charge + citation + refund isolation), paid mesh
// (async 202), derived-and-serialized part status, and ownership isolation over
// the money + mutation routes. Mirrors entities-portraits/generations-3d/films.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_PARTS } from '@opencreate/contracts'
import { buildTestApp, fakeRunware, fakeMeshProvider, registerAndGetCookie } from './helpers/build-test-app'
import type { RunwareClient } from '../src/integrations/runware/client'

const CONCEPT = 'data:image/png;base64,iVBORw0KGgo='

beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('bytes'), { status: 200 }))))
afterEach(() => vi.unstubAllGlobals())

describe('assets3d CRUD', () => {
  it('creates (201), lists, reads with parts, renames (200), deletes (204)', async () => {
    const app = await buildTestApp({})
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'Knight', conceptImage: CONCEPT } })
    expect(created.statusCode).toBe(201)
    const asset = created.json()
    expect(asset.conceptImageUrl).toMatch(/^\/media\//)
    const list = await app.inject({ method: 'GET', url: '/api/assets3d', headers: { cookie } })
    expect(list.json().items).toHaveLength(1)
    const detail = await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie } })
    expect(detail.json().parts).toEqual([])
    const renamed = await app.inject({ method: 'PATCH', url: `/api/assets3d/${asset.id}`, headers: { cookie }, payload: { title: 'Paladin' } })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json().title).toBe('Paladin')
    const del = await app.inject({ method: 'DELETE', url: `/api/assets3d/${asset.id}`, headers: { cookie } })
    expect(del.statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: '/api/assets3d', headers: { cookie } })).json().items).toHaveLength(0)
  })

  it('requires a session (401) and hides foreign/missing behind the same 404', async () => {
    const app = await buildTestApp({})
    expect((await app.inject({ method: 'GET', url: '/api/assets3d' })).statusCode).toBe(401)
    const a = await registerAndGetCookie(app, 'a@b.co')
    const b = await registerAndGetCookie(app, 'c@d.co')
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie: a }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    expect((await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie: b } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/assets3d/does-not-exist', headers: { cookie: b } })).statusCode).toBe(404)
  })

  it('parts: add (201), patch name/transform, delete (204)', async () => {
    const app = await buildTestApp({})
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const created = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet', description: 'steel' } })
    expect(created.statusCode).toBe(201)
    const part = created.json()
    expect(part.status).toBe('draft')
    expect(part.transform).toBeNull()
    const t = { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    const patched = await app.inject({ method: 'PATCH', url: `/api/assets3d/${asset.id}/parts/${part.id}`, headers: { cookie }, payload: { name: 'Casque', transform: t } })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().name).toBe('Casque')
    expect(patched.json().transform).toEqual(t)
    const del = await app.inject({ method: 'DELETE', url: `/api/assets3d/${asset.id}/parts/${part.id}`, headers: { cookie } })
    expect(del.statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie } })).json().parts).toEqual([])
  })
})

describe('analyze (FREE)', () => {
  it('without ANTHROPIC_API_KEY → 502 provider_error (wizard still usable by hand)', async () => {
    const app = await buildTestApp({}) // key defaults null
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const res = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/analyze`, headers: { cookie } })
    expect(res.statusCode).toBe(502)
    expect(res.json().error.code).toBe('provider_error')
  })
})

describe('parts + extract (paid image)', () => {
  it('adds a part, extracts it: charges the image price once, cites the image gen', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const before = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance
    const ext = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })
    expect(ext.statusCode).toBe(200)
    expect(ext.json().imageGenerationId).toBeTruthy()
    expect(ext.json().status).toBe('extracted')
    // MODEL RULE: ref-capable model, concept sent as a data: URI reference (never a provider URL)
    const task = rw.imageInference.mock.calls[0]![0]
    expect(task.referenceImages[0]).toMatch(/^data:image\//)
    const after = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance
    expect(after).toBe(before - 7) // flat image price (Seedream 5 Lite tier)
  })

  it('extract failure refunds and leaves the part draft (retryable)', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockRejectedValue(new Error('provider boom'))
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const res = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(res.json())).not.toContain('provider boom') // sanitized
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance).toBe(200) // refunded
    const detail = (await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie } })).json()
    expect(detail.parts[0].imageGenerationId).toBeNull()
    expect(detail.parts[0].status).toBe('draft')
  })

  it('a failed part is refunded and does NOT poison an already-extracted sibling', async () => {
    const rw = fakeRunware()
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const a = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const b = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Boots' } })).json()
    // Part A extracts cleanly (charged the image model's flat price, 8cr).
    rw.imageInference.mockResolvedValueOnce({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const extA = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${a.id}/extract`, headers: { cookie } })).json()
    expect(extA.imageGenerationId).toBeTruthy()
    expect(extA.status).toBe('extracted')
    // Part B fails and is refunded — A's citation and the net charge for A are untouched.
    rw.imageInference.mockRejectedValueOnce(new Error('provider boom'))
    const resB = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${b.id}/extract`, headers: { cookie } })
    expect(resB.statusCode).toBeGreaterThanOrEqual(400)
    const detail = (await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie } })).json()
    const partA = detail.parts.find((p: { id: string }) => p.id === a.id)
    const partB = detail.parts.find((p: { id: string }) => p.id === b.id)
    expect(partA.imageGenerationId).toBe(extA.imageGenerationId) // A's citation survives B's failure
    expect(partA.status).toBe('extracted')
    expect(partB.imageGenerationId).toBeNull() // B left draft, retryable
    expect(partB.status).toBe('draft')
    // Net charge = only A's flat image price (B refunded exactly once). 200 - 8 = 192.
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance).toBe(193)
  })
})

describe('mesh (paid model3d)', () => {
  it('rejects mesh before a succeeded extraction (400), provider never called, no charge', async () => {
    const mesh = fakeMeshProvider()
    const app = await buildTestApp({ meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const res = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: { cookie }, payload: { modelId: 'trellis-2' } })
    expect(res.statusCode).toBe(400)
    expect(mesh.submit).not.toHaveBeenCalled()
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance).toBe(200)
  })

  it('extract → mesh: 202, submits through meshProvider, produces a .glb, cites the mesh gen', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const mesh = fakeMeshProvider()
    mesh.submit.mockResolvedValue({ providerJobId: 'job-1' })
    mesh.poll.mockResolvedValue({ status: 'success', assetUrl: 'https://runware.ai/m.glb', costUsd: 0, nsfw: false })
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient, meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })
    const afterExtract = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance
    const meshed = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: { cookie }, payload: { modelId: 'trellis-2' } })
    expect(meshed.statusCode).toBe(202)
    const meshGenId = meshed.json().meshGenerationId
    expect(mesh.submit).toHaveBeenCalled()
    // CHARGE: the mesh submit debits exactly the trellis-2 catalog price (6cr) — a
    // moved number means a re-price or an illegal second ledger entry.
    const afterMesh = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance
    expect(afterMesh).toBe(afterExtract - 6)
    // Drive the async model3d poll to terminal, then assert the .glb citation.
    const gen = await app.inject({ method: 'GET', url: `/api/generations/${meshGenId}`, headers: { cookie } })
    // TYPE: it is a model3d generation — assert the persisted column, never infer
    // the type from the .glb suffix.
    expect(gen.json().type).toBe('model3d')
    expect(gen.json().status).toBe('succeeded')
    expect(gen.json().mediaUrls[0]).toMatch(/^\/media\/[\w-]+\.glb$/)
  })

  it('mesh failure refunds to the post-extract balance and the part derives back to extracted', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const mesh = fakeMeshProvider()
    mesh.submit.mockResolvedValue({ providerJobId: 'job-1' })
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient, meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })
    const afterExtract = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance
    // The mesh submits, but the provider poll reports a terminal error.
    mesh.poll.mockResolvedValue({ status: 'error', message: 'mesh boom' })
    const meshed = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: { cookie }, payload: { modelId: 'trellis-2' } })
    expect(meshed.statusCode).toBe(202)
    const meshGenId = meshed.json().meshGenerationId
    // Drive the async model3d poll to terminal → failed + refund (inside the money path).
    const gen = await app.inject({ method: 'GET', url: `/api/generations/${meshGenId}`, headers: { cookie } })
    expect(gen.json().status).toBe('failed')
    // Refunded exactly the mesh price → back to the post-extract balance (charge+refund net zero).
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance).toBe(afterExtract)
    // The part is RETRYABLE: a failed mesh derives back to 'extracted', not stuck 'meshing'.
    const detail = (await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie } })).json()
    expect(detail.parts[0].status).toBe('extracted')
    expect(detail.parts[0].meshGenerationId).toBe(meshGenId) // citation kept; re-mesh replaces it
  })

  it('re-extracting a meshed part nulls the stale mesh citation and derives back to extracted (Bug 1)', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const mesh = fakeMeshProvider()
    mesh.submit.mockResolvedValue({ providerJobId: 'job-1' })
    mesh.poll.mockResolvedValue({ status: 'success', assetUrl: 'https://runware.ai/m.glb', costUsd: 0, nsfw: false })
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient, meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const ext1 = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })).json()
    const meshed = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: { cookie }, payload: { modelId: 'trellis-2' } })
    const meshGenId = meshed.json().meshGenerationId
    // Confirm the part is fully ready (image + mesh both cited and succeeded).
    let detail = (await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie } })).json()
    expect(detail.parts[0].status).toBe('ready')
    expect(detail.parts[0].meshGenerationId).toBe(meshGenId)
    // Re-extract: the NEW extraction image invalidates the mesh built from the OLD one.
    const ext2 = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })).json()
    expect(ext2.imageGenerationId).not.toBe(ext1.imageGenerationId) // a fresh extraction
    expect(ext2.meshGenerationId).toBeNull() // stale mesh citation dropped in the same write
    expect(ext2.status).toBe('extracted') // must be re-meshed against the new image
    // A fresh read agrees — no path leaves a stale 'ready'.
    detail = (await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie } })).json()
    expect(detail.parts[0].meshGenerationId).toBeNull()
    expect(detail.parts[0].status).toBe('extracted')
  })

  it('rejects a re-mesh while the mesh is still processing, but allows a re-roll once ready (Bug 3)', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const mesh = fakeMeshProvider()
    mesh.submit.mockResolvedValue({ providerJobId: 'job-1' })
    mesh.poll.mockResolvedValue({ status: 'processing', progress: 10 })
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient, meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })
    const afterExtract = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance
    // First mesh submits and stays processing.
    const first = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: { cookie }, payload: { modelId: 'trellis-2' } })
    expect(first.statusCode).toBe(202)
    const firstMeshGenId = first.json().meshGenerationId
    const afterFirstMesh = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance
    expect(afterFirstMesh).toBe(afterExtract - 6) // charged once
    expect(mesh.submit).toHaveBeenCalledTimes(1)
    // Duplicate click while the mesh is still processing → 400, NO second charge,
    // the provider is NOT re-submitted (the orphaned-double-spend this guard prevents).
    const dup = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: { cookie }, payload: { modelId: 'trellis-2' } })
    expect(dup.statusCode).toBe(400)
    expect(mesh.submit).toHaveBeenCalledTimes(1) // no new submit
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance).toBe(afterFirstMesh)
    // Once the mesh has SUCCEEDED, a re-roll IS allowed (ADR D3 — old gen stays, citation replaced).
    mesh.poll.mockResolvedValue({ status: 'success', assetUrl: 'https://runware.ai/m.glb', costUsd: 0, nsfw: false })
    await app.inject({ method: 'GET', url: `/api/generations/${firstMeshGenId}`, headers: { cookie } }) // poll → succeeded
    const reroll = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: { cookie }, payload: { modelId: 'trellis-2' } })
    expect(reroll.statusCode).toBe(202)
    expect(mesh.submit).toHaveBeenCalledTimes(2) // the re-roll submitted a new mesh
    expect(reroll.json().meshGenerationId).not.toBe(firstMeshGenId) // citation replaced
  })
})

describe('MAX_PARTS cap on manual add (Bug 2)', () => {
  it('rejects adding a part beyond MAX_PARTS', async () => {
    const app = await buildTestApp({})
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    // Fill exactly to the cap.
    for (let i = 0; i < MAX_PARTS; i++) {
      const res = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: `Part ${i}` } })
      expect(res.statusCode).toBe(201)
    }
    // The next manual add is refused — no unbounded append.
    const over = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Overflow' } })
    expect(over.statusCode).toBe(400)
    expect(over.json().error.code).toBe('validation_failed')
    // The asset still holds exactly MAX_PARTS parts.
    const detail = (await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie } })).json()
    expect(detail.parts).toHaveLength(MAX_PARTS)
  })
})

describe('derived part status is serialized and transitions with the cited generations', () => {
  it('draft → extracted → meshing → ready, observed THROUGH GET /api/assets3d/:id', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const mesh = fakeMeshProvider()
    mesh.submit.mockResolvedValue({ providerJobId: 'job-1' })
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient, meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const statusOf = async () =>
      (await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie } })).json().parts[0].status
    // Fresh part: no citations → draft.
    expect(await statusOf()).toBe('draft')
    // Extract settles synchronously (succeeded image gen) → extracted.
    await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })
    expect(await statusOf()).toBe('extracted')
    // Mesh cites an async model3d gen still processing → meshing.
    mesh.poll.mockResolvedValue({ status: 'processing' })
    const meshed = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: { cookie }, payload: { modelId: 'trellis-2' } })
    const meshGenId = meshed.json().meshGenerationId
    expect(await statusOf()).toBe('meshing')
    // Drive the model3d poll to terminal, then the same GET derives ready.
    mesh.poll.mockResolvedValue({ status: 'success', assetUrl: 'https://runware.ai/m.glb', costUsd: 0, nsfw: false })
    await app.inject({ method: 'GET', url: `/api/generations/${meshGenId}`, headers: { cookie } })
    expect(await statusOf()).toBe('ready')
  })
})

describe('ownership isolation covers the money + mutation routes, not just reads', () => {
  it('user B is 404 on every extract/mesh/patch/delete/part-add of A’s asset; no provider call, no charge, A untouched', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const mesh = fakeMeshProvider()
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient, meshProvider: mesh })
    const a = await registerAndGetCookie(app, 'a@b.co')
    const b = await registerAndGetCookie(app, 'c@d.co')
    // A creates an asset + part and extracts it (A charged the image price).
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie: a }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie: a }, payload: { name: 'Helmet' } })).json()
    const ext = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie: a } })).json()
    const aCreditsAfterExtract = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: a } })).json().creditsBalance
    rw.imageInference.mockClear()
    // Every B mutation on A's aggregate → 404 (same as missing), providers never touched.
    const H = { cookie: b }
    const cases = [
      app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: H, payload: { name: 'Sneak' } }),
      app.inject({ method: 'PATCH', url: `/api/assets3d/${asset.id}`, headers: H, payload: { title: 'hax' } }),
      app.inject({ method: 'DELETE', url: `/api/assets3d/${asset.id}`, headers: H }),
      app.inject({ method: 'PATCH', url: `/api/assets3d/${asset.id}/parts/${part.id}`, headers: H, payload: { name: 'hax' } }),
      app.inject({ method: 'DELETE', url: `/api/assets3d/${asset.id}/parts/${part.id}`, headers: H }),
      app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: H }),
      app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: H, payload: { modelId: 'trellis-2' } }),
    ]
    for (const res of await Promise.all(cases)) expect(res.statusCode).toBe(404)
    expect(rw.imageInference).not.toHaveBeenCalled() // B never reached the money path
    expect(mesh.submit).not.toHaveBeenCalled()
    // A's citation and credits are untouched by B's attempts.
    const detail = (await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie: a } })).json()
    expect(detail.parts[0].imageGenerationId).toBe(ext.imageGenerationId)
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: a } })).json().creditsBalance).toBe(aCreditsAfterExtract)
  })
})

describe('delete never touches cited generations', () => {
  it('deleting an asset removes rows but leaves the extraction generation in the library', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const ext = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })).json()
    await app.inject({ method: 'DELETE', url: `/api/assets3d/${asset.id}`, headers: { cookie } })
    const gen = await app.inject({ method: 'GET', url: `/api/generations/${ext.imageGenerationId}`, headers: { cookie } })
    expect(gen.statusCode).toBe(200) // generation survives the aggregate delete
  })
})
