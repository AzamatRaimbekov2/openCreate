// Style resolution at generation time (ADR style-studio D1/D3).
//
// THE REGRESSION PIN comes first and is the reason this file exists. Opening
// `styleId` from an enum to a free string moved the style fragments out of
// applyPromptPreset's own table lookup and into a registry the server resolves
// BEFORE composing. That refactor is only safe if a builtin style still reaches
// the provider as the exact same bytes, so the expectations below are LITERAL
// strings captured from the pre-refactor code — not `STYLE_PRESETS.anime.
// fragment`, which would move together with a mistake and pin nothing.
//
// The rest of the file is the new behavior: a user style applies everywhere a
// builtin one does, and an unresolvable id costs the caller nothing.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'

// A minimal but valid raster image data URI (8-byte PNG signature): saveDataUri
// stores it, and readAsDataUri reads it back at generation time.
const PNG = 'data:image/png;base64,iVBORw0KGgo='

async function createStyle(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  cookie: string,
  payload: Record<string, unknown>,
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/styles',
    headers: { cookie },
    payload,
  })
  if (res.statusCode !== 201) throw new Error(`style create failed: ${res.body}`)
  return res.json()
}

async function attachRef(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  cookie: string,
  styleId: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/styles/${styleId}/references`,
    headers: { cookie },
    payload: { dataUri: PNG },
  })
  if (res.statusCode !== 201) throw new Error(`style reference upload failed: ${res.body}`)
  const refs = res.json().referenceImages as Array<{ url: string }>
  return refs[refs.length - 1]!.url
}

// A character with a photo — the only kind of tag that can actually be rendered,
// and what occupies the model's reference budget before a style ever sees it.
async function seedTaggedCharacter(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  cookie: string,
): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/entities',
    headers: { cookie },
    payload: { kind: 'character', name: 'Аня', description: 'тёмные волосы' },
  })
  const entityId = created.json().id as string
  await app.inject({
    method: 'POST',
    url: `/api/entities/${entityId}/images`,
    headers: { cookie },
    payload: { dataUri: PNG },
  })
  return entityId
}

async function balanceOf(app: Awaited<ReturnType<typeof buildTestApp>>, cookie: string) {
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
  return me.json().creditsBalance as number
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

// The composed bytes a builtin style produced BEFORE the registry existed.
const ANIME_POSITIVE =
  'anime style, cel-shaded, clean line art, vibrant saturated colors, detailed backgrounds, Japanese animation aesthetic, a knight'
const ANIME_NEGATIVE = 'photorealistic, 3d render, western cartoon, low quality'
const CINEMATIC_POSITIVE =
  'cinematic live-action style, photorealistic, dramatic lighting, shallow depth of field, film grain, professional color grading, a knight'
const CINEMATIC_NEGATIVE = 'cartoon, anime, illustration, low quality, deformed'

describe('builtin styles compose byte-identically through the registry', () => {
  it("'anime' reaches the provider as the exact pre-registry prompt", async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-schnell',
        prompt: 'a knight',
        aspectRatio: '1:1',
        promptPreset: { styleId: 'anime' },
      },
    })
    expect(res.statusCode).toBe(201)
    const call = rw.imageInference.mock.calls[0]?.[0]
    expect(call.positivePrompt).toBe(ANIME_POSITIVE)
    expect(call.negativePrompt).toBe(ANIME_NEGATIVE)
  })

  it("'cinematic' combined with the other preset axes is unchanged", async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-schnell',
        prompt: 'a knight',
        aspectRatio: '1:1',
        promptPreset: { styleId: 'cinematic', cameraShot: 'wide', quality: 'ultra' },
      },
    })
    expect(res.statusCode).toBe(201)
    const call = rw.imageInference.mock.calls[0]?.[0]
    // Style leads, user text last, the modifier axes in their fixed order.
    expect(call.positivePrompt).toBe(
      CINEMATIC_POSITIVE.replace(
        ', a knight',
        ', wide establishing shot, ultra detailed, 8k, masterpiece, best quality, intricate detail, a knight',
      ),
    )
    expect(call.negativePrompt).toBe(CINEMATIC_NEGATIVE)
  })
})

describe('a user style applies exactly where a builtin does', () => {
  it('composes the user’s own fragments into the prompt the provider receives', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const style = await createStyle(app, cookie, {
      name: 'Неоновый нуар',
      fragment: 'neon noir, wet asphalt reflections',
      negative: 'daylight, pastel',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-schnell',
        prompt: 'a knight',
        aspectRatio: '1:1',
        promptPreset: { styleId: style.id },
      },
    })
    expect(res.statusCode).toBe(201)
    const call = rw.imageInference.mock.calls[0]?.[0]
    // Same composition law as a builtin: style leads, the user's text is last.
    expect(call.positivePrompt).toBe('neon noir, wet asphalt reflections, a knight')
    expect(call.negativePrompt).toBe('daylight, pastel')
  })
})

// The REFERENCE half of the package (amendment A2/A3). Everything here is about
// one property: a style is AMBIENT. It rides along with whatever the request
// already carries, so it may never turn a request that would have succeeded into
// one that fails — not by exceeding the model's budget, not by landing on a model
// that takes no references, and not because one of its stored files went missing.
describe('a style delivers its reference images through the existing channel', () => {
  it('sends the package’s images to the provider as data URIs', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const style = await createStyle(app, cookie, {
      name: 'Неоновый нуар',
      fragment: 'neon noir',
    })
    await attachRef(app, cookie, style.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-kontext-pro',
        prompt: 'a knight',
        aspectRatio: '1:1',
        promptPreset: { styleId: style.id },
      },
    })
    expect(res.statusCode).toBe(201)
    const call = rw.imageInference.mock.calls[0]?.[0]
    // The bytes were sourced by the SERVER from its own storage — the wire
    // contract has no referenceImages field, so a client can never inject them.
    expect(call.referenceImages).toHaveLength(1)
    expect(call.referenceImages[0]).toMatch(/^data:image\/png;base64,/)
    // …and the fragment applied as it always did.
    expect(call.positivePrompt).toBe('neon noir, a knight')
  })

  // A3 — the owner's 2026-07-24 shot-reference precedent: refs are simply dropped
  // for a model that cannot use them. No refusal, no charge difference, and the
  // FRAGMENTS still apply, because the prompt half works on every model.
  it('drops them SILENTLY on a model with no reference support, keeping the fragments', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const style = await createStyle(app, cookie, {
      name: 'Неоновый нуар',
      fragment: 'neon noir',
      negative: 'daylight',
    })
    await attachRef(app, cookie, style.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        // flux-schnell has no referenceMode at all.
        modelId: 'flux-schnell',
        prompt: 'a knight',
        aspectRatio: '1:1',
        promptPreset: { styleId: style.id },
      },
    })
    expect(res.statusCode).toBe(201)
    const call = rw.imageInference.mock.calls[0]?.[0]
    // Omitted entirely, not sent empty — and the request succeeded.
    expect(call.referenceImages).toBeUndefined()
    expect(call.positivePrompt).toBe('neon noir, a knight')
    expect(call.negativePrompt).toBe('daylight')
  })

  // A2 — the trim order. The tagged character is what the user explicitly asked
  // for; the style is atmosphere. On overflow the atmosphere goes.
  it('trims STYLE refs first when the model’s budget is full, never the entity’s', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const entityId = await seedTaggedCharacter(app, cookie)
    const style = await createStyle(app, cookie, { name: 'Неон', fragment: 'neon noir' })
    await attachRef(app, cookie, style.id)
    await attachRef(app, cookie, style.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        // flux-kontext-pro: maxReferenceImages = 2.
        modelId: 'flux-kontext-pro',
        prompt: '[[e1]] on a rooftop',
        aspectRatio: '1:1',
        entityRefs: [{ placeholder: 'e1', entityId }],
        promptPreset: { styleId: style.id },
      },
    })
    // 1 entity + 2 style = 3 > 2, and it still SUCCEEDS: the ambient half is
    // trimmed rather than the request being refused for a budget the user never
    // knowingly exceeded.
    expect(res.statusCode).toBe(201)
    const call = rw.imageInference.mock.calls[0]?.[0]
    expect(call.referenceImages).toHaveLength(2)
    // The entity photo leads — it was resolved first and is never the one dropped.
    expect(call.positivePrompt).toContain('neon noir')
  })

  it('never lets an ambient style push a request over the model’s budget', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const entityId = await seedTaggedCharacter(app, cookie)
    const style = await createStyle(app, cookie, { name: 'Неон', fragment: 'neon noir' })
    for (let i = 0; i < 3; i++) await attachRef(app, cookie, style.id)
    const before = await balanceOf(app, cookie)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-kontext-pro',
        prompt: '[[e1]] on a rooftop',
        aspectRatio: '1:1',
        entityRefs: [{ placeholder: 'e1', entityId }],
        promptPreset: { styleId: style.id },
      },
    })
    // A 400 here would be the bug the trim exists to prevent: the count gate
    // must never see the style's images, or attaching a third reference to a
    // style would break every kontext generation that tags a character.
    expect(res.statusCode).toBe(201)
    expect(rw.imageInference.mock.calls[0]?.[0].referenceImages).toHaveLength(2)
    // Charged the ordinary price, once.
    await expect(balanceOf(app, cookie)).resolves.toBe(before - 7)
  })

  // A dead file is an operational fact (a half-restored backup, a manual media
  // cleanup), not a reason to fail a paid request. The style is ambient: the
  // worst it may do is contribute nothing.
  it('drops a reference whose stored file is gone, without failing the generation', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const storageDir = mkdtempSync(join(tmpdir(), 'oc-style-dead-'))
    const app = await buildTestApp({ runware: rw, storageDir })
    const cookie = await registerAndGetCookie(app)
    const style = await createStyle(app, cookie, { name: 'Неон', fragment: 'neon noir' })
    const deadUrl = await attachRef(app, cookie, style.id)
    const liveUrl = await attachRef(app, cookie, style.id)
    expect(liveUrl).not.toBe(deadUrl)
    // Delete the bytes out from under the row, leaving the reference dangling.
    rmSync(join(storageDir, basename(deadUrl)))

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-kontext-pro',
        prompt: 'a knight',
        aspectRatio: '1:1',
        promptPreset: { styleId: style.id },
      },
    })
    expect(res.statusCode).toBe(201)
    // The surviving one still went; only the dead ref was dropped.
    expect(rw.imageInference.mock.calls[0]?.[0].referenceImages).toHaveLength(1)
  })
})

// The money rule (ADR D6): the registry never charges, and an id it cannot
// resolve must cost the caller nothing. Resolution therefore happens BEFORE
// chargeCredits — a request we already know cannot compose correctly must not
// reach the provider or the ledger.
describe('an unresolvable style costs nothing', () => {
  it('refuses an unknown styleId with 400, no charge and no provider call', async () => {
    const rw = fakeRunware()
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const before = await balanceOf(app, cookie)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-schnell',
        prompt: 'a knight',
        aspectRatio: '1:1',
        promptPreset: { styleId: 'ghibli' },
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
    expect(rw.imageInference).not.toHaveBeenCalled()
    await expect(balanceOf(app, cookie)).resolves.toBe(before)
  })

  it('refuses ANOTHER user’s style — indistinguishably from one that never existed', async () => {
    const rw = fakeRunware()
    const app = await buildTestApp({ runware: rw })
    const mine = await registerAndGetCookie(app, 'mine@b.co')
    const theirs = await registerAndGetCookie(app, 'theirs@b.co')
    const style = await createStyle(app, theirs, { name: 'Их', fragment: 'their secret fragment' })
    const before = await balanceOf(app, mine)

    const foreign = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie: mine },
      payload: {
        modelId: 'flux-schnell',
        prompt: 'a knight',
        aspectRatio: '1:1',
        promptPreset: { styleId: style.id },
      },
    })
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie: mine },
      payload: {
        modelId: 'flux-schnell',
        prompt: 'a knight',
        aspectRatio: '1:1',
        promptPreset: { styleId: 'no-such-style' },
      },
    })
    expect(foreign.statusCode).toBe(400)
    expect(unknown.statusCode).toBe(400)
    // The refusal depends ONLY on what the caller sent — same status, same
    // template, echoing back their own input and nothing else. A style that
    // exists but belongs to someone else is reported exactly like one that
    // never existed, so this endpoint cannot be used to discover style ids…
    expect(foreign.json().error.code).toBe(unknown.json().error.code)
    expect(foreign.json().error.message).toBe(`unknown style ${style.id}`)
    expect(unknown.json().error.message).toBe('unknown style no-such-style')
    // …and the other user's fragment never appears anywhere in the response.
    expect(foreign.body).not.toContain('their secret fragment')
    expect(foreign.body).not.toContain('Их')
    expect(rw.imageInference).not.toHaveBeenCalled()
    await expect(balanceOf(app, mine)).resolves.toBe(before)
  })

  it('refuses a style the user DELETED — the shot keeps the id, the generation is honest', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const style = await createStyle(app, cookie, { name: 'Неон', fragment: 'neon noir' })
    await app.inject({ method: 'DELETE', url: `/api/styles/${style.id}`, headers: { cookie } })
    const before = await balanceOf(app, cookie)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-schnell',
        prompt: 'a knight',
        aspectRatio: '1:1',
        promptPreset: { styleId: style.id },
      },
    })
    expect(res.statusCode).toBe(400)
    expect(rw.imageInference).not.toHaveBeenCalled()
    await expect(balanceOf(app, cookie)).resolves.toBe(before)
  })

  it('leaves a preset-less request completely untouched', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'flux-schnell', prompt: 'a knight', aspectRatio: '1:1' },
    })
    expect(res.statusCode).toBe(201)
    const call = rw.imageInference.mock.calls[0]?.[0]
    expect(call.positivePrompt).toBe('a knight')
    // OMITTED, not sent as an empty string — the key is spread in only when a
    // negative actually exists (and the model has the channel).
    expect(call.negativePrompt).toBeUndefined()
  })

  it('accepts a preset with no styleId at all — the modifier axes still compose', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-schnell',
        prompt: 'a knight',
        aspectRatio: '1:1',
        promptPreset: { cameraShot: 'wide' },
      },
    })
    expect(res.statusCode).toBe(201)
    const call = rw.imageInference.mock.calls[0]?.[0]
    expect(call.positivePrompt).toBe('wide establishing shot, a knight')
  })
})
