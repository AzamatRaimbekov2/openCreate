// apps/web/src/modules/Assets3D/model/useAssemblyGlb.ts
// Load the assembly's part GLBs and OWN THEIR GPU MEMORY (ADR modular-3d-assets D4,
// which adopts photo-to-3d-studio D6 verbatim).
//
// WHY NOT drei's GLTF suspense-cache hook: it caches by URL and never frees VRAM. Its
// cache-clear helper drops the JS entry only — geometries, materials and textures stay
// resident on the GPU. That is a correct upstream choice for a site with five fixed
// models, but our URLs are PER-USER and PER-GENERATION, i.e. unbounded, so the same
// cache is a monotonically growing leak whose terminal symptom is WebGL context loss on
// the user's machine. We load it ourselves and we dispose it ourselves.
// (The identifier is spelled out in Studio3D/model/useGlb.ts; it is kept out of this
// module so the FG8 verification grep for real usages stays meaningful.)
//
// ASSEMBLY MAKES THIS SHARPER THAN STUDIO3D. Studio3D shows ONE model; assembly holds up
// to MAX_PARTS (12) at once in a single <Canvas>, and the user re-rolls part meshes while
// standing on the page — so scenes churn. Twelve resident-but-unreferenced part GLBs is
// exactly the budget that kills a context on a phone.
//
// DELIBERATELY COPIED FROM, NOT IMPORTED FROM, Studio3D/model/useGlb.ts. Cross-module
// imports are forbidden by the module law. `disposeScene` and the singular hook here are
// near-identical to Studio3D's and are a genuine candidate for a LATER `shared/`
// extraction — flagged, not hoisted (see the sidecar).
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type GlbState =
  | { status: 'loading'; progress: number }
  | { status: 'error'; message: string }
  | { status: 'ready'; scene: THREE.Group }

// Object3D does not declare these, but every GPU-owning node in a glTF graph (Mesh,
// SkinnedMesh, Points, Line) carries them. Duck-typing beats `instanceof Mesh`: glTF
// POINTS/LINES primitives are NOT Meshes and would otherwise leak — silently, and only
// on the assets that happen to contain them.
type GpuOwner = {
  geometry?: THREE.BufferGeometry
  material?: THREE.Material | THREE.Material[]
}

// A non-localised, stable marker. The UI renders a translated string off
// `status === 'error'`; this text is never shown to a user.
const LOAD_FAILED = 'failed to load the part model'

const initialState = (): GlbState => ({ status: 'loading', progress: 0 })

// Immutable per-index update — React state must not be mutated in place, and each part
// resolves on its own schedule.
function replaceAt(states: GlbState[], index: number, next: GlbState): GlbState[] {
  const copy = states.slice()
  copy[index] = next
  return copy
}

// Walk the graph and release every GPU resource it holds. Textures are the ones that
// matter: a 2048² RGBA texture is ~16MB of VRAM decoded, and a handful of undisposed
// ones is exactly what kills a WebGL context on a phone.
export function disposeScene(root: THREE.Object3D): void {
  root.traverse((object) => {
    const owner: THREE.Object3D & GpuOwner = object
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
      //
      // ORDER IS LOAD-BEARING: this runs BEFORE material.dispose(), because disposing
      // the material drops those slots and an enumeration afterwards finds nothing —
      // leaving the expensive half (the texture memory) resident.
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  })
}

