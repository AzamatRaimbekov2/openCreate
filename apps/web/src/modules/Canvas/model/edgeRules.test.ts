// Every illegal connection the spec names, plus cycles. Pure function — no DOM.
import { describe, expect, it } from 'vitest'
import type { CanvasEdge } from '@opencreate/contracts'
import { canConnect } from './edgeRules'

const nodes = [
  { id: 'img1', kind: 'image' as const },
  { id: 'img2', kind: 'image' as const },
  { id: 'vid', kind: 'video' as const },
  { id: 'up', kind: 'upload' as const },
  { id: 'char', kind: 'character' as const },
  { id: 'scale', kind: 'upscale' as const },
  { id: 'note', kind: 'note' as const },
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
  it('refuses a second character on the same target', () => {
    const existing = [edge('e1', 'char', 'img1')]
    expect(canConnect('char', 'img1', nodes, existing).ok).toBe(false)
  })
  it('refuses self-connection and duplicates', () => {
    expect(canConnect('img1', 'img1', nodes, []).ok).toBe(false)
    const existing = [edge('e1', 'img1', 'img2')]
    expect(canConnect('img1', 'img2', nodes, existing).ok).toBe(false)
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
