// apps/web/src/modules/Assets3D/model/exportGlb.ts
// Merge the assembled parts into ONE downloadable .glb (ADR modular-3d-assets D4:
// "Export = client-side GLTFExporter over the assembled group").
//
// WHY CLIENT-SIDE AT ALL: the browser already holds every part's decoded scene — the
// user is looking at it. A server merge would mean re-downloading 12 GLBs into the API,
// a new job table, a new poller and a new failure domain, to produce a file the client
// can write in one pass. The ADR rejected that explicitly; a server merge appears only
// if DCC users need USDZ/FBX, which GLTFExporter cannot write anyway.
//
// THE ONE RULE THAT MAKES THIS SAFE: export operates on CLONES. The scenes handed in are
// the ones the live <Canvas> is rendering this frame. Transforming them in place would
// make every part visibly jump the moment the user clicked Export, and would corrupt the
// placements queued for PATCH. So we clone, place the clone, and export that.
//
// COROLLARY — NEVER dispose the exported group. three's clone() SHARES geometries,
// materials and textures with the live scene by reference (which is what we want: the
// exporter only reads them, and duplicating 12 parts' textures would be exactly the VRAM
// spike the viewer contract exists to avoid). Disposing the clone would therefore free the
// LIVE viewer's GPU resources out from under it. Ownership of that memory stays with
// useAssemblyGlb.ts, which loaded it.
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { PartTransform } from '@opencreate/contracts'
import { applyPartTransform } from './partTransform'

// One ready part, as the assembly stage resolved it: the loaded scene for the part's
// mesh generation (mediaUrls[0] — never a bare meshGenerationId) plus its saved placement.
export type AssemblyExportPart = {
  // The user's part name — this becomes the node name in the exported file, i.e. what
  // shows up in Blender's outliner. It is the entire point of a MODULAR asset.
  name: string
  scene: THREE.Object3D
  // null = never placed; the part keeps the GLB's own origin.
  transform: PartTransform | null
}

// Root node name in the exported file. Named rather than anonymous so the merged asset
// reads as a deliberate rig in a DCC tool.
export const ASSEMBLY_GROUP_NAME = 'asset3d-assembly'

// The binary write, as a PORT. Two reasons it is injectable and not inlined — the same
// two that made renderTurntable's frame sink a port:
//  1. it keeps the group assembly (the part with all the logic worth testing) provable
//     in jsdom without running a real binary writer, and
//  2. it keeps the file format a swappable detail if USDZ/FBX ever lands.
export type GlbBinaryExporter = (root: THREE.Object3D) => Promise<ArrayBuffer>

// The real writer. `binary: true` is what makes it a .glb (self-contained, textures
// embedded) rather than a .gltf plus a pile of sidecar files.
export const gltfBinaryExporter: GlbBinaryExporter = async (root) => {
  const result = await new GLTFExporter().parseAsync(root, { binary: true })
  // parseAsync's type is `ArrayBuffer | object` because the same method writes JSON
  // glTF. Narrow rather than assert: a JSON result here would mean `binary` was lost,
  // and shipping that as a .glb produces a file no DCC tool can open.
  if (!(result instanceof ArrayBuffer)) {
    throw new TypeError('The GLB export produced JSON glTF instead of a binary buffer.')
  }
  return result
}

// Build the export graph: one named, placed CLONE per part under a single root.
// Pure with respect to the inputs — see the header.
export function buildAssemblyGroup(parts: AssemblyExportPart[]): THREE.Group {
  const group = new THREE.Group()
  group.name = ASSEMBLY_GROUP_NAME

  for (const part of parts) {
    // Deep clone: the part's whole subtree, sharing GPU resources by reference.
    const node = part.scene.clone(true)
    node.name = part.name
    applyPartTransform(node, part.transform)
    group.add(node)
  }

  // GLTFExporter reads MATRICES. Without this the parts export stacked at the origin —
  // a merged GLB that looks nothing like the viewer the user just arranged.
  group.updateMatrixWorld(true)
  return group
}

// Assemble and write. Returns the Blob; the caller decides whether to download it, so
// this stays testable and reusable (the turntable/CinemaStudio bridge wants the group,
// not a download).
export async function exportAssemblyGlb(
  parts: AssemblyExportPart[],
  exporter: GlbBinaryExporter = gltfBinaryExporter,
): Promise<Blob> {
  // Refuse rather than hand back an empty file: a GLB with no meshes opens silently
  // blank in Blender, which reads as "the export is broken" long after the fact. The
  // stage renders a calm error for this state instead.
  if (parts.length === 0) {
    throw new Error('Cannot export an assembly with no parts.')
  }

  const group = buildAssemblyGroup(parts)
  const buffer = await exporter(group)
  return new Blob([buffer], { type: 'model/gltf-binary' })
}

// A filesystem-safe download name from the user's asset title. Anything outside
// [a-z0-9] collapses to a single dash — that covers the Windows-illegal set
// (\ / : * ? " < > |) and shell-hostile characters in one rule instead of a blocklist
// that will miss one.
export function glbFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // An emoji-only or CJK title slugifies to nothing; it must still download.
  return `${slug === '' ? 'asset' : slug}.glb`
}

// Trigger the browser download. Separate from exportAssemblyGlb because it is the only
// DOM-touching step — and because callers that want the Blob for something else (upload,
// share) should not be forced through a download.
export function downloadGlb(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  // Appended because Firefox ignores click() on an anchor that is not in the document.
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  // Deferred, not immediate: revoking in the same task can cancel the download before
  // the browser has read the blob (Safari in particular). An un-revoked url would pin
  // the WHOLE GLB — tens of MB — in memory for the life of the document, so this must
  // happen, just not yet.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
