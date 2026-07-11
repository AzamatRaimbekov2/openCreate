import { describe, expect, it } from 'vitest'
import { createModelRenderInputSchema } from './model-render'

const VIDEO = `data:video/mp4;base64,${'A'.repeat(64)}`
const POSTER = `data:image/webp;base64,${'A'.repeat(64)}`

describe('createModelRenderInput', () => {
  it('accepts a preset id with a rendered video and poster', () => {
    const parsed = createModelRenderInputSchema.parse({ presetId: 'studio', video: VIDEO, poster: POSTER })
    expect(parsed.presetId).toBe('studio')
  })

  it('rejects a video that is not a data URI', () => {
    const r = createModelRenderInputSchema.safeParse({ presetId: 'studio', video: 'https://evil/x.mp4', poster: POSTER })
    expect(r.success).toBe(false)
  })

  it('rejects a video above the size cap', () => {
    const r = createModelRenderInputSchema.safeParse({
      presetId: 'studio',
      video: `data:video/mp4;base64,${'A'.repeat(40_000_001)}`,
      poster: POSTER,
    })
    expect(r.success).toBe(false)
  })
})
