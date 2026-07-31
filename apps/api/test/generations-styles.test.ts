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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'

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
