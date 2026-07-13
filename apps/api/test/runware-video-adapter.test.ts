// The runware VideoProvider adapter wraps the EXISTING RunwareClient onto the
// neutral VideoProvider seam 1:1 (the client file itself is untouched). These
// tests pin that mapping: submit → submitVideo (with a generated taskUUID as
// the returned job id), poll → getResponse with the noun rename
// (videoURL/imageURL→assetUrl, cost→costUsd, NSFWContent→nsfw).
import { describe, expect, it, vi } from 'vitest'
import type { RunwareClient } from '../src/integrations/runware/client'
import { createRunwareVideoAdapter } from '../src/integrations/runware/video-adapter'

const fakeRunware = () => ({
  imageInference: vi.fn(),
  submitVideo: vi.fn(),
  submitAudio: vi.fn(),
  // Studio3D 3dInference submit — present so the fake satisfies RunwareClient.
  submit3d: vi.fn(),
  getResponse: vi.fn(),
})

describe('runware video adapter', () => {
  it('submit() calls submitVideo with mapped fields and returns the generated taskUUID as the job id', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)

    const { providerJobId } = await adapter.submit({
      prompt: 'ocean waves',
      width: 720,
      height: 1280,
      durationSeconds: 5,
      model: 'pixverse:1@8',
    })

    expect(providerJobId).toMatch(/^[0-9a-f-]{36}$/)
    expect(rw.submitVideo).toHaveBeenCalledTimes(1)
    const arg = rw.submitVideo.mock.calls[0]![0] as Record<string, unknown>
    // The generated taskUUID IS the job id — the service persists this and polls
    // with it, and Runware dedups a retried submit on it (idempotency key).
    expect(arg.taskUUID).toBe(providerJobId)
    expect(arg).toMatchObject({
      positivePrompt: 'ocean waves',
      model: 'pixverse:1@8',
      width: 720,
      height: 1280,
      duration: 5,
    })
    expect(arg).not.toHaveProperty('omitSafety')
    expect(arg).not.toHaveProperty('frameImages')
  })

  it('submit() forwards omitSafety and the image→video seed frame when present', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)

    await adapter.submit({
      prompt: 'jellyfish',
      width: 720,
      height: 1280,
      durationSeconds: 5,
      model: 'bytedance:seedance@1.5-pro',
      omitSafety: true,
      inputImage: 'data:image/png;base64,AAAA',
    })

    const arg = rw.submitVideo.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.omitSafety).toBe(true)
    expect(arg.frameImages).toEqual([{ image: 'data:image/png;base64,AAAA', frame: 'first' }])
  })

  // ── Native audio is OFF, and it is a MONEY rule, not a preference ────────────
  //
  // ByteDance bills Seedance 1.5 Pro at $0.0024/1k tokens WITH audio and
  // $0.0012/1k WITHOUT — exactly 2×. Their default is ON, and Runware forwards
  // that default, so a request that stays silent about audio pays double. A
  // measured 5s 720p clip cost $0.26136 (the with-audio rate) against a 35-credit
  // ($0.35) price: 25% margin instead of 63%.
  //
  // And we never USE that soundtrack: CinemaStudio generates its own voiceover
  // (Inworld TTS) and music, and the ffmpeg render muxes those over the clip. The
  // direct ByteDance adapter already guards this (`generate_audio: false`, see
  // ark-client.ts header) — the Runware path simply never did.
  //
  // Each provider spells the switch differently and REJECTS keys it does not know
  // (400 unsupportedParameter), so the mapping must be exact per model family —
  // enumerated from Runware's own `allowedValues` errors.
  it('submit() disables ByteDance native audio (providerSettings.bytedance.audio)', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)

    await adapter.submit({
      prompt: 'lake',
      width: 1280,
      height: 720,
      durationSeconds: 5,
      model: 'bytedance:seedance@1.5-pro',
    })

    const arg = rw.submitVideo.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.providerSettings).toEqual({ bytedance: { audio: false } })
  })

  it('submit() disables PixVerse native audio (providerSettings.pixverse.audio)', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)

    await adapter.submit({
      prompt: 'lake',
      width: 1280,
      height: 720,
      durationSeconds: 5,
      model: 'pixverse:1@8',
    })

    const arg = rw.submitVideo.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.providerSettings).toEqual({ pixverse: { audio: false } })
  })

  // Wan is the odd one out: `providerSettings.alibaba` does not exist at all — its
  // switches live under a TOP-LEVEL `settings` object (promptExtend /
  // promptEnhancer / audio). Sending it the providerSettings shape would 400.
  it('submit() disables Wan native audio via top-level settings.audio', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)

    await adapter.submit({
      prompt: 'lake',
      width: 1280,
      height: 720,
      durationSeconds: 5,
      model: 'alibaba:wan@2.7',
    })

    const arg = rw.submitVideo.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.settings).toEqual({ audio: false })
    expect(arg).not.toHaveProperty('providerSettings')
  })

  // MiniMax exposes only `promptOptimizer` — no audio switch. Sending one would be
  // a 400, so the adapter must send NOTHING rather than guess. Same for any model
  // family we have not verified: silence is the safe default.
  it('submit() sends no audio switch for a family that has none (MiniMax)', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)

    await adapter.submit({
      prompt: 'lake',
      width: 1280,
      height: 720,
      durationSeconds: 5,
      model: 'minimax:4@1',
    })

    const arg = rw.submitVideo.mock.calls[0]![0] as Record<string, unknown>
    expect(arg).not.toHaveProperty('providerSettings')
    expect(arg).not.toHaveProperty('settings')
  })

  // ── PixVerse native cartoon modes ────────────────────────────────────────────
  //
  // PixVerse ships REAL style modes — Runware's own allowedValues for
  // providerSettings.pixverse.style are: anime, 3d_animation, clay, comic,
  // cyberpunk. A first-class mode steers the model far harder than a prompt
  // fragment, and cartoons are the product. We were sending none of them.
  //
  // Only styles with a genuine PixVerse counterpart map; `cinematic` deliberately
  // does NOT (its counterpart would be "no style", and forcing `comic` on a live-
  // action look would be a regression). The prompt fragment still applies either
  // way, so an unmapped style is not a downgrade — it is just prompt-only.
  it.each([
    ['anime', 'anime'],
    ['3d-cartoon', '3d_animation'],
    ['2d-cartoon', 'comic'],
    ['disney', '3d_animation'],
  ])('submit() maps style %s onto the PixVerse native mode %s', async (styleId, native) => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)

    await adapter.submit({
      prompt: 'a fox',
      width: 1280,
      height: 720,
      durationSeconds: 5,
      model: 'pixverse:1@8',
      styleId: styleId as 'anime',
    })

    const arg = rw.submitVideo.mock.calls[0]![0] as Record<string, unknown>
    // Rides ALONGSIDE the audio kill-switch in the same provider namespace.
    expect(arg.providerSettings).toEqual({ pixverse: { audio: false, style: native } })
  })

  it('submit() sends no PixVerse style for a style with no native counterpart', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)

    await adapter.submit({
      prompt: 'a fox',
      width: 1280,
      height: 720,
      durationSeconds: 5,
      model: 'pixverse:1@8',
      styleId: 'cinematic',
    })

    const arg = rw.submitVideo.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.providerSettings).toEqual({ pixverse: { audio: false } })
  })

  // The style knob is PixVerse-only. Sending `style` to ByteDance would be a 400
  // (its allowed keys are cameraFixed | audio | draft), i.e. a dead generation.
  it('submit() never sends a style to a non-PixVerse model', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)

    await adapter.submit({
      prompt: 'a fox',
      width: 1280,
      height: 720,
      durationSeconds: 5,
      model: 'bytedance:seedance@1.5-pro',
      styleId: 'anime',
    })

    const arg = rw.submitVideo.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.providerSettings).toEqual({ bytedance: { audio: false } })
  })

  it('submit() propagates a submitVideo rejection unchanged (service settles fail+refund)', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockRejectedValue(new Error('runware down'))
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)
    await expect(
      adapter.submit({ prompt: 'x', width: 720, height: 1280, durationSeconds: 5, model: 'a:1@1' }),
    ).rejects.toThrow('runware down')
  })

  it('poll() maps a processing response through with its progress', async () => {
    const rw = fakeRunware()
    rw.getResponse.mockResolvedValue({ status: 'processing', progress: 40 })
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)
    expect(await adapter.poll('t1')).toEqual({ status: 'processing', progress: 40 })
    expect(rw.getResponse).toHaveBeenCalledWith('t1')
  })

  it('poll() renames a success payload to the neutral shape (videoURL→assetUrl, cost→costUsd, NSFWContent→nsfw)', async () => {
    const rw = fakeRunware()
    rw.getResponse.mockResolvedValue({
      status: 'success',
      videoURL: 'https://vm.runware.ai/v.mp4',
      cost: 0.35,
      NSFWContent: false,
    })
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)
    expect(await adapter.poll('t2')).toEqual({
      status: 'success',
      assetUrl: 'https://vm.runware.ai/v.mp4',
      costUsd: 0.35,
      nsfw: false,
    })
  })

  it('poll() falls back to imageURL when videoURL is absent', async () => {
    const rw = fakeRunware()
    rw.getResponse.mockResolvedValue({ status: 'success', imageURL: 'https://im.runware.ai/x.webp' })
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)
    const r = await adapter.poll('t3')
    expect(r).toMatchObject({ status: 'success', assetUrl: 'https://im.runware.ai/x.webp' })
  })

  it('poll() maps an error response to the neutral error state', async () => {
    const rw = fakeRunware()
    rw.getResponse.mockResolvedValue({ status: 'error', message: 'timeoutProvider' })
    const adapter = createRunwareVideoAdapter(rw as unknown as RunwareClient)
    expect(await adapter.poll('t4')).toEqual({ status: 'error', message: 'timeoutProvider' })
  })
})
