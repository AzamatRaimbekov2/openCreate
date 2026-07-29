// Contract tests for Canvas Mode wire schemas: pin the node-kind union, the
// full-document update shape, and the bounds that keep a hostile PATCH from
// storing megabytes of junk in config/title.
import { describe, expect, it } from 'vitest'
import {
  canvasDetailSchema,
  canvasNodeSchema,
  createCanvasInputSchema,
  updateCanvasInputSchema,
} from './canvas'

const NODE = {
  id: 'n1',
  kind: 'image' as const,
  position: { x: 100, y: -40 },
  config: { prompt: 'a fox', modelId: 'flux-dev', aspectRatio: '1:1' as const },
  generationIds: ['g1', 'g2'],
}

describe('canvasNodeSchema', () => {
  it('accepts an image node with config and history', () => {
    expect(canvasNodeSchema.safeParse(NODE).success).toBe(true)
  })
  it('accepts every MVP kind', () => {
    for (const kind of ['image', 'video', 'upload', 'character', 'upscale', 'remove-bg', 'note']) {
      expect(canvasNodeSchema.safeParse({ ...NODE, kind, config: {} }).success).toBe(true)
    }
  })
  it('rejects an unknown kind', () => {
    expect(canvasNodeSchema.safeParse({ ...NODE, kind: 'shader' }).success).toBe(false)
  })
  it('rejects a config that is not an object', () => {
    expect(canvasNodeSchema.safeParse({ ...NODE, config: 'huge string' }).success).toBe(false)
  })
})

describe('createCanvasInputSchema', () => {
  it('accepts a bare title', () => {
    expect(createCanvasInputSchema.safeParse({ title: 'My canvas' }).success).toBe(true)
  })
  it('rejects an empty title', () => {
    expect(createCanvasInputSchema.safeParse({ title: '' }).success).toBe(false)
  })
})

describe('updateCanvasInputSchema (full-document PATCH)', () => {
  const DOC = {
    title: 'Fox chain',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [NODE],
    edges: [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' }],
  }
  it('accepts a full document', () => {
    expect(updateCanvasInputSchema.safeParse(DOC).success).toBe(true)
  })
  it('accepts partial (title-only rename)', () => {
    expect(updateCanvasInputSchema.safeParse({ title: 'Renamed' }).success).toBe(true)
  })
  it('caps nodes at 200 (autosave carries the whole doc — bound it)', () => {
    const nodes = Array.from({ length: 201 }, (_, i) => ({ ...NODE, id: `n${i}` }))
    expect(updateCanvasInputSchema.safeParse({ ...DOC, nodes }).success).toBe(false)
  })
})

describe('canvasDetailSchema', () => {
  it('parses the GET /api/canvases/:id shape', () => {
    const detail = {
      id: 'c1',
      title: 'Fox chain',
      viewport: { x: 10, y: 20, zoom: 0.8 },
      nodes: [NODE],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    expect(canvasDetailSchema.safeParse(detail).success).toBe(true)
  })
})
