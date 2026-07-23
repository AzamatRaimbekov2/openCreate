// apps/web/src/modules/Assets3D/model/wizardStage.test.ts
// Every transition of the stage machine, proved pure — the component just renders
// whatever deriveStage returns, so the flow logic is verified here, network-free.
import { describe, expect, it } from 'vitest'
import type { Asset3d, Asset3dPart, PartStatus } from '@opencreate/contracts'
import { deriveStage } from './wizardStage'

const ASSET: Asset3d = {
  id: 'a1',
  title: 'Knight',
  conceptImageUrl: '/media/concept.png',
  createdAt: '2026-07-18T10:00:00.000Z',
}

function part(status: PartStatus, id: string = status): Asset3dPart {
  return {
    id,
    assetId: 'a1',
    name: id,
    description: '',
    sortOrder: 1000,
    imageGenerationId: status === 'draft' ? null : 'g1',
    meshGenerationId: status === 'ready' || status === 'meshing' ? 'm1' : null,
    transform: null,
    status,
    createdAt: '2026-07-18T10:00:00.000Z',
  }
}

describe('deriveStage', () => {
  it('is upload when no asset is loaded', () => {
    expect(deriveStage(null, [])).toBe('upload')
  })
  it('is parts when the asset has no parts', () => {
    expect(deriveStage(ASSET, [])).toBe('parts')
  })
  it('is parts while any part is still a draft', () => {
    expect(deriveStage(ASSET, [part('draft'), part('extracted')])).toBe('parts')
  })
  it('is extract when a part is extracting or extracted (and none draft)', () => {
    expect(deriveStage(ASSET, [part('extracting')])).toBe('extract')
    expect(deriveStage(ASSET, [part('extracted')])).toBe('extract')
  })
  it('sits at the furthest-back incomplete stage: extract beats a sibling meshing', () => {
    expect(deriveStage(ASSET, [part('extracted'), part('meshing')])).toBe('extract')
  })
  it('is mesh when a part is meshing and none need extraction', () => {
    expect(deriveStage(ASSET, [part('meshing'), part('ready')])).toBe('mesh')
  })
  it('is assembly only when every part is ready', () => {
    expect(deriveStage(ASSET, [part('ready'), part('ready', 'ready2')])).toBe('assembly')
  })
  it('honors an explicit override (back-nav to a completed stage)', () => {
    expect(deriveStage(ASSET, [part('ready')], 'parts')).toBe('parts')
    // A null override is ignored (same as absent)
    expect(deriveStage(ASSET, [part('ready')], null)).toBe('assembly')
  })
})
