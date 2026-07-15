// Tests for the disposal half of useGlb — the half that stops the viewer from
// killing the user's WebGL context. Every assertion here is about GPU memory
// actually being handed back, not about the loader's happy path.
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { disposeScene } from './useGlb'

describe('disposeScene', () => {
  it('disposes every geometry, material and texture in the graph', () => {
    const texture = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial({ map: texture })
    const geometry = new THREE.BoxGeometry()
    const scene = new THREE.Scene()
    scene.add(new THREE.Mesh(geometry, material))

    const geo = vi.spyOn(geometry, 'dispose')
    const mat = vi.spyOn(material, 'dispose')
    const tex = vi.spyOn(texture, 'dispose')

    disposeScene(scene)

    expect(geo).toHaveBeenCalledOnce()
    expect(mat).toHaveBeenCalledOnce()
    // The texture is the one everybody forgets, and it is the one that eats VRAM:
    // a 2048² RGBA texture is ~16MB decoded on the GPU.
    expect(tex).toHaveBeenCalledOnce()
  })

  it('disposes every material of a multi-material mesh', () => {
    const a = new THREE.MeshStandardMaterial()
    const b = new THREE.MeshStandardMaterial()
    const scene = new THREE.Scene()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), [a, b]))
    const spies = [vi.spyOn(a, 'dispose'), vi.spyOn(b, 'dispose')]

    disposeScene(scene)

    for (const s of spies) expect(s).toHaveBeenCalledOnce()
  })

  it('disposes a nested child deep in the graph', () => {
    const texture = new THREE.Texture()
    const child = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ map: texture }),
    )
    const group = new THREE.Group()
    group.add(child)
    const root = new THREE.Group()
    root.add(group)
    const tex = vi.spyOn(texture, 'dispose')

    disposeScene(root)

    expect(tex).toHaveBeenCalledOnce()
  })

  it('is safe to call twice', () => {
    const scene = new THREE.Scene()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
    disposeScene(scene)
    expect(() => disposeScene(scene)).not.toThrow()
  })

  it('does not throw on an object with no geometry or material', () => {
    const scene = new THREE.Scene()
    scene.add(new THREE.Group())
    expect(() => disposeScene(scene)).not.toThrow()
  })
})