// Load N part GLBs as one owned batch. This is the PRIMARY hook: assembly needs every
// resolved scene in one place both to mount the parts and to feed `exportGlb`.
//
// OWNERSHIP RULE — read this before wiring a component: whichever component calls a hook
// in this file OWNS those scenes' VRAM until it unmounts. Do not call `useAssemblyGlbs`
// in AssemblyStage AND `useAssemblyGlb` in each PartMesh for the same urls: that loads
// every GLB twice and doubles the VRAM the whole file exists to bound. Pick one owner
// and pass scenes down as props.
export function useAssemblyGlbs(urls: string[]): GlbState[] {
  // The effect must key on the CONTENT of the list, not its identity: AssemblyStage
  // rebuilds this array from the parts query on every render, so an identity-keyed
  // effect would re-download every GLB on every render. `\n` is a safe separator —
  // no URL contains one.
  const key = urls.join('\n')
  // The urls are carried ALONGSIDE their key so the effect can read the real array
  // without re-deriving it from the string (which cannot distinguish [] from ['']).
  const [requested, setRequested] = useState(() => ({ key, urls }))
  const [states, setStates] = useState<GlbState[]>(() => urls.map(initialState))

  // Reset DURING RENDER, not in the effect (React docs: "Adjusting some state when a
  // prop changes"). Resetting in the effect would commit one render in which we still
  // hand the caller the PREVIOUS scenes — Groups the effect cleanup is about to dispose
  // — so the viewer would paint a frame against freed GPU buffers. React re-runs this
  // render immediately and discards the stale output, so no consumer sees the old scenes
  // under the new urls.
  if (requested.key !== key) {
    setRequested({ key, urls })
    setStates(urls.map(initialState))
  }

  useEffect(() => {
    let cancelled = false
    // Every scene this effect brought into existence, so cleanup can free them all —
    // including ones that arrived after a sibling failed.
    const loaded: (THREE.Group | null)[] = requested.urls.map(() => null)
    const loader = new GLTFLoader()

    requested.urls.forEach((url, index) => {
      // load() can throw SYNCHRONOUSLY — three's FileLoader builds a Request up
      // front, so a url it cannot parse (or any base-less relative url outside a
      // document) throws here and NEVER reaches the onError callback below.
      // Unguarded, that throw escapes the effect and React unmounts the whole
      // viewer: one malformed url would blank the entire assembly stage instead of
      // dropping the one part it belongs to.
      try {
        loader.load(
          url,
          (gltf) => {
            // The effect was cleaned up while this fetch was in flight (the user left
            // the stage, or re-rolled a part's mesh). Dispose immediately: nothing will
            // ever mount this, and once the effect is gone there is no reference left
            // to free it by.
            if (cancelled) {
              disposeScene(gltf.scene)
              return
            }
            loaded[index] = gltf.scene
            setStates((prev) => replaceAt(prev, index, { status: 'ready', scene: gltf.scene }))
          },
          (event) => {
            // A server without Content-Length reports 0/0; publishing that would render
            // a progress bar pinned at 0% that looks stuck rather than indeterminate.
            if (cancelled || !event.lengthComputable || event.total === 0) return
            const progress = Math.round((event.loaded / event.total) * 100)
            setStates((prev) => replaceAt(prev, index, { status: 'loading', progress }))
          },
          () => {
            // Per-part failure, never fatal to the batch — the same rule the paid
            // stages follow. A part that cannot load is simply absent from the assembly.
            if (cancelled) return
            setStates((prev) => replaceAt(prev, index, { status: 'error', message: LOAD_FAILED }))
          },
        )
      } catch {
        // Same destination as the async failure: this part is unavailable, its
        // siblings are unaffected.
        if (!cancelled) {
          setStates((prev) => replaceAt(prev, index, { status: 'error', message: LOAD_FAILED }))
        }
      }
    })

    return () => {
      cancelled = true
      for (const scene of loaded) {
        if (scene) disposeScene(scene)
      }
    }
  }, [requested])

  return states
}

// One part's GLB — what `PartMesh` calls. A thin projection of the batch hook so there is
// exactly ONE loading/disposal implementation to keep correct.
export function useAssemblyGlb(url: string): GlbState {
  const states = useAssemblyGlbs([url])
  // Always length 1; the fallback exists only to satisfy noUncheckedIndexedAccess.
  return states[0] ?? initialState()
}
