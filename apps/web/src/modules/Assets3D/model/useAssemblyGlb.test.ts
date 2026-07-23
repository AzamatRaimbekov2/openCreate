// apps/web/src/modules/Assets3D/model/useAssemblyGlb.test.ts
// Assembly loads UP TO MAX_PARTS (12) GLBs into ONE canvas, so this module is where
// the VRAM budget is won or lost — every assertion below is about GPU memory actually
// being handed back, not about the loader's happy path.
//
// Nothing here touches WebGL or the network: the GLTFLoader is replaced by a fake
// whose callbacks the test fires by hand, and disposal is observed with vi.spyOn on
// REAL three objects (the Studio3D useGlb.test.ts template).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import * as THREE from 'three'

// A captured GLTFLoader.load() call, resolvable on demand so the test controls the
// exact interleaving of resolve / unmount / url-change that the guards exist for.
type LoadCall = {
  url: string
  onLoad: (gltf: { scene: THREE.Group }) => void
  onProgress: (event: ProgressEvent) => void
  onError: (error: unknown) => void
}

const { loadCalls, loadThrows } = vi.hoisted(() => ({
  loadCalls: [] as LoadCall[],
  // Flipped by the synchronous-throw tests to make the fake behave like three's
  // FileLoader on a url it cannot turn into a Request.
  loadThrows: { value: false },
}))

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    load(
      url: string,
      onLoad: (gltf: { scene: THREE.Group }) => void,
      onProgress: (event: ProgressEvent) => void,
      onError: (error: unknown) => void,
    ): void {
      if (loadThrows.value) throw new TypeError(`Failed to parse URL from ${url}`)
      loadCalls.push({ url, onLoad, onProgress, onError })
    }
  },
}))

// Imported after the vi.mock above only for readability — vitest hoists mocks above
// every static import, so the fake loader is already in place here.
import { disposeScene, useAssemblyGlb, useAssemblyGlbs } from './useAssemblyGlb'

// A scene that OWNS real GPU resources, so disposal can be observed rather than assumed.
function sceneWithGpuResources(): {
  scene: THREE.Group
  geometry: THREE.BufferGeometry
  material: THREE.MeshStandardMaterial
  texture: THREE.Texture
} {
  const texture = new THREE.Texture()
  const material = new THREE.MeshStandardMaterial({ map: texture })
  const geometry = new THREE.BoxGeometry()
  const scene = new THREE.Group()
  scene.add(new THREE.Mesh(geometry, material))
  return { scene, geometry, material, texture }
}

function callFor(url: string): LoadCall {
  const call = loadCalls.find((c) => c.url === url)
  if (!call) throw new Error(`no GLTFLoader.load() call for ${url}`)
  return call
}

beforeEach(() => {
  loadCalls.length = 0
  loadThrows.value = false
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('disposeScene', () => {
  it('disposes every geometry, material and texture in the graph', () => {
    const { scene, geometry, material, texture } = sceneWithGpuResources()
    const geo = vi.spyOn(geometry, 'dispose')
    const mat = vi.spyOn(material, 'dispose')
    const tex = vi.spyOn(texture, 'dispose')

    disposeScene(scene)

    expect(geo).toHaveBeenCalledOnce()
    expect(mat).toHaveBeenCalledOnce()
    // The texture is the one everybody forgets and the one that eats VRAM: a 2048²
    // RGBA texture is ~16MB decoded on the GPU, and assembly holds up to 12 GLBs.
    expect(tex).toHaveBeenCalledOnce()
  })

  it('disposes every material of a multi-material mesh', () => {
    const a = new THREE.MeshStandardMaterial()
    const b = new THREE.MeshStandardMaterial()
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), [a, b]))
    const spies = [vi.spyOn(a, 'dispose'), vi.spyOn(b, 'dispose')]

    disposeScene(scene)

    for (const spy of spies) expect(spy).toHaveBeenCalledOnce()
  })

  it('disposes a child nested deep in the graph', () => {
    const texture = new THREE.Texture()
    const child = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ map: texture }),
    )
    const inner = new THREE.Group()
    inner.add(child)
    const root = new THREE.Group()
    root.add(inner)
    const tex = vi.spyOn(texture, 'dispose')

    disposeScene(root)

    expect(tex).toHaveBeenCalledOnce()
  })

  it('disposes non-Mesh GPU owners like Points and Line', () => {
    // THE REASON THE WALK IS DUCK-TYPED. glTF POINTS/LINES primitives are not
    // Meshes, so an `instanceof Mesh` check would walk straight past them and leak
    // their buffers — silently, and only on the assets that happen to contain them.
    const pointsGeometry = new THREE.BufferGeometry()
    const lineGeometry = new THREE.BufferGeometry()
    const root = new THREE.Group()
    root.add(new THREE.Points(pointsGeometry, new THREE.PointsMaterial()))
    root.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial()))
    const points = vi.spyOn(pointsGeometry, 'dispose')
    const line = vi.spyOn(lineGeometry, 'dispose')

    disposeScene(root)

    expect(points).toHaveBeenCalledOnce()
    expect(line).toHaveBeenCalledOnce()
  })

  it('disposes textures BEFORE the material that owns them', () => {
    // Ordering is load-bearing: three's Material.dispose() drops the object's texture
    // slots, so enumerating them afterwards finds nothing and the texture memory —
    // the expensive part — stays resident.
    const order: string[] = []
    const texture = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial({ map: texture })
    vi.spyOn(texture, 'dispose').mockImplementation(() => order.push('texture'))
    vi.spyOn(material, 'dispose').mockImplementation(() => order.push('material'))
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material))

    disposeScene(scene)

    expect(order).toEqual(['texture', 'material'])
  })

  it('is safe to call twice and on a resource-free graph', () => {
    const { scene } = sceneWithGpuResources()
    disposeScene(scene)

    expect(() => disposeScene(scene)).not.toThrow()
    expect(() => disposeScene(new THREE.Group())).not.toThrow()
  })
})

