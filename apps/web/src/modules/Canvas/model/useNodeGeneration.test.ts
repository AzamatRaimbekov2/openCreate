// A node run is an ordinary POST /api/generations built from the node's config
// plus its incoming wires. The media wire cites the parent's LATEST generation
// as inputGenerationId — the server resolves its own stored media, so no bytes
// travel. Upload parents are NOT citable in this phase (a stored file is not a
// generation); the character wire arrives with phase 3.
import { describe, expect, it } from 'vitest'
import type { CanvasEdge, CanvasNode } from '@opencreate/contracts'
import { buildRunInput } from './useNodeGeneration'

const imageNode = (id: string, generationIds: string[] = []): CanvasNode => ({
  id,
  kind: 'image',
  position: { x: 0, y: 0 },
  config: { prompt: 'a fox', modelId: 'flux-dev', aspectRatio: '1:1' },
  generationIds,
})

describe('buildRunInput', () => {
  it('builds a plain t2i input from config', () => {
    const node = imageNode('n1')
    const input = buildRunInput(node, [], [])
    expect(input).toEqual({ modelId: 'flux-dev', prompt: 'a fox', aspectRatio: '1:1' })
  })

  it('wires the parent image node output as inputGenerationId', () => {
    const parent = imageNode('p', ['g-old', 'g-latest'])
    const node: CanvasNode = {
      ...imageNode('n1'),
      config: { prompt: 'remix', modelId: 'flux-kontext-pro', aspectRatio: '1:1' },
    }
    const edges: CanvasEdge[] = [{ id: 'e1', sourceNodeId: 'p', targetNodeId: 'n1' }]
    const input = buildRunInput(node, [parent, node], edges)
    // Latest history entry is the node's output
    expect(input?.inputGenerationId).toBe('g-latest')
  })

  it('adds duration for video nodes', () => {
    const node: CanvasNode = {
      id: 'v1',
      kind: 'video',
      position: { x: 0, y: 0 },
      config: { prompt: 'walks away', modelId: 'pixverse-v6', aspectRatio: '16:9', duration: 5 },
      generationIds: [],
    }
    const input = buildRunInput(node, [node], [])
    expect(input?.duration).toBe(5)
  })

  it('returns null when required config is missing (no prompt / no model)', () => {
    const node: CanvasNode = { ...imageNode('n1'), config: { prompt: '', modelId: 'flux-dev' } }
    expect(buildRunInput(node, [node], [])).toBeNull()
  })

  it('returns null when the media parent has no succeeded output yet', () => {
    const parent = imageNode('p', [])
    const node = imageNode('n1')
    const edges: CanvasEdge[] = [{ id: 'e1', sourceNodeId: 'p', targetNodeId: 'n1' }]
    // Parent connected but never ran — the node must not submit a broken chain
    expect(buildRunInput(node, [parent, node], edges)).toBeNull()
  })

  it('ignores an upload parent: a stored file is not a citable generation', () => {
    const upload: CanvasNode = {
      id: 'u1',
      kind: 'upload',
      position: { x: 0, y: 0 },
      config: {},
      generationIds: [],
      uploadUrl: '/media/abc.webp',
    }
    const node = imageNode('n1')
    const edges: CanvasEdge[] = [{ id: 'e1', sourceNodeId: 'u1', targetNodeId: 'n1' }]
    const input = buildRunInput(node, [upload, node], edges)
    expect(input).toEqual({ modelId: 'flux-dev', prompt: 'a fox', aspectRatio: '1:1' })
  })
})
