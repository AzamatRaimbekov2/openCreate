// apps/web/src/modules/Assets3D/model/assetPricing.test.ts
// The money rule, proved without a network. Every priced button reads these
// helpers, so the arithmetic — and the null-when-unknown discipline — lives here.
import { describe, expect, it } from 'vitest'
import type { CatalogModel } from '@opencreate/contracts'
import { extractionPrice, meshPrice, meshTierOptions } from './assetPricing'

// The catalog rows the helpers pick between: a plain image model, the
// reference-capable extraction model, and two model3d tiers.
const MODELS: CatalogModel[] = [
  {
    id: 'flux-dev',
    type: 'image',
    name: 'Studio',
    providerLabel: 'FLUX dev',
    air: 'runware:101@1',
    tier: 'quality',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 2,
  },
  {
    id: 'flux-kontext-pro',
    type: 'image',
    name: 'Cast',
    providerLabel: 'FLUX.1 Kontext pro',
    air: 'bfl:3@1',
    tier: 'plus',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 8,
    referenceMode: 'both',
    maxReferenceImages: 2,
  },
  {
    id: 'trellis-2',
    type: 'model3d',
    name: 'TRELLIS.2',
    providerLabel: 'Runware',
    air: 'runware:501@1',
    tier: 'fast',
    supportsImageInput: true,
    aspectRatios: ['1:1'],
    credits: 6,
  },
  {
    id: 'hunyuan-3d-rapid',
    type: 'model3d',
    name: 'Hunyuan3D Rapid',
    providerLabel: 'Runware',
    air: 'runware:502@1',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['1:1'],
    credits: 45,
  },
]

describe('extractionPrice', () => {
  it('is the reference-capable image model price, not the cheaper plain one', () => {
    // flux-kontext-pro (referenceMode set) at 8cr, never flux-dev at 2cr
    expect(extractionPrice(MODELS)).toBe(8)
  })
  it('is null (never 0) when no reference-capable image model exists', () => {
    const noRef = MODELS.filter((m) => m.id !== 'flux-kontext-pro')
    expect(extractionPrice(noRef)).toBeNull()
  })
  it('is null on an empty catalog', () => {
    expect(extractionPrice([])).toBeNull()
  })
})

describe('meshTierOptions', () => {
  it('lists only the model3d rows, in order, with price meta', () => {
    expect(meshTierOptions(MODELS)).toEqual([
      { value: 'trellis-2', label: 'TRELLIS.2', credits: 6 },
      { value: 'hunyuan-3d-rapid', label: 'Hunyuan3D Rapid', credits: 45 },
    ])
  })
  it('is empty when the catalog has no model3d tiers', () => {
    expect(meshTierOptions([])).toEqual([])
  })
})

describe('meshPrice', () => {
  it('is the flat price of the picked model3d tier', () => {
    expect(meshPrice(MODELS, 'trellis-2')).toBe(6)
    expect(meshPrice(MODELS, 'hunyuan-3d-rapid')).toBe(45)
  })
  it('is null for an unknown id or a non-model3d id (never a fallback)', () => {
    expect(meshPrice(MODELS, 'nope')).toBeNull()
    expect(meshPrice(MODELS, 'flux-kontext-pro')).toBeNull()
  })
})
