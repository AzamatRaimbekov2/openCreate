import { describe, expect, it } from 'vitest'
import { promptEnhanceInputSchema, promptEnhanceResultSchema } from './prompt'

describe('promptEnhanceInputSchema', () => {
  it('accepts text and defaults mode to enhance', () => {
    const r = promptEnhanceInputSchema.safeParse({ text: 'a cat on a wall' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.mode).toBe('enhance')
  })
  it('accepts the soften mode', () => {
    const r = promptEnhanceInputSchema.safeParse({ text: 'a cat', mode: 'soften' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.mode).toBe('soften')
  })
  it('rejects empty text', () => {
    expect(promptEnhanceInputSchema.safeParse({ text: '' }).success).toBe(false)
  })
  it('rejects text past 2000 chars', () => {
    expect(promptEnhanceInputSchema.safeParse({ text: 'x'.repeat(2001) }).success).toBe(false)
  })
  it('accepts text at exactly 2000 chars', () => {
    expect(promptEnhanceInputSchema.safeParse({ text: 'x'.repeat(2000) }).success).toBe(true)
  })
  it('rejects an unknown mode', () => {
    expect(promptEnhanceInputSchema.safeParse({ text: 'a cat', mode: 'spicy' }).success).toBe(false)
  })
})

describe('promptEnhanceResultSchema', () => {
  it('accepts a non-empty prompt', () => {
    expect(promptEnhanceResultSchema.safeParse({ prompt: 'a lone fox in the snow' }).success).toBe(true)
  })
  it('rejects an empty prompt', () => {
    expect(promptEnhanceResultSchema.safeParse({ prompt: '' }).success).toBe(false)
  })
})
