// Style Studio registry + owner-scoped CRUD (ADR: style-studio D1/D2/D4).
//
// The rules this file exists to hold:
//  · a style list is the 7 builtins PLUS the caller's own rows, never anyone
//    else's — public/shared styles are out of scope, so a leak here is a bug;
//  · a foreign style and a missing one are INDISTINGUISHABLE (404), the films
//    and canvas precedent — an attacker must not be able to probe which ids
//    exist by reading status codes;
//  · a builtin is immutable for everyone, and that refusal is a 400, not a 404,
//    because a builtin demonstrably exists (it ships in the SPA bundle) and the
//    objection is to the ACTION, not to the id;
//  · a preview must CITE a generation the caller already paid for — same four
//    default-deny checks and the same single message as copyGeneratedAsset, so
//    a probe learns nothing about other people's rows;
//  · the registry NEVER charges. Every refusal above leaves the balance alone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'
import { createDb } from '../src/db/client'
import { createStyleService } from '../src/modules/styles/service'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

const NEON = { name: 'Неоновый нуар', fragment: 'neon noir, wet asphalt reflections' }

async function createStyle(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  cookie: string,
  payload: Record<string, unknown> = NEON,
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/styles',
    headers: { cookie },
    payload,
  })
  return res
}

// A succeeded IMAGE generation belonging to `cookie`'s user — the only thing a
// preview may cite.
async function generateImage(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  cookie: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/generations',
    headers: { cookie },
    payload: { modelId: 'flux-schnell', prompt: 'preview', aspectRatio: '1:1' },
  })
  if (res.statusCode !== 201) throw new Error(`generation failed: ${res.body}`)
  return res.json().id as string
}

async function balanceOf(app: Awaited<ReturnType<typeof buildTestApp>>, cookie: string) {
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
  return me.json().creditsBalance as number
}

describe('styles: authentication', () => {
  it('refuses every route without a session', async () => {
    const app = await buildTestApp()
    for (const [method, url] of [
      ['GET', '/api/styles'],
      ['POST', '/api/styles'],
      ['PATCH', '/api/styles/x'],
      ['DELETE', '/api/styles/x'],
    ] as const) {
      const res = await app.inject({ method, url, payload: {} })
      expect(res.statusCode).toBe(401)
    }
  })
})

