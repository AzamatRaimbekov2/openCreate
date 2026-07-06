import { describe, expect, it } from 'vitest'
import { catalogModelSchema } from './catalog'

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
