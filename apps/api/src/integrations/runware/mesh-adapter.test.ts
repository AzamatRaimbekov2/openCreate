import { describe, expect, it, vi } from 'vitest'
import { createRunwareMeshAdapter } from './mesh-adapter'
import type { RunwareClient } from './client'

const client = (over: Partial<RunwareClient> = {}): RunwareClient =>
  ({
    imageInference: vi.fn(),
    submitVideo: vi.fn(),
    submitAudio: vi.fn(),
    submit3d: vi.fn().mockResolvedValue(undefined),
    getResponse: vi.fn(),
    ...over,
  }) as unknown as RunwareClient

describe('runware mesh adapter', () => {
  it('returns the caller-minted taskUUID as the provider job id', async () => {
    // Runware does not mint an id for us — the CALLER supplies taskUUID, which is
    // also the idempotency key for the single bounded retry in the client.
    const submit3d = vi.fn().mockResolvedValue(undefined)
    const adapter = createRunwareMeshAdapter(client({ submit3d }))

    const { providerJobId } = await adapter.submit({
      taskUUID: 'uuid-1',
      model: 'microsoft:trellis-2@4b',
      inputImage: 'data:image/png;base64,AAA',
    })

    expect(providerJobId).toBe('uuid-1')
    expect(submit3d).toHaveBeenCalledWith(
      expect.objectContaining({ taskUUID: 'uuid-1', model: 'microsoft:trellis-2@4b' }),
    )
  })

  it('forwards the quality knobs only when set, never as explicit undefined', async () => {
    // exactOptionalPropertyTypes + Runware's 400-on-unknown-param behavior: an
    // explicit `pbr: undefined` still serializes as a key on some paths, and an
    // unknown param is a hard 400 (exactly how ByteDance and Wan 2.7 broke).
    const submit3d = vi.fn().mockResolvedValue(undefined)
    const adapter = createRunwareMeshAdapter(client({ submit3d }))

    await adapter.submit({
      taskUUID: 'uuid-1',
      model: 'microsoft:trellis-2@4b',
      inputImage: 'data:image/png;base64,AAA',
      pbr: true,
      faceLimit: 20_000,
    })
    expect(submit3d).toHaveBeenCalledWith(
      expect.objectContaining({ pbr: true, faceLimit: 20_000 }),
    )

    submit3d.mockClear()
    await adapter.submit({
      taskUUID: 'uuid-2',
      model: 'microsoft:trellis-2@4b',
      inputImage: 'data:image/png;base64,AAA',
    })
    const sent = submit3d.mock.calls[0]?.[0] as Record<string, unknown>
    expect(Object.keys(sent)).not.toContain('pbr')
    expect(Object.keys(sent)).not.toContain('faceLimit')
  })

  it('maps a finished mesh onto the neutral success union', async () => {
    const getResponse = vi.fn().mockResolvedValue({
      status: 'success',
      meshURL: 'https://im.runware.ai/x.glb',
      cost: 0.0256,
    })
    const adapter = createRunwareMeshAdapter(client({ getResponse }))

    expect(await adapter.poll('uuid-1')).toEqual({
      status: 'success',
      assetUrl: 'https://im.runware.ai/x.glb',
      costUsd: 0.0256,
      // 3dInference exposes no moderation signal. Reporting false (rather than
      // undefined) makes the gap explicit: the service's NSFW gate never fires for
      // 3D, exactly as documented for the self-hosted wan-runpod provider.
      nsfw: false,
    })
  })

  it('maps success-with-no-mesh onto success-with-no-asset, so the service refunds', async () => {
    // CRITICAL: the service treats success-without-an-asset as a failure and gives
    // the credits back. Inventing a URL here, or throwing, would bypass that guard.
    const getResponse = vi.fn().mockResolvedValue({ status: 'success', cost: 0.02 })
    const adapter = createRunwareMeshAdapter(client({ getResponse }))
    const poll = await adapter.poll('uuid-1')
    expect(poll.status).toBe('success')
    expect(poll.status === 'success' && poll.assetUrl).toBeUndefined()
  })

  it('passes a provider error through as a terminal error state, not an exception', async () => {
    const getResponse = vi.fn().mockResolvedValue({ status: 'error', message: 'bad image' })
    const adapter = createRunwareMeshAdapter(client({ getResponse }))
    expect(await adapter.poll('uuid-1')).toEqual({ status: 'error', message: 'bad image' })
  })

  it('passes processing progress straight through', async () => {
    const getResponse = vi.fn().mockResolvedValue({ status: 'processing', progress: 40 })
    const adapter = createRunwareMeshAdapter(client({ getResponse }))
    expect(await adapter.poll('uuid-1')).toEqual({ status: 'processing', progress: 40 })
  })
})
