// Load a user's GLB and OWN ITS GPU MEMORY (ADR: photo-to-3d-studio D6).
//
// WHY NOT drei's useGLTF: it caches by URL and never frees VRAM — useGLTF.clear()
// drops the JS cache entry only; geometries, materials and textures stay resident on
// the GPU. That is a deliberate design choice upstream (remounting a cached component
// must not find disposed resources), and it is correct for a site with five fixed
// models. Our model URLs are PER-USER and PER-GENERATION — unbounded — so the same
// cache is a monotonically growing VRAM leak whose terminal symptom is WebGL context
// loss on the user's machine. So we load it ourselves and dispose it ourselves.
//
// Keep exactly ONE <Canvas> alive at a time.
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type GlbState =
  | { status: 'loading'; progress: number }
  | { status: 'error'; message: string }
  | { status: 'ready'; scene: THREE.Group }

// Object3D does not declare these, but every GPU-owning node in a glTF graph
// (Mesh, SkinnedMesh, Points, Line) carries them. Duck-typing beats `instanceof Mesh`:
// glTF POINTS/LINES primitives are not Meshes and would otherwise leak.
type GpuOwner = {
  geometry?: THREE.BufferGeometry
  material?: THREE.Material | THREE.Material[]
}

// Walk the graph and release every GPU resource it holds. Textures are the ones that
// matter: a 2048² RGBA texture is ~16MB of VRAM decoded, and a handful of undisposed
// ones is exactly what kills a WebGL context on a phone.
export function disposeScene(root: THREE.Object3D): void {
  root.traverse((object) => {
    const owner = object as THREE.Object3D & GpuOwner
    owner.geometry?.dispose()

    const materials = Array.isArray(owner.material)
      ? owner.material
      : owner.material
        ? [owner.material]
        : []
    for (const material of materials) {
      // A material's texture slots are plain fields (map, normalMap, roughnessMap,
      // emissiveMap, …) and vary by material type — enumerate rather than list them,
      // because the one we forget to list is the one that stays on the GPU.
      for (const value of Object.values(material) as unknown[]) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  })
}

export function useGlb(url: string): GlbState {
  const [state, setState] = useState<GlbState>({ status: 'loading', progress: 0 })
  const [requestedUrl, setRequestedUrl] = useState(url)

  // Reset to `loading` DURING RENDER, not in the effect (React docs: "Adjusting some
  // state when a prop changes"). Resetting in the effect would commit one render in
  // which we still hand the caller the PREVIOUS model's scene — a Group the effect
  // cleanup is about to dispose — so the viewer would paint a frame against disposed
  // GPU buffers. React re-runs this render immediately and discards the stale output,
  // so no consumer ever sees the old scene under the new url.
  if (requestedUrl !== url) {
    setRequestedUrl(url)
    setState({ status: 'loading', progress: 0 })
  }

  useEffect(() => {
    let cancelled = false
    let loaded: THREE.Group | null = null

    new GLTFLoader().load(
      url,
      (gltf) => {
        // The effect was cleaned up while the fetch was in flight (the user navigated
        // away). Dispose immediately: nothing will ever mount this, and without it the
        // VRAM is leaked with no reference left to free it by.
        if (cancelled) {
          disposeScene(gltf.scene)
          return
        }
        loaded = gltf.scene
        setState({ status: 'ready', scene: gltf.scene })
      },
      (event) => {
        if (cancelled || !event.lengthComputable) return
        setState({ status: 'loading', progress: Math.round((event.loaded / event.total) * 100) })
      },
      () => {
        if (!cancelled) setState({ status: 'error', message: 'failed to load the 3D model' })
      },
    )

    return () => {
      cancelled = true
      if (loaded) disposeScene(loaded)
    }
  }, [url])

  return state
}
