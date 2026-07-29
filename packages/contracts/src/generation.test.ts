import { describe, expect, it } from 'vitest'
import { createGenerationInputSchema, generationSchema } from './generation'

describe('createGenerationInputSchema', () => {
  it('accepts a minimal image request', () => {
    const r = createGenerationInputSchema.safeParse({
      modelId: 'flux-schnell',
      prompt: 'a red fox in the snow',
      aspectRatio: '1:1',
    })
    expect(r.success).toBe(true)
  })
  it('rejects an empty prompt', () => {
    const r = createGenerationInputSchema.safeParse({
      modelId: 'flux-schnell',
      prompt: '',
      aspectRatio: '1:1',
    })
    expect(r.success).toBe(false)
  })
  it('rejects inputImage that is not a data URI', () => {
    const r = createGenerationInputSchema.safeParse({
      modelId: 'kling-3-pro',
      prompt: 'zoom in slowly',
      aspectRatio: '16:9',
      duration: 5,
      inputImage: 'https://example.com/cat.png',
    })
    expect(r.success).toBe(false)
  })
})

describe('inputGenerationId (canvas chain edge)', () => {
  const BASE = { modelId: 'flux-dev', prompt: 'a fox', aspectRatio: '1:1' as const }
  it('accepts inputGenerationId alone', () => {
    expect(
      createGenerationInputSchema.safeParse({ ...BASE, inputGenerationId: 'g1' }).success,
    ).toBe(true)
  })
  it('rejects inputGenerationId together with inputImage (mutually exclusive)', () => {
    const result = createGenerationInputSchema.safeParse({
      ...BASE,
      inputGenerationId: 'g1',
      inputImage: 'data:image/png;base64,AAAA',
    })
    expect(result.success).toBe(false)
  })
})

describe('generationSchema', () => {
  it('parses a processing video generation', () => {
    const r = generationSchema.safeParse({
      id: 'gen_1',
      type: 'video',
      mode: 'text',
      status: 'processing',
      prompt: 'ocean waves',
      modelId: 'pixverse-v6',
      params: { aspectRatio: '9:16', duration: 5 },
      costCredits: 35,
      mediaUrls: [],
      progress: 40,
      errorMessage: null,
      createdAt: '2026-07-06T10:00:00.000Z',
      completedAt: null,
    })
    expect(r.success).toBe(true)
  })
  it('parses a failed generation carrying a content_blocked error code', () => {
    const r = generationSchema.safeParse({
      id: 'gen_2',
      type: 'image',
      mode: 'text',
      status: 'failed',
      prompt: 'something the safety filter rejects',
      modelId: 'flux-schnell',
      params: { aspectRatio: '1:1' },
      costCredits: 1,
      mediaUrls: [],
      progress: null,
      errorMessage: 'Blocked by the content safety filter',
      errorCode: 'content_blocked',
      createdAt: '2026-07-06T10:00:00.000Z',
      completedAt: '2026-07-06T10:00:05.000Z',
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.errorCode).toBe('content_blocked')
  })
  it('rejects an unknown errorCode', () => {
    const r = generationSchema.safeParse({
      id: 'gen_3',
      type: 'image',
      mode: 'text',
      status: 'failed',
      prompt: 'x y',
      modelId: 'flux-schnell',
      params: { aspectRatio: '1:1' },
      costCredits: 1,
      mediaUrls: [],
      progress: null,
      errorMessage: 'boom',
      errorCode: 'not_a_real_code',
      createdAt: '2026-07-06T10:00:00.000Z',
      completedAt: null,
    })
    expect(r.success).toBe(false)
  })
})
