// Output resolution is DERIVED, never chosen. These tests pin the two ways it is
// derived — the tier ladder for our own models, and an explicit per-model profile
// for providers that only accept their own dimension list.
import { describe, expect, it } from 'vitest'
import { formatResolution, resolutionFor } from './resolution'
import type { CatalogModel } from './catalog'

const imageModel = (overrides: Partial<CatalogModel> = {}) =>
  ({
    id: 'm',
    type: 'image',
    name: 'M',
    providerLabel: 'p',
    air: 'runware:100@1',
    tier: 'fast',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 1,
    ...overrides,
  }) as CatalogModel

const videoModel = (tier: string) =>
  ({
    id: 'v',
    type: 'video',
    name: 'V',
    providerLabel: 'p',
    air: 'x:1@1',
    tier,
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5],
    creditsByDuration: { '5': 10 },
  }) as CatalogModel

describe('resolutionFor', () => {
  it('uses the square1024 table for image models by default', () => {
    expect(resolutionFor(imageModel(), '1:1')).toEqual({ width: 1024, height: 1024 })
    expect(resolutionFor(imageModel(), '16:9')).toEqual({ width: 1344, height: 768 })
  })

  it('gives plus/pro/premium video models 1080p, and the rest 720p', () => {
    expect(resolutionFor(videoModel('pro'), '16:9')).toEqual({ width: 1920, height: 1080 })
    expect(resolutionFor(videoModel('standard'), '16:9')).toEqual({ width: 1280, height: 720 })
  })

  // A provider that only accepts ITS OWN dimension list must not be handed our
  // tier ladder's numbers. FLUX.1 Kontext accepts 1392x752 for 16:9 and would
  // reject the square1024 table's 1344x768 — an invisible 400 at generation time.
  it('honours an explicit resolutionProfile over the default table', () => {
    const kontext = imageModel({ resolutionProfile: 'kontext' })
    expect(resolutionFor(kontext, '16:9')).toEqual({ width: 1392, height: 752 })
    expect(resolutionFor(kontext, '9:16')).toEqual({ width: 752, height: 1392 })
    expect(resolutionFor(kontext, '1:1')).toEqual({ width: 1024, height: 1024 })
  })
})

describe('formatResolution', () => {
  it('uses the multiplication sign, not the letter x', () => {
    expect(formatResolution({ width: 1920, height: 1080 })).toBe('1920×1080')
  })
})
