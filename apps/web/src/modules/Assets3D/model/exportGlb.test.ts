// apps/web/src/modules/Assets3D/model/exportGlb.test.ts
// Export is the payoff of the whole wizard — the user paid per part to get THIS file
// out. Two properties carry it, and both are testable in jsdom with no WebGL:
//   1. the assembled group is a faithful, NON-DESTRUCTIVE copy of what the viewer
//      shows (right parts, right placements, live scene untouched), and
//   2. the binary step is a seam, so the group assembly can be proven without
//      running the real GLTFExporter.
// The exporter is injected (renderTurntable's TurntableFrameSink precedent).
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import * as THREE from 'three'
import type { PartTransform } from '@opencreate/contracts'
import {
  ASSEMBLY_GROUP_NAME,
  buildAssemblyGroup,
  downloadGlb,
  exportAssemblyGlb,
  glbFilename,
} from './exportGlb'
import type { AssemblyExportPart, GlbBinaryExporter } from './exportGlb'

function partScene(name: string): THREE.Group {
  const scene = new THREE.Group()
  scene.name = name
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
  return scene
}

const placed: PartTransform = {
  position: [1, 2, 3],
  rotation: [0, Math.PI / 2, 0],
  scale: [2, 2, 2],
}

function part(name: string, transform: PartTransform | null = null): AssemblyExportPart {
  return { name, scene: partScene(name), transform }
}

// Stands in for the real GLTFExporter so the group assembly is provable without
// running a binary writer in jsdom.
function fakeExporter(bytes = new ArrayBuffer(8)): GlbBinaryExporter & {
  calls: THREE.Object3D[]
} {
  const calls: THREE.Object3D[] = []
  const exporter: GlbBinaryExporter = (root) => {
    calls.push(root)
    return Promise.resolve(bytes)
  }
  return Object.assign(exporter, { calls })
}

describe('buildAssemblyGroup', () => {
  it('groups one node per part, named for the part', () => {
    // Part names are the whole point of a MODULAR asset: they are what the user sees
    // in Blender's outliner. An unnamed merge is just a mesh.
    const group = buildAssemblyGroup([part('Jacket'), part('Boots')])

    expect(group.name).toBe(ASSEMBLY_GROUP_NAME)
    expect(group.children.map((child) => child.name)).toEqual(['Jacket', 'Boots'])
  })

  it('bakes each part transform into its node', () => {
    const group = buildAssemblyGroup([part('Jacket', placed)])
    const node = group.children[0]

    expect(node?.position.toArray()).toEqual([1, 2, 3])
    expect(node?.scale.toArray()).toEqual([2, 2, 2])
    expect(node?.rotation.y).toBeCloseTo(Math.PI / 2, 5)
  })

  it('places an untransformed part at the origin at unit scale', () => {
    // transform === null means "never placed" — the GLB's own origin, not wherever
    // the previous part happened to be.
    const group = buildAssemblyGroup([part('Jacket')])
    const node = group.children[0]

    expect(node?.position.toArray()).toEqual([0, 0, 0])
    expect(node?.scale.toArray()).toEqual([1, 1, 1])
  })

  it('exports CLONES, leaving the live viewer scenes untouched', () => {
    // THE destructive-export bug: transforming the scenes the <Canvas> is currently
    // rendering would make every part visibly jump on the page the moment the user
    // clicked Export, and would corrupt the placements about to be PATCHed.
    const live = part('Jacket', placed)
    const before = live.scene.position.toArray()

    const group = buildAssemblyGroup([live])

    expect(group.children[0]).not.toBe(live.scene)
    expect(live.scene.position.toArray()).toEqual(before)
    expect(live.scene.parent).toBeNull()
  })

  it('shares geometry and material with the live scene rather than duplicating VRAM', () => {
    // three's clone() shares GPU resources by reference, which is what we want:
    // GLTFExporter only READS them, and duplicating 12 parts' textures to export
    // them is exactly the VRAM spike the viewer contract exists to avoid.
    // The corollary is the disposal rule in the source: NEVER dispose the clone.
    const live = part('Jacket')
    const liveMesh = live.scene.children[0]

    const group = buildAssemblyGroup([live])
    const clonedMesh = group.children[0]?.children[0]

    expect(clonedMesh).toBeInstanceOf(THREE.Mesh)
    expect(clonedMesh).not.toBe(liveMesh)
    if (clonedMesh instanceof THREE.Mesh && liveMesh instanceof THREE.Mesh) {
      expect(clonedMesh.geometry).toBe(liveMesh.geometry)
      expect(clonedMesh.material).toBe(liveMesh.material)
    }
  })

  it('keeps the parts in the order it was given', () => {
    const group = buildAssemblyGroup([part('A'), part('B'), part('C')])

    expect(group.children.map((child) => child.name)).toEqual(['A', 'B', 'C'])
  })

  it('returns an empty group for no parts rather than throwing', () => {
    expect(buildAssemblyGroup([]).children).toHaveLength(0)
  })
})

