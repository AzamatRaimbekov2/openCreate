// Every illegal connection the spec names, plus cycles. Pure function — no DOM.
import { describe, expect, it } from 'vitest'
import type { CanvasEdge } from '@opencreate/contracts'
import { canConnect, edgeRefusalMessageKey } from './edgeRules'

const nodes = [
  { id: 'img1', kind: 'image' as const },
  { id: 'img2', kind: 'image' as const },
  { id: 'vid', kind: 'video' as const },
  { id: 'up', kind: 'upload' as const },
  { id: 'char', kind: 'character' as const },
  { id: 'scale', kind: 'upscale' as const },
  { id: 'note', kind: 'note' as const },
  { id: 'tpl', kind: 'prompt' as const },
  { id: 'tpl2', kind: 'prompt' as const },
]
const edge = (id: string, s: string, t: string): CanvasEdge => ({
  id,
  sourceNodeId: s,
  targetNodeId: t,
})

describe('canConnect', () => {
  it('allows image → image (remix), image → video, upload → image, image → upscale', () => {
    for (const [s, t] of [
      ['img1', 'img2'],
      ['img1', 'vid'],
      ['up', 'img1'],
      ['img1', 'scale'],
    ] as const) {
      expect(canConnect(s, t, nodes, []).ok, `${s}→${t}`).toBe(true)
    }
  })
  it('allows character → image and character → video', () => {
    expect(canConnect('char', 'img1', nodes, []).ok).toBe(true)
    expect(canConnect('char', 'vid', nodes, []).ok).toBe(true)
  })
  it('refuses video as a source (terminal in MVP)', () => {
    expect(canConnect('vid', 'img1', nodes, []).ok).toBe(false)
  })
  it('refuses note in any role and character as a target', () => {
    expect(canConnect('note', 'img1', nodes, []).ok).toBe(false)
    expect(canConnect('img1', 'note', nodes, []).ok).toBe(false)
    expect(canConnect('img1', 'char', nodes, []).ok).toBe(false)
  })
  it('refuses character → upscale (operations take media only)', () => {
    expect(canConnect('char', 'scale', nodes, []).ok).toBe(false)
  })
  it('refuses a second media input on the same target', () => {
    const existing = [edge('e1', 'up', 'img1')]
    expect(canConnect('img2', 'img1', nodes, existing).ok).toBe(false)
  })
  it('allows media + character on the same target (separate slots)', () => {
    const existing = [edge('e1', 'up', 'img1')]
    expect(canConnect('char', 'img1', nodes, existing).ok).toBe(true)
  })
  // The prompt slot (ADR canvas-prompt-node D4) — a THIRD independent socket
  // beside media and character.
  it('allows prompt → image and prompt → video', () => {
    expect(canConnect('tpl', 'img1', nodes, []).ok).toBe(true)
    expect(canConnect('tpl', 'vid', nodes, []).ok).toBe(true)
  })
  it('allows a prompt beside media AND character on the same target', () => {
    const existing = [edge('e1', 'up', 'img1'), edge('e2', 'char', 'img1')]
    expect(canConnect('tpl', 'img1', nodes, existing).ok).toBe(true)
  })
  it('refuses a second prompt on the same target (no merge order to express)', () => {
    const existing = [edge('e1', 'tpl', 'img1')]
    expect(canConnect('tpl2', 'img1', nodes, existing).ok).toBe(false)
  })
  it('refuses a prompt as a TARGET — the card takes no input', () => {
    expect(canConnect('img1', 'tpl', nodes, []).ok).toBe(false)
    expect(canConnect('tpl2', 'tpl', nodes, []).ok).toBe(false)
  })
  it('refuses prompt → upscale (operations take media only, they have no prompt)', () => {
    expect(canConnect('tpl', 'scale', nodes, []).ok).toBe(false)
  })
  it('refuses a second character on the same target', () => {
    const existing = [edge('e1', 'char', 'img1')]
    expect(canConnect('char', 'img1', nodes, existing).ok).toBe(false)
  })
  it('refuses self-connection and duplicates', () => {
    expect(canConnect('img1', 'img1', nodes, []).ok).toBe(false)
    const existing = [edge('e1', 'img1', 'img2')]
    expect(canConnect('img1', 'img2', nodes, existing).ok).toBe(false)
  })
  // A refused wire used to fail SILENTLY: the board simply did not snap, and the
  // reason canConnect had already computed was thrown away by both call sites
  // (owner report 2026-08-02, "привязка промт узлов чета не работает" — it was a
  // second prompt into a node that already had one, refused without a word).
  // The reason is now a machine CODE the editor localizes — never a raw string
  // rendered to a user (design.md §9).
  it('names WHY it refused, as a code the UI can localize', () => {
    const cases: [string, string, string][] = [
      ['img1', 'img1', 'self'],
      ['vid', 'img1', 'noOutput'],
      ['img1', 'note', 'noInput'],
      ['tpl', 'scale', 'noInput'],
    ]
    for (const [source, target, reason] of cases) {
      const verdict = canConnect(source, target, nodes, [])
      expect(verdict.ok, `${source}→${target}`).toBe(false)
      if (!verdict.ok) expect(verdict.reason, `${source}→${target}`).toBe(reason)
    }
  })

  it('names the capacity, duplicate and cycle refusals too', () => {
    const existing = [edge('e1', 'tpl', 'img1'), edge('e2', 'img2', 'img1')]
    const capacity = canConnect('tpl2', 'img1', nodes, existing)
    expect(capacity.ok === false && capacity.reason).toBe('capacity')
    const duplicate = canConnect('img2', 'img1', nodes, existing)
    expect(duplicate.ok === false && duplicate.reason).toBe('duplicate')
    const cycle = canConnect('img1', 'img2', nodes, [edge('e1', 'img2', 'img1')])
    expect(cycle.ok === false && cycle.reason).toBe('cycle')
  })

  it('maps every code to an i18n key — never a raw reason string', () => {
    // The map must be TOTAL: a code with no key would render the key itself.
    for (const code of ['self', 'unknown', 'noOutput', 'noInput', 'duplicate', 'capacity', 'cycle'] as const) {
      expect(edgeRefusalMessageKey(code)).toBe(`canvas.edge.refused.${code}`)
    }
  })

  it('refuses a cycle (img1 → img2 → img1)', () => {
    const existing = [edge('e1', 'img1', 'img2')]
    expect(canConnect('img2', 'img1', nodes, existing).ok).toBe(false)
  })
  it('refuses a transitive cycle (a→b, b→c, then c→a)', () => {
    const existing = [edge('e1', 'img1', 'img2'), edge('e2', 'img2', 'scale')]
    expect(canConnect('scale', 'img1', nodes, existing).ok).toBe(false)
  })
})
