// apps/web/src/modules/Cinema/model/exportToCanvas.ts
// Pure, one-off conversion from a finished film into a brand-new Canvas
// document — ONE node per exportable shot, chained by sequential edges. No
// live link back to the film: this is a snapshot, not a sync (owner request,
// "Export to Canvas").
//
// PURE ON PURPOSE, and deliberately importing NOTHING from modules/Canvas:
// only @opencreate/contracts types cross the boundary, so this file is
// testable without mounting the store/editor and can never accidentally grow
// a Canvas-module dependency. FilmEditor.tsx is the caller that has the
// (owner-approved) exception to import modules/Canvas for the create+save.
import type { CanvasEdge, CanvasNode, CanvasViewport, Film, Generation, Shot } from '@opencreate/contracts'

// `createCanvasInputSchema.title` caps at 120 — a long film title plus the
// suffix could overrun it, so the combined string is truncated here rather
// than left to fail the wire schema at save time.
const CANVAS_TITLE_SUFFIX = ' — Canvas'
const MAX_CANVAS_TITLE = 120

function buildCanvasTitle(filmTitle: string): string {
  const full = `${filmTitle}${CANVAS_TITLE_SUFFIX}`
  return full.length > MAX_CANVAS_TITLE ? full.slice(0, MAX_CANVAS_TITLE) : full
}

// A shot+its resolved generation, once known to be exportable — narrowing
// generationId/generation to non-null HERE (instead of re-deriving them with
// a `!` at node-build time) is what keeps the mapping below `!`-free.
type ExportableShot = { shot: Shot; generation: Generation }

// A shot is exportable when it actually has playable footage: a cited
// generation that exists, succeeded, and produced at least one media file.
// Everything else (title cards, `generationId: null`, a still-processing or
// failed clip, a generation the cache never resolved) is silently dropped —
// there is nothing for a canvas node to show.
function resolveExportableShot(
  shot: Shot,
  generationsById: Record<string, Generation>,
): ExportableShot | null {
  if (shot.generationId === null) return null
  const generation = generationsById[shot.generationId]
  if (!generation) return null
  if (generation.status !== 'succeeded') return null
  if (generation.mediaUrls.length === 0) return null
  return { shot, generation }
}

// Horizontal spacing between nodes on the fresh board — enough that adjacent
// image/video cards (which render at a few hundred px wide) don't overlap.
const NODE_X_SPACING = 320

export type CanvasExportDoc = {
  title: string
  viewport: CanvasViewport
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

// Build the new canvas's document from a film's shots, or `null` when there
// is nothing to export (every shot is a title card / unset / failed / still
// processing) — the caller surfaces that as an error instead of creating an
// empty-but-valid canvas.
export function buildCanvasDocFromFilm(
  film: Film,
  shots: Shot[],
  generationsById: Record<string, Generation>,
): CanvasExportDoc | null {
  const exportable = [...shots]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((shot) => resolveExportableShot(shot, generationsById))
    .filter((entry): entry is ExportableShot => entry !== null)

  if (exportable.length === 0) return null

  const nodes: CanvasNode[] = exportable.map(({ shot, generation }, index) => ({
    id: crypto.randomUUID(),
    kind: generation.type === 'video' ? 'video' : 'image',
    position: { x: index * NODE_X_SPACING, y: 0 },
    config: {
      prompt: shot.prompt,
      ...(shot.modelId !== null ? { modelId: shot.modelId } : {}),
      aspectRatio: shot.aspectRatio ?? film.aspectRatio,
      // duration is NOT carried over: shot.durationMs is milliseconds up to
      // 60000, canvasNodeConfigSchema.duration is INTEGER SECONDS 1-15 — a
      // blind /1000 can land out of range and fail validation server-side.
    },
    generationIds: [generation.id],
  }))

  const edges: CanvasEdge[] = []
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const source = nodes[i]
    const target = nodes[i + 1]
    if (!source || !target) continue
    edges.push({ id: crypto.randomUUID(), sourceNodeId: source.id, targetNodeId: target.id })
  }

  return {
    title: buildCanvasTitle(film.title),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges,
  }
}