describe('styles: the registry list', () => {
  it('lists the 7 builtins for a user who has created nothing', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({ method: 'GET', url: '/api/styles', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<Record<string, unknown>>
    expect(items).toHaveLength(7)
    expect(items.every((s) => s.builtin === true)).toBe(true)
    const anime = items.find((s) => s.id === 'anime')!
    // Fragments are exposed read-only: the Style Studio's whole premise is that
    // a user can read a builtin and build a better one.
    expect(anime.fragment).toContain('anime style')
    expect(anime.negative).toContain('photorealistic')
    // Builtins are code — no row, so no timestamps and no preview.
    expect(anime.createdAt).toBeNull()
    expect(anime.previewUrl).toBeNull()
  })

  it('appends the caller’s own styles and hides everyone else’s', async () => {
    const app = await buildTestApp()
    const mine = await registerAndGetCookie(app, 'mine@b.co')
    const theirs = await registerAndGetCookie(app, 'theirs@b.co')
    await createStyle(app, mine)
    await createStyle(app, theirs, { name: 'Их стиль', fragment: 'their fragment' })

    const res = await app.inject({ method: 'GET', url: '/api/styles', headers: { cookie: mine } })
    const items = res.json().items as Array<Record<string, unknown>>
    expect(items).toHaveLength(8)
    const own = items.filter((s) => s.builtin === false)
    expect(own).toHaveLength(1)
    expect(own[0]!.name).toBe('Неоновый нуар')
    expect(JSON.stringify(items)).not.toContain('their fragment')
  })
})

describe('styles: owner-scoped CRUD', () => {
  it('creates, reads back, patches and deletes a style', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    const created = await createStyle(app, cookie)
    expect(created.statusCode).toBe(201)
    const style = created.json()
    expect(style.builtin).toBe(false)
    expect(style.kind).toBe('prompt')
    expect(style.negative).toBe('')
    expect(style.recommendedModelId).toBeNull()
    expect(style.previewUrl).toBeNull()

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/styles/${style.id}`,
      headers: { cookie },
      payload: { name: 'Неон 2', negative: 'daylight, pastel' },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().name).toBe('Неон 2')
    expect(patched.json().negative).toBe('daylight, pastel')
    // Untouched fields survive a partial patch.
    expect(patched.json().fragment).toBe(NEON.fragment)

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/styles/${style.id}`,
      headers: { cookie },
    })
    expect(removed.statusCode).toBe(204)
    const after = await app.inject({ method: 'GET', url: '/api/styles', headers: { cookie } })
    expect(after.json().items).toHaveLength(7)
  })

  it('rejects a style with no fragment before it ever reaches the db', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await createStyle(app, cookie, { name: 'X', fragment: '' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })

  it('answers 404 for another user’s style — foreign is indistinguishable from missing', async () => {
    const app = await buildTestApp()
    const mine = await registerAndGetCookie(app, 'mine@b.co')
    const theirs = await registerAndGetCookie(app, 'theirs@b.co')
    const style = (await createStyle(app, theirs)).json()

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/styles/${style.id}`,
      headers: { cookie: mine },
      payload: { name: 'hijacked' },
    })
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/styles/${style.id}`,
      headers: { cookie: mine },
    })
    const missing = await app.inject({
      method: 'DELETE',
      url: '/api/styles/does-not-exist',
      headers: { cookie: mine },
    })
    expect(patch.statusCode).toBe(404)
    expect(del.statusCode).toBe(404)
    // The SAME status and the SAME message as an id that simply is not there.
    expect(missing.statusCode).toBe(404)
    expect(del.json().error.message).toBe(missing.json().error.message)

    // …and the owner still has it.
    const owner = await app.inject({ method: 'GET', url: '/api/styles', headers: { cookie: theirs } })
    expect(owner.json().items).toHaveLength(8)
  })

  it('refuses to modify or delete a builtin — 400, because it exists but is code', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/styles/anime',
      headers: { cookie },
      payload: { fragment: 'sabotage' },
    })
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/styles/anime',
      headers: { cookie },
    })
    expect(patch.statusCode).toBe(400)
    expect(del.statusCode).toBe(400)
    // Still intact for everyone.
    const res = await app.inject({ method: 'GET', url: '/api/styles', headers: { cookie } })
    const anime = (res.json().items as Array<Record<string, unknown>>).find((s) => s.id === 'anime')!
    expect(anime.fragment).toContain('anime style')
  })
})

