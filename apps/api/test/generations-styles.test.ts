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