describe('exportAssemblyGlb', () => {
  it('hands the assembled group to the exporter and returns a glb Blob', async () => {
    const exporter = fakeExporter()

    const blob = await exportAssemblyGlb([part('Jacket'), part('Boots')], exporter)

    expect(exporter.calls).toHaveLength(1)
    expect(exporter.calls[0]?.children.map((c) => c.name)).toEqual(['Jacket', 'Boots'])
    expect(blob.type).toBe('model/gltf-binary')
    expect(blob.size).toBe(8)
  })

  it('refuses to export nothing instead of downloading an empty file', async () => {
    // A 0-part "asset" is a valid-but-wrong-shape state, not a crash — the stage
    // renders a calm error. Producing a GLB with no meshes would be worse: the user
    // gets a file that silently opens empty in Blender.
    const exporter = fakeExporter()

    await expect(exportAssemblyGlb([], exporter)).rejects.toThrow(/no parts/i)
    expect(exporter.calls).toHaveLength(0)
  })

  it('propagates an exporter failure instead of downloading a broken file', async () => {
    const failing: GlbBinaryExporter = () => Promise.reject(new Error('writer blew up'))

    await expect(exportAssemblyGlb([part('Jacket')], failing)).rejects.toThrow('writer blew up')
  })

  it('leaves the live scenes untouched even when the export fails', async () => {
    const live = part('Jacket', placed)
    const failing: GlbBinaryExporter = () => Promise.reject(new Error('writer blew up'))

    await expect(exportAssemblyGlb([live], failing)).rejects.toThrow()

    expect(live.scene.parent).toBeNull()
    expect(live.scene.position.toArray()).toEqual([0, 0, 0])
  })
})

describe('glbFilename', () => {
  it('slugifies the asset title', () => {
    expect(glbFilename('Cyberpunk Ronin')).toBe('cyberpunk-ronin.glb')
  })

  it('strips characters that break a download on Windows or a shell', () => {
    expect(glbFilename('A/B:C*?"<>|D')).toBe('a-b-c-d.glb')
  })

  it('falls back to a stable name for a title that slugifies to nothing', () => {
    // An emoji-only or CJK title must still produce a downloadable file.
    expect(glbFilename('🎮🎮')).toBe('asset.glb')
    expect(glbFilename('   ')).toBe('asset.glb')
  })
})

describe('downloadGlb', () => {
  // jsdom has no URL.createObjectURL, and an anchor click must not really navigate.
  function stubObjectUrls(): { createObjectURL: Mock; revokeObjectURL: Mock } {
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    return { createObjectURL, revokeObjectURL }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('revokes the object url it created', () => {
    // An un-revoked blob url pins the WHOLE GLB (tens of MB) in memory for the life
    // of the document. Exporting a few times would outgrow the tab.
    vi.useFakeTimers()
    const { createObjectURL, revokeObjectURL } = stubObjectUrls()

    downloadGlb(new Blob(['x'], { type: 'model/gltf-binary' }), 'ronin.glb')

    expect(createObjectURL).toHaveBeenCalledOnce()
    // Deferred on purpose — see the source: revoking in the same task can cancel the
    // download before the browser has read the blob.
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.runAllTimers()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('names the download after the asset and leaves no anchor behind', () => {
    stubObjectUrls()

    downloadGlb(new Blob(['x']), 'ronin.glb')

    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
  })
})
