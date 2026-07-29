// Contract tests for the /compare utility schemas — pin the accepted input
// range and the result envelope so a schema edit that would break the SPA or
// the route fails here first.
import { describe, expect, it } from 'vitest'
import { compareGenerateInputSchema, compareGenerateResultSchema } from './compare'

describe('compareGenerateInputSchema', () => {
  it('accepts a normal prompt', () => {
    expect(compareGenerateInputSchema.safeParse({ prompt: 'a cat' }).success).toBe(true)
  })
  it('rejects a too-short prompt', () => {
    expect(compareGenerateInputSchema.safeParse({ prompt: 'a' }).success).toBe(false)
  })
  it('rejects a missing prompt', () => {
    expect(compareGenerateInputSchema.safeParse({}).success).toBe(false)
  })
  it('rejects a prompt over 2000 chars (same bound as generations)', () => {
    expect(compareGenerateInputSchema.safeParse({ prompt: 'x'.repeat(2001) }).success).toBe(false)
  })
})

describe('compareGenerateResultSchema', () => {
  it('accepts a data-URL image with cost and duration', () => {
    const result = compareGenerateResultSchema.safeParse({
      imageUrl: 'data:image/png;base64,AAAA',
      costUsd: 0.075,
      durationMs: 8321,
    })
    expect(result.success).toBe(true)
  })
  it('accepts a null costUsd (provider omitted the figure)', () => {
    expect(
      compareGenerateResultSchema.safeParse({
        imageUrl: 'data:image/png;base64,AAAA',
        costUsd: null,
        durationMs: 0,
      }).success,
    ).toBe(true)
  })
  it('rejects a negative duration', () => {
    expect(
      compareGenerateResultSchema.safeParse({
        imageUrl: 'data:image/png;base64,AAAA',
        costUsd: null,
        durationMs: -1,
      }).success,
    ).toBe(false)
  })
})
