// Mirrors mesh-adapter.test.ts: the audio adapter has no unit test even though
// its two siblings on the same seam (video-adapter, mesh-adapter) each have
// one. It is exercised indirectly through generations-audio.test.ts (the
// service-level money path), but the TTS-vs-music branch and the taskUUID
// minting are never asserted in isolation.
import { describe, expect, it, vi } from 'vitest'
import { createRunwareAudioAdapter } from './audio-adapter'
import type { RunwareClient } from './client'

const client = (over: Partial<RunwareClient> = {}): RunwareClient =>
  ({
    imageInference: vi.fn(),
    submitVideo: vi.fn(),
    submitAudio: vi.fn().mockResolvedValue(undefined),
    submit3d: vi.fn(),
    getResponse: vi.fn(),
    ...over,
  }) as unknown as RunwareClient

describe('runware audio adapter', () => {
  it('mints its own taskUUID and returns it as the provider job id', async () => {
    const submitAudio = vi.fn().mockResolvedValue(undefined)
    const adapter = createRunwareAudioAdapter(client({ submitAudio }))

    const { providerJobId } = await adapter.submit({
      prompt: 'a warm piano loop',
      model: 'elevenlabs:music@1',
      audioKind: 'music',
    })

    expect(providerJobId).toMatch(/^[0-9a-f-]{36}$/)
    expect(submitAudio).toHaveBeenCalledWith(
      expect.objectContaining({ taskUUID: providerJobId, model: 'elevenlabs:music@1', audioKind: 'music' }),
    )
  })

  it('sends the prompt as positivePrompt for music, never as text/voice', async () => {
    const submitAudio = vi.fn().mockResolvedValue(undefined)
    const adapter = createRunwareAudioAdapter(client({ submitAudio }))

    await adapter.submit({ prompt: 'a warm piano loop', model: 'elevenlabs:music@1', audioKind: 'music' })

    const sent = submitAudio.mock.calls[0]?.[0] as Record<string, unknown>
    expect(sent.positivePrompt).toBe('a warm piano loop')
    expect(sent.text).toBeUndefined()
    expect(sent.voice).toBeUndefined()
  })

  it('sends the prompt as text + voice for tts, never as positivePrompt', async () => {
    const submitAudio = vi.fn().mockResolvedValue(undefined)
    const adapter = createRunwareAudioAdapter(client({ submitAudio }))

    await adapter.submit({
      prompt: 'Hello there.',
      model: 'elevenlabs:tts@1',
      audioKind: 'tts',
      voice: 'rachel',
    })

    const sent = submitAudio.mock.calls[0]?.[0] as Record<string, unknown>
    expect(sent.text).toBe('Hello there.')
    expect(sent.voice).toBe('rachel')
    expect(sent.positivePrompt).toBeUndefined()
  })

  it('propagates a client-side submit failure rather than swallowing it', async () => {
    const submitAudio = vi.fn().mockRejectedValue(new Error('runware down'))
    const adapter = createRunwareAudioAdapter(client({ submitAudio }))

    await expect(
      adapter.submit({ prompt: 'x', model: 'elevenlabs:music@1', audioKind: 'music' }),
    ).rejects.toThrow('runware down')
  })
})