describe('useAssemblyGlb', () => {
  it('starts loading and never fetches before it is asked to', () => {
    const { result } = renderHook(() => useAssemblyGlb('/media/a.glb'))

    expect(result.current).toEqual({ status: 'loading', progress: 0 })
    expect(loadCalls).toHaveLength(1)
    expect(loadCalls[0]?.url).toBe('/media/a.glb')
  })

  it('hands the caller the loaded scene', () => {
    const { scene } = sceneWithGpuResources()
    const { result } = renderHook(() => useAssemblyGlb('/media/a.glb'))

    act(() => callFor('/media/a.glb').onLoad({ scene }))

    expect(result.current).toEqual({ status: 'ready', scene })
  })

  it('reports download progress as a percentage', () => {
    const { result } = renderHook(() => useAssemblyGlb('/media/a.glb'))

    act(() =>
      callFor('/media/a.glb').onProgress(
        new ProgressEvent('progress', { lengthComputable: true, loaded: 25, total: 100 }),
      ),
    )

    expect(result.current).toEqual({ status: 'loading', progress: 25 })
  })

  it('ignores progress events that cannot be measured', () => {
    // A server without Content-Length gives loaded/total = 0, which would render a
    // progress bar that sits at 0% and looks stuck.
    const { result } = renderHook(() => useAssemblyGlb('/media/a.glb'))

    act(() =>
      callFor('/media/a.glb').onProgress(new ProgressEvent('progress', { lengthComputable: false })),
    )

    expect(result.current).toEqual({ status: 'loading', progress: 0 })
  })

  it('surfaces a failed load as an error state, not a throw', () => {
    const { result } = renderHook(() => useAssemblyGlb('/media/a.glb'))

    act(() => callFor('/media/a.glb').onError(new Error('404')))

    expect(result.current.status).toBe('error')
  })

  it('survives a loader that throws SYNCHRONOUSLY', () => {
    // three's FileLoader builds a Request up front, so a url it cannot parse throws
    // from load() itself — the onError callback is never reached. Unguarded, that
    // throw escapes the effect and React unmounts the whole viewer: one bad url
    // would blank the entire assembly stage rather than skipping one part.
    loadThrows.value = true
    const { result } = renderHook(() => useAssemblyGlb('/media/a.glb'))

    expect(result.current.status).toBe('error')
  })

  it('lets siblings load when one url throws synchronously', () => {
    loadThrows.value = true

    const { result } = renderHook(() => useAssemblyGlbs(['/media/a.glb', '/media/b.glb']))

    // Both fail here (the fake throws for every url), but the batch itself must
    // still be intact and per-part rather than a single dead component.
    expect(result.current).toHaveLength(2)
    expect(result.current[0]?.status).toBe('error')
    expect(result.current[1]?.status).toBe('error')
  })

  it('disposes the loaded scene on unmount', () => {
    const { scene, geometry, texture } = sceneWithGpuResources()
    const { unmount } = renderHook(() => useAssemblyGlb('/media/a.glb'))
    act(() => callFor('/media/a.glb').onLoad({ scene }))
    const geo = vi.spyOn(geometry, 'dispose')
    const tex = vi.spyOn(texture, 'dispose')

    unmount()

    expect(geo).toHaveBeenCalledOnce()
    expect(tex).toHaveBeenCalledOnce()
  })

  it('disposes a scene that resolves AFTER unmount', () => {
    // The user left the assembly stage while a 30MB GLB was still in flight. Nothing
    // will ever mount this scene, and once the effect is gone there is no reference
    // left to free it by — so the load callback must dispose it itself.
    const { scene, geometry, texture } = sceneWithGpuResources()
    const { unmount } = renderHook(() => useAssemblyGlb('/media/a.glb'))
    const geo = vi.spyOn(geometry, 'dispose')
    const tex = vi.spyOn(texture, 'dispose')

    unmount()
    expect(() => callFor('/media/a.glb').onLoad({ scene })).not.toThrow()

    expect(geo).toHaveBeenCalledOnce()
    expect(tex).toHaveBeenCalledOnce()
  })

  it('never hands out the previous scene under a new url', () => {
    // The reset happens DURING RENDER, not in the effect. Resetting in the effect
    // would commit one frame in which the caller still holds the PREVIOUS Group —
    // the one the cleanup is about to dispose — so the viewer would paint against
    // freed GPU buffers.
    const { scene } = sceneWithGpuResources()
    const { result, rerender } = renderHook(({ url }: { url: string }) => useAssemblyGlb(url), {
      initialProps: { url: '/media/a.glb' },
    })
    act(() => callFor('/media/a.glb').onLoad({ scene }))
    expect(result.current.status).toBe('ready')

    rerender({ url: '/media/b.glb' })

    expect(result.current).toEqual({ status: 'loading', progress: 0 })
  })

  it('disposes the previous scene when the url changes', () => {
    const { scene, geometry, texture } = sceneWithGpuResources()
    const { rerender } = renderHook(({ url }: { url: string }) => useAssemblyGlb(url), {
      initialProps: { url: '/media/a.glb' },
    })
    act(() => callFor('/media/a.glb').onLoad({ scene }))
    const geo = vi.spyOn(geometry, 'dispose')
    const tex = vi.spyOn(texture, 'dispose')

    rerender({ url: '/media/b.glb' })

    expect(geo).toHaveBeenCalledOnce()
    expect(tex).toHaveBeenCalledOnce()
    expect(callFor('/media/b.glb')).toBeDefined()
  })

  it('does not reload when re-rendered with the same url', () => {
    const { rerender } = renderHook(({ url }: { url: string }) => useAssemblyGlb(url), {
      initialProps: { url: '/media/a.glb' },
    })

    rerender({ url: '/media/a.glb' })
    rerender({ url: '/media/a.glb' })

    // A reload per render would re-download the GLB and leak the previous copy.
    expect(loadCalls).toHaveLength(1)
  })
})

