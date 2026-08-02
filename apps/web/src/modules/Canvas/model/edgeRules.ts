// apps/web/src/modules/Canvas/model/edgeRules.ts
// Pure connection law for the canvas graph (spec §3-4). Called during drag
// (isValidConnection) AND on connect — the graph can never contain an edge
// this file would refuse, so downstream code (run submission, toposort) can
// trust the shape instead of re-validating it.
import type { CanvasEdge, CanvasNodeKind } from '@opencreate/contracts'
import { MEDIA_SOURCE_KINDS } from './types'

type NodeLite = { id: string; kind: CanvasNodeKind }

// WHY a wire was refused, as a machine code. It used to be an English sentence
// ("only 1 prompt input allowed") that both call sites threw away — so the board
// refused a connection in COMPLETE SILENCE and the user concluded the feature was
// broken (owner report 2026-08-02). A code, not prose: the UI must render our
// localized copy, never an internal string (design.md §9).
export type EdgeRefusal =
  // a node cannot feed itself
  | 'self'
  // one of the two ids is not in the document (stale drag)
  | 'unknown'
  // the source kind produces nothing (a note; a video, terminal in MVP)
  | 'noOutput'
  // the target kind has no socket of that slot (a prompt into an upscale)
  | 'noInput'
  // this exact wire already exists
  | 'duplicate'
  // the slot is full (one media / one character / one prompt per node)
  | 'capacity'
  // the wire would close a loop
  | 'cycle'

type Verdict = { ok: true } | { ok: false; reason: EdgeRefusal }

const refuse = (reason: EdgeRefusal): Verdict => ({ ok: false, reason })

// The one place a code becomes copy. Total by construction (template, not a
// lookup table): a code with no branch would otherwise render the key itself,
// and the compiler cannot catch a missing row in a map keyed by a union.
export function edgeRefusalMessageKey(reason: EdgeRefusal): string {
  return `canvas.edge.refused.${reason}`
}

// Which input slots a target kind exposes, and their capacity. THREE separate
// tables because a node has three independent sockets: an image can take one
// media parent, one character AND one shared prompt at the same time.
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
// The shared-prompt slot (ADR canvas-prompt-node D4). Cap 1 and not 2+: with
// two templates the composed order would be whatever the edge array happened to
// hold, and a prompt whose word order depends on click history is not a
// promise the product can keep. Absent for upscale/remove-bg — an operation has
// no prompt to prepend to.
const PROMPT_INPUT_CAP: Partial<Record<CanvasNodeKind, number>> = {
  image: 1,
  video: 1,
}

// The three sockets, indexed so the capacity lookup and the occupancy count
// below read from ONE table. A third `slot === 'x' ? A : B` ternary is how the
// two would eventually disagree about which slot a source belongs to.
type Slot = 'media' | 'character' | 'prompt'
const CAP_BY_SLOT: Record<Slot, Partial<Record<CanvasNodeKind, number>>> = {
  media: MEDIA_INPUT_CAP,
  character: CHARACTER_INPUT_CAP,
  prompt: PROMPT_INPUT_CAP,
}

// Which socket a wire FROM this kind occupies. One definition, used by the
// verdict below and by the occupancy count — the character/media split used to
// live inline in both places, and adding a third slot is exactly when that
// duplication turns into a bug.
function slotOf(kind: CanvasNodeKind): Slot | null {
  if (kind === 'character') return 'character'
  if (kind === 'prompt') return 'prompt'
  return MEDIA_SOURCE_KINDS.includes(kind) ? 'media' : null
}

export function canConnect(
  sourceId: string,
  targetId: string,
  nodes: readonly NodeLite[],
  edges: readonly CanvasEdge[],
): Verdict {
  if (sourceId === targetId) return refuse('self')
  const source = nodes.find((n) => n.id === sourceId)
  const target = nodes.find((n) => n.id === targetId)
  if (!source || !target) return refuse('unknown')

  // Slot by SOURCE kind: characters travel the entity wire, prompt cards the
  // text wire, media kinds the media wire, everything else (note, video —
  // terminal) has no output.
  const slot = slotOf(source.kind)
  if (slot === null) return refuse('noOutput')

  const cap = CAP_BY_SLOT[slot][target.kind]
  if (cap === undefined) return refuse('noInput')

  if (edges.some((e) => e.sourceNodeId === sourceId && e.targetNodeId === targetId))
    return refuse('duplicate')

  // Capacity: count existing edges of the SAME slot into the target.
  const sameSlot = edges.filter((e) => {
    if (e.targetNodeId !== targetId) return false
    const s = nodes.find((n) => n.id === e.sourceNodeId)
    if (!s) return false
    return slotOf(s.kind) === slot
  })
  if (sameSlot.length >= cap) return refuse('capacity')

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
    if (current === sourceId) return refuse('cycle')
    if (seen.has(current)) continue
    seen.add(current)
    for (const next of out.get(current) ?? []) stack.push(next)
  }

  return { ok: true }
}
