// apps/web/src/modules/Assets3D/model/assemblyRows.test.ts
// Every skip rule behind plan Fix FG-3, proven without a network or a render.
//
// The bug class under test is subtle and expensive: a part cites its mesh by ID, and
// it is very easy to turn that id into a url that LOOKS right. These tests pin that
// the url can only ever come from a resolved, SUCCEEDED generation's mediaUrls[0].
import { describe, expect, it } from 'vitest'
import type { Asset3dPart, Generation } from '@opencreate/contracts'
import { assemblyGenerationIds, meshCitationCount, resolveAssemblyRows } from './assemblyRows'

function part(id: string, overrides: Partial<Asset3dPart> = {}): Asset3dPart {
  return {
    id,
    assetId: 'asset1',
    name: `Part ${id}`,
    description: '',
    sortOrder: 0,
    imageGenerationId: `img-${id}`,
    meshGenerationId: `mesh-${id}`,
    transform: null,
    status: 'ready',
    createdAt: '2026-07-20T10:00:00.000Z',
    ...overrides,
  }
}

function generation(
  id: string,
  status: Generation['status'],
  mediaUrls: string[] = [],
): Generation {
  return {
    id,
    type: 'model3d',
    mode: 'image',
    status,
    prompt: '',
    modelId: 'trellis-2',
    params: {},
    costCredits: 6,
    mediaUrls,
    errorMessage: null,
    createdAt: '2026-07-20T10:00:00.000Z',
    completedAt: null,
  }
}

describe('assemblyGenerationIds', () => {
  it('collects both citations per part, so the caller makes ONE batch query', () => {
    expect(assemblyGenerationIds([part('p1'), part('p2')])).toEqual([
      'mesh-p1',
      'img-p1',
      'mesh-p2',
      'img-p2',
    ])
  })

  it('omits citations that do not exist yet', () => {
    // A null id must never become the string "null" and hit /api/generations/null.
    expect(
      assemblyGenerationIds([part('p1', { meshGenerationId: null, imageGenerationId: null })]),
    ).toEqual([])
  })
})

describe('meshCitationCount', () => {
  it('counts only parts that cite a mesh', () => {
    expect(meshCitationCount([part('p1'), part('p2', { meshGenerationId: null })])).toBe(1)
  })

  it('is zero when nothing has been meshed', () => {
    // This is what separates "nothing meshed yet" from "meshes exist but none
    // finished" — two different sentences for the user.
    expect(meshCitationCount([part('p1', { meshGenerationId: null })])).toBe(0)
  })
})

describe('resolveAssemblyRows', () => {
  it('takes the GLB url from the mesh generation mediaUrls[0]', () => {
    const rows = resolveAssemblyRows([part('p1')], {
      'mesh-p1': generation('mesh-p1', 'succeeded', ['/media/abc123.glb']),
      'img-p1': generation('img-p1', 'succeeded', ['/media/def456.png']),
    })

    // Note the url has NOTHING to do with the generation id — which is exactly why
    // it can only come from the resolved generation.
    expect(rows).toHaveLength(1)
    expect(rows[0]?.glbUrl).toBe('/media/abc123.glb')
    expect(rows[0]?.posterUrl).toBe('/media/def456.png')
  })

  it('skips a part whose mesh generation is still processing', () => {
    expect(
      resolveAssemblyRows([part('p1')], { 'mesh-p1': generation('mesh-p1', 'processing') }),
    ).toEqual([])
  })

  it('skips a part whose mesh generation failed', () => {
    expect(
      resolveAssemblyRows([part('p1')], { 'mesh-p1': generation('mesh-p1', 'failed') }),
    ).toEqual([])
  })

  it('skips a part whose mesh generation is not resolved yet', () => {
    expect(resolveAssemblyRows([part('p1')], {})).toEqual([])
  })

  it('skips a succeeded mesh that carries no media', () => {
    // Valid-but-wrong-shape: succeeded with an empty mediaUrls. Must not produce a
    // row with an undefined url.
    expect(
      resolveAssemblyRows([part('p1')], { 'mesh-p1': generation('mesh-p1', 'succeeded', []) }),
    ).toEqual([])
  })

  it('skips a part with no mesh citation at all', () => {
    expect(resolveAssemblyRows([part('p1', { meshGenerationId: null })], {})).toEqual([])
  })

  it('keeps a ready part whose POSTER has not resolved', () => {
    // The mesh is what makes a part placeable; the poster is only for the no-WebGL
    // fallback. A missing poster must not remove the part from the scene.
    const rows = resolveAssemblyRows([part('p1')], {
      'mesh-p1': generation('mesh-p1', 'succeeded', ['/media/a.glb']),
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.posterUrl).toBeNull()
  })

  it('never uses the mesh media as a poster', () => {
    // The mesh's mediaUrls[0] is the GLB itself — no <img> can display it.
    const rows = resolveAssemblyRows([part('p1', { imageGenerationId: null })], {
      'mesh-p1': generation('mesh-p1', 'succeeded', ['/media/a.glb']),
    })

    expect(rows[0]?.posterUrl).toBeNull()
  })

  it('keeps only the usable parts and preserves their order', () => {
    const rows = resolveAssemblyRows([part('p1'), part('p2'), part('p3')], {
      'mesh-p1': generation('mesh-p1', 'succeeded', ['/media/1.glb']),
      'mesh-p2': generation('mesh-p2', 'processing'),
      'mesh-p3': generation('mesh-p3', 'succeeded', ['/media/3.glb']),
    })

    expect(rows.map((row) => row.part.id)).toEqual(['p1', 'p3'])
  })

  it('returns nothing for an asset with no parts', () => {
    expect(resolveAssemblyRows([], {})).toEqual([])
  })
})