describe('useAssemblyGlbs', () => {
  it('loads every url and returns one state per part, in order', () => {
    const { result } = renderHook(() => useAssemblyGlbs(['/media/a.glb', '/media/b.glb']))

    expect(result.current).toHaveLength(2)
    expect(loadCalls.map((c) => c.url)).toEqual(['/media/a.glb', '/media/b.glb'])
  })

  it('resolves parts independently, so one part is usable while another downloads', () => {
    const first = sceneWithGpuResources()
    const { result } = renderHook(() => useAssemblyGlbs(['/media/a.glb', '/media/b.glb']))

    act(() => callFor('/media/a.glb').onLoad({ scene: first.scene }))

    expect(result.current[0]).toEqual({ status: 'ready', scene: first.scene })
    expect(result.current[1]?.status).toBe('loading')
  })

  it('does not let one failed part hide its siblings', () => {
    // The batch rule the whole feature runs on: a failure is per-part, never fatal.
    const second = sceneWithGpuResources()
    const { result } = renderHook(() => useAssemblyGlbs(['/media/a.glb', '/media/b.glb']))

    act(() => callFor('/media/a.glb').onError(new Error('gone')))
    act(() => callFor('/media/b.glb').onLoad({ scene: second.scene }))

    expect(result.current[0]?.status).toBe('error')
    expect(result.current[1]).toEqual({ status: 'ready', scene: second.scene })
  })

  it('disposes every loaded part on unmount', () => {
    const a = sceneWithGpuResources()
    const b = sceneWithGpuResources()
    const { unmount } = renderHook(() => useAssemblyGlbs(['/media/a.glb', '/media/b.glb']))
    act(() => callFor('/media/a.glb').onLoad({ scene: a.scene }))
    act(() => callFor('/media/b.glb').onLoad({ scene: b.scene }))
    const spies = [vi.spyOn(a.texture, 'dispose'), vi.spyOn(b.texture, 'dispose')]

    unmount()

    for (const spy of spies) expect(spy).toHaveBeenCalledOnce()
  })

  it('reloads when a part is added, because the set of urls changed', () => {
    const { result, rerender } = renderHook(({ urls }: { urls: string[] }) => useAssemblyGlbs(urls), {
      initialProps: { urls: ['/media/a.glb'] },
    })

    rerender({ urls: ['/media/a.glb', '/media/b.glb'] })

    expect(result.current).toHaveLength(2)
    expect(callFor('/media/b.glb')).toBeDefined()
  })

  it('does not reload when handed an equal array with a new identity', () => {
    // AssemblyStage rebuilds this array from the parts query on every render. Keying
    // the effect on the array OBJECT would re-download every GLB on every render.
    const { rerender } = renderHook(({ urls }: { urls: string[] }) => useAssemblyGlbs(urls), {
      initialProps: { urls: ['/media/a.glb', '/media/b.glb'] },
    })

    rerender({ urls: ['/media/a.glb', '/media/b.glb'] })

    expect(loadCalls).toHaveLength(2)
  })

  it('loads nothing for an empty part list', () => {
    // No meshed parts yet. Must not fall through to loading the empty string.
    const { result } = renderHook(() => useAssemblyGlbs([]))

    expect(result.current).toEqual([])
    expect(loadCalls).toHaveLength(0)
  })
})
