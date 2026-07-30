// A node run is an ordinary POST /api/generations built from the node's config
// plus its incoming wires. The media wire cites the parent's LATEST generation
// as inputGenerationId — the server resolves its own stored media, so no bytes
// travel. Upload parents are NOT citable in this phase (a stored file is not a
// generation). A wired CHARACTER parent travels as entityRefs, and its `[[e1]]`
// token is prepended to the prompt so the server actually substitutes the
// character's name + description where the tag sits.
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

const characterNode = (id: string, entityId?: string): CanvasNode => ({
  id,
  kind: 'character',
  position: { x: 0, y: 0 },
  config: entityId === undefined ? {} : { entityId },
  generationIds: [],
})

const wire = (sourceNodeId: string, targetNodeId: string): CanvasEdge => ({
  id: `e-${sourceNodeId}-${targetNodeId}`,
  sourceNodeId,
  targetNodeId,
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
    const statuses = { 'g-old': 'succeeded', 'g-latest': 'succeeded' } as const
    const input = buildRunInput(node, [parent, node], edges, statuses)
    // Latest SUCCEEDED history entry is the node's output
    expect(input?.inputGenerationId).toBe('g-latest')
  })

  it('returns null when the parent latest generation is still processing (no status map)', () => {
    // C2: a bare id-history lookup with NO status check let a child cite a
    // processing/failed parent. Without a status map, nothing can be assumed
    // succeeded — the chain must refuse, not guess.
    const parent = imageNode('p', ['g-latest'])
    const node: CanvasNode = {
      ...imageNode('n1'),
      config: { prompt: 'remix', modelId: 'flux-kontext-pro', aspectRatio: '1:1' },
    }
    const edges: CanvasEdge[] = [{ id: 'e1', sourceNodeId: 'p', targetNodeId: 'n1' }]
    const statuses = { 'g-latest': 'processing' } as const
    expect(buildRunInput(node, [parent, node], edges, statuses)).toBeNull()
  })

  it('skips a failed latest generation and cites an EARLIER succeeded one', () => {
    const parent = imageNode('p', ['g-succeeded', 'g-failed'])
    const node: CanvasNode = {
      ...imageNode('n1'),
      config: { prompt: 'remix', modelId: 'flux-kontext-pro', aspectRatio: '1:1' },
    }
    const edges: CanvasEdge[] = [{ id: 'e1', sourceNodeId: 'p', targetNodeId: 'n1' }]
    const statuses = { 'g-succeeded': 'succeeded', 'g-failed': 'failed' } as const
    const input = buildRunInput(node, [parent, node], edges, statuses)
    expect(input?.inputGenerationId).toBe('g-succeeded')
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

  it('disables Generate for a wired upload parent (F4): a stored file is not a citable generation yet', () => {
    // Before the F4 fix, findMediaParent excluded 'upload' entirely, so a node
    // wired to an upload fell through to a PLAIN t2i/t2v — silently ignoring a
    // wire the user could see on the board and charging for the wrong thing.
    // Upload citation is phase 4; the honest phase-2 behavior is to disable.
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
    expect(buildRunInput(node, [upload, node], edges)).toBeNull()
  })

  it('sends a wired character as entityRefs and PREPENDS its placeholder to the prompt', () => {
    // Without the token in the prompt the server substitutes nothing: the photo
    // still conditions the image, but the character's name/description never
    // reach the encoder — a paid run that half-honours the wire on the board.
    const character = characterNode('ch1', 'ent1')
    const node = imageNode('n1')
    const input = buildRunInput(node, [character, node], [wire('ch1', 'n1')])
    expect(input?.entityRefs).toEqual([{ placeholder: 'e1', entityId: 'ent1' }])
    expect(input?.prompt).toBe('[[e1]] a fox')
  })

  it('leaves the prompt untouched when the user already placed [[e1]] themselves', () => {
    const character = characterNode('ch1', 'ent1')
    const node: CanvasNode = {
      ...imageNode('n1'),
      config: { prompt: 'a portrait of [[e1]] in the snow', modelId: 'flux-kontext-pro' },
    }
    const input = buildRunInput(node, [character, node], [wire('ch1', 'n1')])
    expect(input?.prompt).toBe('a portrait of [[e1]] in the snow')
    expect(input?.entityRefs).toEqual([{ placeholder: 'e1', entityId: 'ent1' }])
  })

  it('returns null while the wired character node has no character chosen', () => {
    // Same law as an output-less media parent: the wire is visible on the board,
    // so submitting a run that silently ignores it would charge for the wrong job.
    const character = characterNode('ch1')
    const node = imageNode('n1')
    expect(buildRunInput(node, [character, node], [wire('ch1', 'n1')])).toBeNull()
  })

  it('carries BOTH wires at once: the media citation and the character ref', () => {
    const parent = imageNode('p', ['g1'])
    const character = characterNode('ch1', 'ent1')
    const node: CanvasNode = {
      ...imageNode('n1'),
      config: { prompt: 'remix', modelId: 'flux-kontext-pro' },
    }
    const edges = [wire('p', 'n1'), wire('ch1', 'n1')]
    const input = buildRunInput(node, [parent, character, node], edges, { g1: 'succeeded' })
    expect(input?.inputGenerationId).toBe('g1')
    expect(input?.entityRefs).toEqual([{ placeholder: 'e1', entityId: 'ent1' }])
  })

  it('omits entityRefs entirely when no character is wired', () => {
    const input = buildRunInput(imageNode('n1'), [imageNode('n1')], [])
    expect(input && 'entityRefs' in input).toBe(false)
  })
})
