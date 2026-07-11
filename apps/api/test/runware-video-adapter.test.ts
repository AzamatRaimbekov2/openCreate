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
