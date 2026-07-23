import { describe, expect, it } from 'vitest'
import {
  analyzeResponseSchema,
  asset3dPartSchema,
  createAsset3dInputSchema,
  meshPartInputSchema,
  updateAsset3dPartInputSchema,
  MAX_PARTS,
} from './asset3d'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('createAsset3dInputSchema', () => {
  it('accepts a title + png/jpeg/webp data-uri concept image', () => {
    expect(createAsset3dInputSchema.safeParse({ title: 'Knight', conceptImage: PNG }).success).toBe(true)
  })
  it('rejects an svg concept image (stored-XSS)', () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zz4='
    expect(createAsset3dInputSchema.safeParse({ title: 'X', conceptImage: svg }).success).toBe(false)
  })
  it('rejects a non-data-uri concept image (SSRF: no URLs)', () => {
    expect(createAsset3dInputSchema.safeParse({ title: 'X', conceptImage: 'https://x/y.png' }).success).toBe(false)
  })
  it('has no partId/status/generation ids (server establishes provenance)', () => {
    const parsed = createAsset3dInputSchema.parse({ title: 'X', conceptImage: PNG })
    expect('imageGenerationId' in parsed).toBe(false)
    expect('status' in parsed).toBe(false)
  })
})

describe('asset3dPartSchema', () => {
  it('cites generations by nullable id and carries a derived status field', () => {
    const part = asset3dPartSchema.parse({
      id: 'p1', assetId: 'a1', name: 'Helmet', description: '', sortOrder: 1000,
      imageGenerationId: null, meshGenerationId: null, transform: null,
      status: 'draft', createdAt: new Date().toISOString(),
    })
    expect(part.imageGenerationId).toBeNull()
    expect(part.status).toBe('draft')
  })
  it('rejects an unknown status value (enum is the derived-state closed set)', () => {
    expect(
      asset3dPartSchema.safeParse({
        id: 'p1', assetId: 'a1', name: 'H', description: '', sortOrder: 1000,
        imageGenerationId: null, meshGenerationId: null, transform: null,
        status: 'exploded', createdAt: new Date().toISOString(),
      }).success,
    ).toBe(false)
  })
})

describe('updateAsset3dPartInputSchema', () => {
  it('distinguishes cleared transform (null) from untouched (absent)', () => {
    expect(updateAsset3dPartInputSchema.parse({ transform: null }).transform).toBeNull()
    expect('transform' in updateAsset3dPartInputSchema.parse({ name: 'Boot' })).toBe(false)
  })
  it('validates a Vec3 transform (Y-up, meters)', () => {
    const t = { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    expect(updateAsset3dPartInputSchema.safeParse({ transform: t }).success).toBe(true)
    expect(updateAsset3dPartInputSchema.safeParse({ transform: { position: [0, 1] } }).success).toBe(false)
  })
})

describe('analyzeResponseSchema', () => {
  it(`caps parts at MAX_PARTS (${MAX_PARTS})`, () => {
    const parts = Array.from({ length: MAX_PARTS + 1 }, (_, i) => ({ name: `p${i}`, description: 'd' }))
    expect(analyzeResponseSchema.safeParse({ parts }).success).toBe(false)
  })
})

describe('meshPartInputSchema', () => {
  it('takes only a modelId (server composes everything else)', () => {
    expect(meshPartInputSchema.safeParse({ modelId: 'trellis-2' }).success).toBe(true)
    expect(meshPartInputSchema.safeParse({}).success).toBe(false)
  })
})
