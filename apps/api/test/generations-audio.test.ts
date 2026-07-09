import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'

// Audio settlement downloads the produced mp3 via storage.saveFromUrl (global
// fetch) — stub it so tests never hit the network.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('fake-mp3'), { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

describe('audio generations (CinemaStudio)', () => {
  it('voiceover: submits audioInference, 202, then polls to succeeded and stores an mp3', async () => {
    const rw = fakeRunware()
    rw.submitAudio.mockResolvedValue(undefined)
    rw.getResponse.mockResolvedValueOnce({
      status: 'success',
      audioURL: 'https://am.runware.ai/v.mp3',
      cost: 0.01,
    })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      // No aspectRatio — audio has none.
      payload: { modelId: 'voiceover', prompt: 'привет мир', voice: 'Svetlana' },
    })
    expect(created.statusCode).toBe(202)
    expect(created.json()).toMatchObject({ type: 'audio', status: 'processing' })
    expect(rw.submitAudio).toHaveBeenCalledOnce()
    // TTS shape reached the client with the spoken text + voice.
    expect(rw.submitAudio.mock.calls[0]![0]).toMatchObject({
      audioKind: 'tts',
      text: 'привет мир',
      voice: 'Svetlana',
    })

    const id = created.json().id
    const polled = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(polled.json().status).toBe('succeeded')
    expect(polled.json().mediaUrls[0]).toMatch(/\.mp3$/)

    // Charged the flat audio credit (voiceover = 8).
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200 - 8)
  })

  it('music: submits a positivePrompt (not TTS) and refunds on a provider failure', async () => {
    const rw = fakeRunware()
    rw.submitAudio.mockResolvedValue(undefined)
    rw.getResponse.mockResolvedValue({ status: 'error', message: 'provider timeout' })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'music', prompt: 'calm ambient piano' },
    })
    expect(created.statusCode).toBe(202)
    expect(rw.submitAudio.mock.calls[0]![0]).toMatchObject({
      audioKind: 'music',
      positivePrompt: 'calm ambient piano',
    })

    const id = created.json().id
    const polled = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(polled.json().status).toBe('failed')
    // Refunded — audio rides the same money path as video.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })
})

describe('prompt presets (CinemaStudio)', () => {
  it('composes the style fragment into the model prompt and echoes the preset back', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', cost: 0.002, seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-schnell',
        prompt: 'a girl by the window',
        aspectRatio: '1:1',
        promptPreset: { styleId: 'anime', cameraShot: 'close-up' },
      },
    })
    expect(res.statusCode).toBe(201)
    // The MODEL saw the composed positive prompt + the style negative.
    const sent = rw.imageInference.mock.calls[0]![0]
    expect(sent.positivePrompt).toContain('anime style')
    expect(sent.positivePrompt).toContain('close-up shot')
    expect(sent.positivePrompt.endsWith('a girl by the window')).toBe(true)
    expect(sent.negativePrompt).toContain('photorealistic')
    // The DTO echoes the preset (for Regenerate) and the composed prompt.
    expect(res.json().promptPreset).toMatchObject({ styleId: 'anime', cameraShot: 'close-up' })
    expect(res.json().composedPrompt).toContain('anime style')
  })

  it('leaves a preset-less request byte-for-byte unchanged (composedPrompt null)', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', cost: 0.002, seed: 1 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: { modelId: 'flux-schnell', prompt: 'a plain red fox', aspectRatio: '1:1' },
    })
    const sent = rw.imageInference.mock.calls[0]![0]
    expect(sent.positivePrompt).toBe('a plain red fox')
    expect(sent.negativePrompt).toBeUndefined()
    expect(res.json().composedPrompt).toBeNull()
    expect(res.json().promptPreset).toBeNull()
  })
})
