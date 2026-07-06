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
})
