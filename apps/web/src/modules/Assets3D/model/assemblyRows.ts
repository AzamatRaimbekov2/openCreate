// apps/web/src/modules/Assets3D/model/assemblyRows.ts
// PURE resolution of "which parts can actually be assembled, and from what url"
// (plan Fix FG-3).
//
// THE BUG THIS FILE EXISTS TO PREVENT: a part cites its mesh by ID only
// (`meshGenerationId`), and the GLB's `/media/*` path lives on THAT generation's
// `mediaUrls[0]`. Deriving a url from the bare id — `/media/${meshGenerationId}.glb`
// or similar — happens to look right and is wrong: the id is not the filename, and a
// still-processing or failed generation has no file at all. So the mapping goes
// through the resolved generation, and a part whose mesh has not SUCCEEDED with media
// is skipped entirely (the useShotGenerations precedent: return only playable rows).
//
// Pure and separate from the stage component so every skip rule is unit-testable with
// no network, no WebGL and no render.
import type { Asset3dPart, Generation } from '@opencreate/contracts'

// One part that is genuinely ready to place in the scene.
export type AssemblyRow = {
  part: Asset3dPart
  // The resolved GLB url — mediaUrls[0] of the part's SUCCEEDED mesh generation.
  glbUrl: string
  // The part's EXTRACTION image, for the no-WebGL poster fallback. Null while that
  // generation is unresolved — a mesh can be ready before its poster is fetched, and
  // the fallback tile handles the gap. Never the mesh's media: that is the GLB, which
  // no <img> can display.
  posterUrl: string | null
}

// Every generation id an assembly needs resolved: the mesh (for the GLB) and the
// extraction image (for the poster). One list so the caller makes ONE batch query.
export function assemblyGenerationIds(parts: Asset3dPart[]): string[] {
  const ids: string[] = []
  for (const part of parts) {
    if (part.meshGenerationId !== null) ids.push(part.meshGenerationId)
    if (part.imageGenerationId !== null) ids.push(part.imageGenerationId)
  }
  return ids
}

// How many parts cite a mesh at all. Distinguishes "nothing has been meshed yet"
// (a calm, explainable state) from "meshes exist but none finished" — different copy,
// so the stage must be able to tell them apart.
export function meshCitationCount(parts: Asset3dPart[]): number {
  return parts.filter((part) => part.meshGenerationId !== null).length
}

// Media url of a generation, but ONLY if it actually succeeded and carries one.
// A succeeded-but-empty `mediaUrls` is a valid-but-wrong-shape row, not a crash.
function resolvedMedia(generation: Generation | undefined): string | null {
  if (generation === undefined || generation.status !== 'succeeded') return null
  return generation.mediaUrls[0] ?? null
}

// The placeable rows, in the parts' own order. Skips anything without a real GLB.
export function resolveAssemblyRows(
  parts: Asset3dPart[],
  byId: Record<string, Generation>,
): AssemblyRow[] {
  const rows: AssemblyRow[] = []
  for (const part of parts) {
    if (part.meshGenerationId === null) continue
    const glbUrl = resolvedMedia(byId[part.meshGenerationId])
    // Still processing, failed, unresolved, or succeeded with no file — all of them
    // mean "no GLB", and all of them are skips rather than errors.
    if (glbUrl === null) continue
    const posterUrl =
      part.imageGenerationId === null ? null : resolvedMedia(byId[part.imageGenerationId])
    rows.push({ part, glbUrl, posterUrl })
  }
  return rows
}
