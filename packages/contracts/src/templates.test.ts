// The category enum is the one part of the template contract a client can break
// by being out of date: the gallery groups templates into shelves by category and
// renders each heading through t(`templates.category.${category}`). A value the
// SPA has no locale key for renders as the raw key. So the enum's membership is
// asserted here, next to the schema, rather than only being implied by whatever
// the server catalog happens to contain.
import { describe, expect, it } from 'vitest'
import { templateCategorySchema, templateTierSchema } from './templates'

describe('templateCategorySchema', () => {
  it('carries exactly the shelves the gallery has headings for', () => {
    // Order is the enum's, not the gallery's — the shelf order comes from the
    // server catalog's first-seen order (catalog/index.ts). This is membership.
    expect(templateCategorySchema.options).toEqual([
      'format',
      'brainrot',
      'animation',
      'brick',
      'shorts',
    ])
  })

  it('accepts the brick shelf', () => {
    expect(templateCategorySchema.parse('brick')).toBe('brick')
  })

  it('rejects an unknown shelf rather than passing it to the client', () => {
    expect(templateCategorySchema.safeParse('lego').success).toBe(false)
  })
})

describe('templateTierSchema', () => {
  it('is ordered cheapest-first, which is the order the tier pills render in', () => {
    expect(templateTierSchema.options).toEqual(['draft', 'standard', 'premium'])
  })
})