// resolveStyleFragments is the function the GENERATION service calls before it
// charges, so its precedence and its ownership rule are tested directly rather
// than only through an endpoint.
describe('styles: resolveStyleFragments — what a styleId means for a caller', () => {
  it('answers builtin fragments, own-row fragments, and null for everything else', async () => {
    const db = createDb(':memory:').db
    const app = await buildTestApp({ db })
    const mine = await registerAndGetCookie(app, 'mine@b.co')
    const theirs = await registerAndGetCookie(app, 'theirs@b.co')
    const ownStyle = (await createStyle(app, mine)).json()
    const foreignStyle = (
      await createStyle(app, theirs, { name: 'Их', fragment: 'their fragment' })
    ).json()

    // Same db, so the registry sees exactly the rows the HTTP calls wrote.
    const registry = createStyleService({ db })
    const me = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: mine } })).json()

    expect(registry.resolveStyleFragments(me.id, 'anime')).toEqual({
      fragment: expect.stringContaining('anime style'),
      negative: expect.stringContaining('photorealistic'),
    })
    expect(registry.resolveStyleFragments(me.id, ownStyle.id)).toEqual({
      fragment: NEON.fragment,
      negative: '',
    })
    // Someone else's style is as unusable as one that never existed — and both
    // read as the same null, so a generation cannot probe for foreign ids.
    expect(registry.resolveStyleFragments(me.id, foreignStyle.id)).toBeNull()
    expect(registry.resolveStyleFragments(me.id, 'no-such-style')).toBeNull()
    // Prototype keys are not styles (resolveBuiltinStyle uses Object.hasOwn).
    expect(registry.resolveStyleFragments(me.id, 'constructor')).toBeNull()
  })

  it('resolves a deleted style to null — the film keeps the id, the generation refuses', async () => {
    const db = createDb(':memory:').db
    const app = await buildTestApp({ db })
    const cookie = await registerAndGetCookie(app)
    const created = (await createStyle(app, cookie)).json()
    const me = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json()
    const registry = createStyleService({ db })
    expect(registry.resolveStyleFragments(me.id, created.id)).not.toBeNull()

    await app.inject({ method: 'DELETE', url: `/api/styles/${created.id}`, headers: { cookie } })
    expect(registry.resolveStyleFragments(me.id, created.id)).toBeNull()
  })
})

describe('styles: the preview citation is default-deny', () => {
  it('accepts the caller’s own succeeded image generation and resolves its media', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const style = (await createStyle(app, cookie)).json()
    const generationId = await generateImage(app, cookie)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/styles/${style.id}`,
      headers: { cookie },
      payload: { previewGenerationId: generationId },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().previewUrl).toMatch(/^\/media\/.+\.webp$/)
  })

  it('refuses a foreign, a missing, a failed and a video citation with ONE message — and charges nothing', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    rw.submitVideo.mockResolvedValue(undefined)
    const app = await buildTestApp({ runware: rw })
    const mine = await registerAndGetCookie(app, 'mine@b.co')
    const theirs = await registerAndGetCookie(app, 'theirs@b.co')
    const style = (await createStyle(app, mine)).json()

    // Someone else's image generation.
    const foreign = await generateImage(app, theirs)
    // A processing VIDEO of my own: right owner, wrong type and not finished.
    const video = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie: mine },
      payload: { modelId: 'pixverse-v6', prompt: 'clip', aspectRatio: '16:9', duration: 5 },
    })
    const videoId = video.json().id as string

    const before = await balanceOf(app, mine)
    const messages = new Set<string>()
    for (const id of [foreign, videoId, 'no-such-generation']) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/styles/${style.id}`,
        headers: { cookie: mine },
        payload: { previewGenerationId: id },
      })
      expect(res.statusCode).toBe(400)
      messages.add(res.json().error.message)
    }
    // One message for every refusal: nothing about other users' rows leaks
    // through the difference between "not yours" and "not there".
    expect(messages.size).toBe(1)
    expect(balanceOf(app, mine)).resolves.toBe(before)

    // The style kept its (absent) preview.
    const list = await app.inject({ method: 'GET', url: '/api/styles', headers: { cookie: mine } })
    const own = (list.json().items as Array<Record<string, unknown>>).find((s) => !s.builtin)!
    expect(own.previewUrl).toBeNull()
  })

  it('reads a preview whose generation was later deleted as null, never an error', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const style = (await createStyle(app, cookie)).json()
    const generationId = await generateImage(app, cookie)
    await app.inject({
      method: 'PATCH',
      url: `/api/styles/${style.id}`,
      headers: { cookie },
      payload: { previewGenerationId: generationId },
    })
    await app.inject({
      method: 'DELETE',
      url: `/api/generations/${generationId}`,
      headers: { cookie },
    })

    const res = await app.inject({ method: 'GET', url: '/api/styles', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    const own = (res.json().items as Array<Record<string, unknown>>).find((s) => !s.builtin)!
    expect(own.previewUrl).toBeNull()
  })
})
