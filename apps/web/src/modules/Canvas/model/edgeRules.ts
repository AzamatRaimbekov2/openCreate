// apps/web/src/modules/Canvas/model/edgeRules.ts
// Pure connection law for the canvas graph (spec §3-4). Called during drag
// (isValidConnection) AND on connect — the graph can never contain an edge
// this file would refuse, so downstream code (run submission, toposort) can
// trust the shape instead of re-validating it.
import type { CanvasEdge, CanvasNodeKind } from '@opencreate/contracts'
import { MEDIA_SOURCE_KINDS } from './types'

type NodeLite = { id: string; kind: CanvasNodeKind }
type Verdict = { ok: true } | { ok: false; reason: string }

const refuse = (reason: string): Verdict => ({ ok: false, reason })

// Which input slots a target kind exposes, and their capacity. Two separate
// tables because a node has TWO independent sockets: an image can take one
// media parent AND one character at the same time.
const MEDIA_INPUT_CAP: Partial<Record<CanvasNodeKind, number>> = {
  image: 1,
  video: 1,
  upscale: 1,
  'remove-bg': 1,
}
const CHARACTER_INPUT_CAP: Partial<Record<CanvasNodeKind, number>> = {
  image: 1,
  video: 1,
}

export function canConnect(
  sourceId: string,
  targetId: string,
  nodes: readonly NodeLite[],
  edges: readonly CanvasEdge[],
): Verdict {
  if (sourceId === targetId) return refuse('a node cannot feed itself')
  const source = nodes.find((n) => n.id === sourceId)
  const target = nodes.find((n) => n.id === targetId)
  if (!source || !target) return refuse('unknown node')

  // Slot by SOURCE kind: characters travel the entity wire, media kinds the
  // media wire, everything else (note, video — terminal) has no output.
  const slot: 'media' | 'character' | null =
    source.kind === 'character'
      ? 'character'
      : MEDIA_SOURCE_KINDS.includes(source.kind)
        ? 'media'
        : null
  if (slot === null) return refuse(`${source.kind} has no output`)

  const cap = (slot === 'media' ? MEDIA_INPUT_CAP : CHARACTER_INPUT_CAP)[target.kind]
  if (cap === undefined) return refuse(`${target.kind} does not take a ${slot} input`)

  if (edges.some((e) => e.sourceNodeId === sourceId && e.targetNodeId === targetId))
    return refuse('already connected')

  // Capacity: count existing edges of the SAME slot into the target.
  const sameSlot = edges.filter((e) => {
    if (e.targetNodeId !== targetId) return false
    const s = nodes.find((n) => n.id === e.sourceNodeId)
    if (!s) return false
    const eSlot = s.kind === 'character' ? 'character' : 'media'
    return eSlot === slot
  })
  if (sameSlot.length >= cap) return refuse(`only ${cap} ${slot} input allowed`)

  // Cycle check: if target already reaches source, this edge closes a loop.
  const out = new Map<string, string[]>()
  for (const e of edges) {
    const list = out.get(e.sourceNodeId) ?? []
    list.push(e.targetNodeId)
    out.set(e.sourceNodeId, list)
  }
  const seen = new Set<string>()
  const stack = [targetId]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined) break
    if (current === sourceId) return refuse('this connection would create a cycle')
    if (seen.has(current)) continue
    seen.add(current)
    for (const next of out.get(current) ?? []) stack.push(next)
  }

  return { ok: true }
}
