// apps/web/src/modules/Soul/model/portraitSheet.test.ts
// The money rule, proved without a network. A reference sheet is N PAID jobs and
// the price depends on a state the user cannot see (does a primary photo exist?),
// so the arithmetic behind every priced button lives here, pure and tested.
import type { CatalogModel, Entity, EntityImage } from '@opencreate/contracts'
import {
  hasPrimaryPhoto,
  heroCredits,
  missingViews,
  priceViews,
  sheetCredits,
  sheetSlots,
} from './portraitSheet'

// The two catalogue entries the server's model rule picks between (ADR §3),
// with the credit prices the real catalog ships.
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
]

function makeImage(overrides: Partial<EntityImage>): EntityImage {
  return {
    id: 'img1',
    url: '/media/img1.png',
    source: 'generated',
    view: 'front',
    createdAt: '2026-07-12T10:00:00.000Z',
    ...overrides,
  }
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    kind: 'character',
    name: 'Аня',
    description: 'a woman',
    soul: null,
    images: [],
    primaryImageId: null,
    createdAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
    ...overrides,
  }
}

describe('sheetSlots', () => {
  it('returns the four views in sheet order, hero first', () => {
    expect(sheetSlots(makeEntity()).map((slot) => slot.view)).toEqual([
      'front',
      'three-quarter',
      'profile',
      'full-body',
    ])
  })

  it('binds each attached portrait to its own view and leaves the rest empty', () => {
    const entity = makeEntity({
      images: [
        makeImage({ id: 'a', view: 'profile' }),
        makeImage({ id: 'b', view: 'front' }),
        // An ordinary upload carries no view and must never fill a sheet slot
        makeImage({ id: 'c', view: null, source: 'upload' }),
      ],
    })
    const slots = sheetSlots(entity)
    expect(slots[0]?.image?.id).toBe('b')
    expect(slots[1]?.image).toBeNull()
    expect(slots[2]?.image?.id).toBe('a')
    expect(slots[3]?.image).toBeNull()
  })
})

describe('missingViews', () => {
  it('lists every unfilled slot', () => {
    expect(missingViews(makeEntity())).toEqual(['front', 'three-quarter', 'profile', 'full-body'])
  })

  it('is empty once the sheet is complete', () => {
    const entity = makeEntity({
      images: [
        makeImage({ id: 'a', view: 'front' }),
        makeImage({ id: 'b', view: 'three-quarter' }),
        makeImage({ id: 'c', view: 'profile' }),
        makeImage({ id: 'd', view: 'full-body' }),
      ],
    })
    expect(missingViews(entity)).toEqual([])
  })
})

describe('hasPrimaryPhoto', () => {
  it('is what the server rule keys on — a primary image id, not an image count', () => {
    expect(hasPrimaryPhoto(makeEntity())).toBe(false)
    expect(hasPrimaryPhoto(makeEntity({ primaryImageId: 'img1' }))).toBe(true)
  })
})

describe('priceViews', () => {
  it('prices the hero shot on flux-dev when no photo exists yet', () => {
    expect(priceViews(['front'], false, MODELS)).toBe(2)
  })

  it('prices the full four-view sheet from scratch at 2 + 3×8 = 26', () => {
    expect(priceViews(['front', 'three-quarter', 'profile', 'full-body'], false, MODELS)).toBe(26)
  })

  it('prices every view on flux-kontext-pro once a photo exists (the self-reference)', () => {
    expect(priceViews(['three-quarter', 'profile', 'full-body'], true, MODELS)).toBe(24)
    expect(priceViews(['profile'], true, MODELS)).toBe(8)
  })

  it('is null — never a wrong number — while the catalog has not landed', () => {
    expect(priceViews(['front'], false, [])).toBeNull()
    expect(priceViews(['front'], true, [])).toBeNull()
  })

  it('costs nothing when nothing was asked for', () => {
    expect(priceViews([], false, MODELS)).toBe(0)
  })
})

describe('heroCredits / sheetCredits', () => {
  it('read the price off the catalog rather than hardcoding it', () => {
    expect(heroCredits(MODELS)).toBe(2)
    expect(sheetCredits(MODELS)).toBe(8)
  })

  it('are null when the model is absent from the catalog', () => {
    expect(heroCredits([])).toBeNull()
    expect(sheetCredits([])).toBeNull()
  })
})
