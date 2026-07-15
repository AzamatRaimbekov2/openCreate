// Soul Studio's reference sheet over real HTTP, through the REAL generation
// service — which is the only reason this file exists alongside the unit tests.
// The unit tests fake the money path to assert the model rule; this one lets the
// actual ledger run, because the two claims the ADR makes about cost ("a sheet is
// 2 + 3×8 = 26 credits" and "Soul Studio adds zero ledger code") are only true if
// the real charge path is what executes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Soul } from '@opencreate/contracts'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'

// The image success path downloads the produced asset via global fetch
// (storage.saveFromUrl) — stub it so tests never hit the network.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const SOUL: Soul = {
  archetype: 'male',
  styleId: 'comic',
  build: 'hulking',
  traits: ['iron-arm', 'facial-scar'],
  notes: '',
}

// A provider that always succeeds. The AIR ids it was called with are how we
// assert the model rule from the outside: runware:101@1 is flux-dev (the hero
// shot), bfl:3@1 is flux-kontext-pro (every referencing view).
const HERO_AIR = 'runware:101@1'
const SHEET_AIR = 'bfl:3@1'

function succeedingRunware() {
  const rw = fakeRunware()
  rw.imageInference.mockResolvedValue({
    imageURL: 'https://im.runware.ai/a.webp',
    cost: 0.002,
    seed: 1,
    NSFWContent: false,
  })
  return rw
}

// `null` — not `undefined` — is the "build a soul-LESS entity" argument: a
// default parameter fires on undefined, which would silently hand the test a
// soul it was written to prove we do not have.
async function createSoulEntity(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  cookie: string,
  soul: Soul | null = SOUL,
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/entities',
    headers: { cookie },
    payload: { kind: 'character', name: 'Капитан', description: '', ...(soul ? { soul } : {}) },
  })
  return res.json()
}

