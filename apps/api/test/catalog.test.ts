// Task 7 tests: the curated model catalog is the single source of truth for
// model ids, AIR ids and credit pricing. Every entry must satisfy the shared
// contract schema, and creditsFor must be exact about duration pricing.
import { describe, expect, it } from 'vitest'
import { catalogModelSchema } from '@opencreate/contracts'
import { CATALOG, creditsFor, getModel } from '../src/modules/catalog/catalog'
import { buildTestApp } from './helpers/build-test-app'

describe('catalog', () => {
  it('every entry passes the contract schema', () => {
    for (const m of CATALOG) expect(catalogModelSchema.safeParse(m).success).toBe(true)
  })
  it('creditsFor image ignores duration', () => {
    expect(creditsFor(getModel('flux-schnell')!, undefined)).toBe(1)
  })
  it('creditsFor video uses duration table', () => {
    expect(creditsFor(getModel('pixverse-v6')!, 5)).toBe(35)
  })
  it('creditsFor video with unsupported duration throws', () => {
    expect(() => creditsFor(getModel('pixverse-v6')!, 99)).toThrow()
  })
  it('offers Seedance 1.5 Pro (AIR verified live 2026-07-07) in the standard tier with i2v', () => {
    const m = getModel('seedance-1-5-pro')
    expect(m).toBeDefined()
    expect(m!.air).toBe('bytedance:seedance@1.5-pro')
    expect(m!.supportsImageInput).toBe(true)
    expect(creditsFor(m!, 5)).toBe(35)
    expect(creditsFor(m!, 10)).toBe(70)
  })
})

describe('GET /api/catalog', () => {
  it('is public and returns all catalog models', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/catalog' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { models: unknown[] }
    expect(body.models).toHaveLength(CATALOG.length)
    for (const m of body.models) expect(catalogModelSchema.safeParse(m).success).toBe(true)
  })
})

describe('provider parameter compatibility', () => {
  it('seedance rejects the runware safety param — catalog must flag it off', () => {
    expect(getModel('seedance-1-5-pro')!.type === 'video' && getModel('seedance-1-5-pro')).toMatchObject({
      supportsSafetyParam: false,
    })
  })
})
