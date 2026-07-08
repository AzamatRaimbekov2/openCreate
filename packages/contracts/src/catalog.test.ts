import { describe, expect, it } from 'vitest'
import { catalogModelSchema, catalogVideoModelSchema } from './catalog'

describe('catalogModelSchema', () => {
  it('parses a video model with per-duration credits', () => {
    const r = catalogModelSchema.safeParse({
      id: 'pixverse-v6',
      type: 'video',
      name: 'Swift Video',
      providerLabel: 'PixVerse V6',
      air: 'pixverse:1@8',
      tier: 'standard',
      supportsImageInput: true,
      aspectRatios: ['16:9', '1:1', '9:16'],
      durationOptions: [5, 8],
      creditsByDuration: { '5': 35, '8': 56 },
    })
    expect(r.success).toBe(true)
  })
  it('accepts an optional provider on a video model (self-host routing)', () => {
    const r = catalogModelSchema.safeParse({
      id: 'wan-2-2',
      type: 'video',
      name: 'Forge',
      providerLabel: 'Wan 2.2 · our GPU',
      air: 'wan-runpod:wan2.2-t2v-a14b',
      tier: 'premium',
      supportsImageInput: false,
      aspectRatios: ['16:9', '9:16', '1:1'],
      durationOptions: [5],
      creditsByDuration: { '5': 60 },
      provider: 'wan-runpod',
    })
    expect(r.success).toBe(true)
    if (r.success && r.data.type === 'video') expect(r.data.provider).toBe('wan-runpod')
  })
  it('treats provider as optional — a video model without it stays valid (defaults to runware)', () => {
    const r = catalogVideoModelSchema.safeParse({
      id: 'pixverse-v6',
      type: 'video',
      name: 'Swift',
      providerLabel: 'PixVerse V6',
      air: 'pixverse:1@8',
      tier: 'standard',
      supportsImageInput: true,
      aspectRatios: ['16:9'],
      durationOptions: [5],
      creditsByDuration: { '5': 35 },
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.provider).toBeUndefined()
  })
  it('rejects an unknown provider value', () => {
    const r = catalogVideoModelSchema.safeParse({
      id: 'x',
      type: 'video',
      name: 'X',
      providerLabel: 'X',
      air: 'a:1@1',
      tier: 'standard',
      supportsImageInput: false,
      aspectRatios: ['16:9'],
      durationOptions: [5],
      creditsByDuration: { '5': 10 },
      provider: 'openai',
    })
    expect(r.success).toBe(false)
  })
  it('requires credits for image models', () => {
    const r = catalogModelSchema.safeParse({
      id: 'x',
      type: 'image',
      name: 'X',
      providerLabel: 'X',
      air: 'a:1@1',
      tier: 'fast',
      supportsImageInput: false,
      aspectRatios: ['1:1'],
    })
    expect(r.success).toBe(false)
  })
})