describe('POST /api/entities/:id/portraits', () => {
  it('mints a four-view sheet: hero on flux-dev, the rest on kontext with a self-reference', async () => {
    const rw = succeedingRunware()
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const entity = await createSoulEntity(app, cookie)

    const res = await app.inject({
      method: 'POST',
      url: `/api/entities/${entity.id}/portraits`,
      headers: { cookie },
      payload: { views: ['front', 'three-quarter', 'profile', 'full-body'] },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.portraits).toHaveLength(4)
    expect(body.portraits.every((p: { errorCode: string | null }) => p.errorCode === null)).toBe(true)
    expect(body.entity.images.map((i: { view: string }) => i.view)).toEqual([
      'front',
      'three-quarter',
      'profile',
      'full-body',
    ])

    // THE MODEL RULE, observed from outside the service: the first call has no
    // reference and runs on the cheap model; the other three carry a reference
    // image and run on the only model that accepts one.
    const calls = rw.imageInference.mock.calls.map(([task]) => task)
    expect(calls).toHaveLength(4)
    expect(calls[0].model).toBe(HERO_AIR)
    expect(calls[0].referenceImages).toBeUndefined()
    for (const call of calls.slice(1)) {
      expect(call.model).toBe(SHEET_AIR)
      // The character conditioning on its own hero shot — the reference arrives
      // as a data URI read back out of OUR storage, never as a provider URL.
      expect(call.referenceImages).toHaveLength(1)
      expect(call.referenceImages[0]).toMatch(/^data:image\//)
      // ...and it must carry NO negative prompt. Kontext is an edit model with no
      // negative channel, and Runware does not ignore the parameter — it rejects
      // the whole task. This assertion is the one that was missing: the check
      // below only ever looked at calls[0] (flux-dev, which accepts a negative),
      // so a live sheet charged 24 credits for three views that all died at the
      // provider and returned nothing. Caught by minting a real sheet, not here.
      expect(call.negativePrompt).toBeUndefined()
    }
    // The reference-sheet framing's negative DID reach the model that can take one
    // (it is what makes "clean and unambiguous" a tested thing rather than a wish).
    expect(calls[0].negativePrompt).toContain('busy background')
    expect(calls[0].negativePrompt).toContain('photorealistic')

    // 2 + 3×8 = 26, charged by the ONE money path. If this number moves, either
    // the catalogue was re-priced or Soul Studio grew a ledger of its own.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200 - 26)
  })

  it('reports a failed view, refunds it, and still delivers the others', async () => {
    const rw = fakeRunware()
    rw.imageInference
      .mockResolvedValueOnce({ imageURL: 'https://im.runware.ai/a.webp', cost: 0.002, seed: 1, NSFWContent: false })
      .mockRejectedValueOnce(new Error('provider exploded'))
      .mockResolvedValueOnce({ imageURL: 'https://im.runware.ai/c.webp', cost: 0.002, seed: 3, NSFWContent: false })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const entity = await createSoulEntity(app, cookie)

    const res = await app.inject({
      method: 'POST',
      url: `/api/entities/${entity.id}/portraits`,
      headers: { cookie },
      payload: { views: ['front', 'three-quarter', 'profile'] },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.portraits[1].generationId).toBeNull()
    // A CODE, from the closed set the SPA localizes — never the thrown message.
    // The provider's own text is operator material (it can name our hosts, our
    // task ids, our account), and everything in this body reaches the browser.
    expect(body.portraits[1].errorCode).toBeTruthy()
    expect(JSON.stringify(body)).not.toContain('provider exploded')
    expect(body.portraits[2].generationId).toEqual(expect.any(String))
    expect(body.entity.images.map((i: { view: string }) => i.view)).toEqual(['front', 'profile'])

    // The failed view was refunded by the generation service — Soul Studio does
    // not (and must not) refund anything itself. 2 + 8 charged, 8 charged-and-
    // returned: the user pays only for what they received.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200 - 10)
  })

  it('refuses an entity with no soul, before spending anything', async () => {
    const rw = succeedingRunware()
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const entity = await createSoulEntity(app, cookie, null)

    const res = await app.inject({
      method: 'POST',
      url: `/api/entities/${entity.id}/portraits`,
      headers: { cookie },
      payload: { views: ['front'] },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
    expect(rw.imageInference).not.toHaveBeenCalled()
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('never mints portraits on another user character', async () => {
    const rw = succeedingRunware()
    const app = await buildTestApp({ runware: rw })
    const alice = await registerAndGetCookie(app, 'alice@x.co')
    const bob = await registerAndGetCookie(app, 'bob@x.co')
    const entity = await createSoulEntity(app, alice)

    const res = await app.inject({
      method: 'POST',
      url: `/api/entities/${entity.id}/portraits`,
      headers: { cookie: bob },
      payload: { views: ['front'] },
    })

    // 404, never 403 — a 403 would confirm the id exists.
    expect(res.statusCode).toBe(404)
    expect(rw.imageInference).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/entities/whatever/portraits',
      payload: { views: ['front'] },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/entities/:id/images — the union did not break the old call', () => {
  // The body became a discriminated union when the 'generated' branch landed.
  // The upload branch DEFAULTS its source, so the call the entity editor has been
  // making since day one — a bare { dataUri } — must still parse. This is the
  // regression test for that promise.
  it('still accepts a bare { dataUri } with no source', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const entity = await createSoulEntity(app, cookie, null)

    const res = await app.inject({
      method: 'POST',
      url: `/api/entities/${entity.id}/images`,
      headers: { cookie },
      payload: { dataUri: GIF },
    })

    expect(res.statusCode).toBe(201)
    const updated = res.json()
    expect(updated.images[0].source).toBe('upload')
    expect(updated.images[0].view).toBeNull()
    expect(updated.primaryImageId).toBe(updated.images[0].id)
  })

  it('refuses to attach another user generation', async () => {
    const rw = succeedingRunware()
    const app = await buildTestApp({ runware: rw })
    const alice = await registerAndGetCookie(app, 'alice@x.co')
    const bob = await registerAndGetCookie(app, 'bob@x.co')

    // Alice pays for an image.
    const gen = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie: alice },
      payload: { modelId: 'flux-dev', prompt: 'a portrait', aspectRatio: '1:1' },
    })
    const generationId = gen.json().id

    // Bob tries to staple it onto his own character. If this worked, any user
    // could read any other user's private image back out of their own entity.
    const bobEntity = await createSoulEntity(app, bob)
    const res = await app.inject({
      method: 'POST',
      url: `/api/entities/${bobEntity.id}/images`,
      headers: { cookie: bob },
      payload: { source: 'generated', generationId, view: 'front' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
    // ...and the message does not distinguish "not yours" from "does not exist".
    expect(res.json().error.message).not.toMatch(/another user|belongs to/i)
  })
})
