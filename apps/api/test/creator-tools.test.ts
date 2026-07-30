// Unit tests for the openCreator tool registry (ADR opencreator-agent D1/D2).
//
// The headline assertion is THE BUDGET GATE: `start_generation` must be refused
// structurally — no service call, no charge — while the session is unconfirmed.
// Everything else here defends the second law of this file: an executor NEVER
// throws. A tool failure is DATA the model reads and reacts to; a throw would
// kill the whole agent turn and leave the user with a dead chat.
import { describe, expect, it, vi } from 'vitest'
import { buildCreatorTools } from '../src/modules/creator/tools'
import type { CreatorTool, ToolContext } from '../src/modules/creator/tools'
import type { VideoProviderId } from '@opencreate/contracts'

const CANVAS_DETAIL = {
  id: 'c1',
  title: 'Fox',
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    {
      id: 'existing-node',
      kind: 'image' as const,
      position: { x: 0, y: 0 },
      config: { prompt: 'old' },
      generationIds: ['g-old'],
    },
  ],
  edges: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// The document a full-replace PATCH carries — the shape these tests read back
// off the canvas service fake.
type CanvasPatch = {
  nodes: { id: string; generationIds: string[] }[]
  edges: { id: string; sourceNodeId: string; targetNodeId: string }[]
}

type EntityLike = { id: string; primaryImageId: string | null }
type GenerationLike = {
  id: string
  status: string
  costCredits: number
  mediaUrls: string[]
  errorMessage: string | null
}

// Signatures are declared on vi.fn so `mock.calls[n][i]` is typed (that is what
// these tests assert on) without unused parameter names.
const fakes = () => ({
  entities: {
    create: vi.fn<(userId: string, input: unknown) => Promise<EntityLike>>(async () => ({
      id: 'ent1',
      primaryImageId: null,
    })),
    addImage: vi.fn<(userId: string, entityId: string, input: unknown) => Promise<EntityLike>>(
      async () => ({ id: 'ent1', primaryImageId: 'img1' }),
    ),
  },
  canvas: {
    createCanvas: vi.fn<(userId: string, input: unknown) => { id: string; title: string }>(() => ({
      id: 'c1',
      title: 'Fox',
    })),
    getCanvas: vi.fn<(userId: string, canvasId: string) => typeof CANVAS_DETAIL>(() =>
      structuredClone(CANVAS_DETAIL),
    ),
    updateCanvas: vi.fn<
      (userId: string, canvasId: string, input: unknown) => typeof CANVAS_DETAIL
    >(() => structuredClone(CANVAS_DETAIL)),
  },
  generations: {
    create: vi.fn<
      (
        userId: string,
        input: Record<string, unknown>,
        log?: unknown,
      ) => Promise<{ dto: GenerationLike; created: boolean }>
    >(async () => ({
      dto: { id: 'gen1', status: 'processing', costCredits: 5, mediaUrls: [], errorMessage: null },
      created: false,
    })),
    get: vi.fn<(userId: string, generationId: string, log?: unknown) => Promise<GenerationLike>>(
      async () => ({
        id: 'gen1',
        status: 'succeeded',
        costCredits: 5,
        mediaUrls: ['/media/a.png'],
        errorMessage: null,
      }),
    ),
  },
})

type Fakes = ReturnType<typeof fakes>

const build = (deps: Fakes, providers: VideoProviderId[] = ['runware']) =>
  buildCreatorTools({
    entities: deps.entities as unknown as Parameters<typeof buildCreatorTools>[0]['entities'],
    canvas: deps.canvas as unknown as Parameters<typeof buildCreatorTools>[0]['canvas'],
    generations: deps.generations as unknown as Parameters<
      typeof buildCreatorTools
    >[0]['generations'],
    configuredProviders: new Set(providers),
  })

const patchOf = (deps: Fakes): CanvasPatch =>
  deps.canvas.updateCanvas.mock.calls[0]?.[2] as CanvasPatch

const pick = (tools: CreatorTool[], name: string): CreatorTool => {
  const tool = tools.find((t) => t.spec.name === name)
  if (!tool) throw new Error(`tool ${name} is not registered`)
  return tool
}

const ctx = (isConfirmed: boolean): ToolContext => ({
  userId: 'u1',
  isConfirmed: () => isConfirmed,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ToolContext['log'],
})

describe('THE BUDGET GATE (start_generation)', () => {
  it('refuses before confirm WITHOUT calling the generation service', async () => {
    // Structural, not prompt discipline: a jailbroken prompt cannot spend.
    const deps = fakes()
    const out = await pick(build(deps), 'start_generation').execute(ctx(false), {
      modelId: 'flux-dev',
      prompt: 'a fox',
      aspectRatio: '1:1',
    })
    expect(JSON.parse(out).error).toMatch(/budget_not_confirmed/)
    expect(deps.generations.create).not.toHaveBeenCalled()
  })

  it('runs the generation once the session is confirmed', async () => {
    const deps = fakes()
    const out = await pick(build(deps), 'start_generation').execute(ctx(true), {
      modelId: 'flux-dev',
      prompt: 'a fox',
      aspectRatio: '1:1',
    })
    expect(deps.generations.create).toHaveBeenCalledOnce()
    expect(JSON.parse(out)).toEqual({ generationId: 'gen1', status: 'processing', costCredits: 5 })
  })

  it('reads the flag on EVERY call, so a mid-turn confirm is honoured', async () => {
    // isConfirmed is a callback, not a captured boolean: the loop may execute
    // several tools per turn and the flag can flip under it (confirm) or be
    // revoked (a new plan).
    const deps = fakes()
    let confirmed = false
    const tool = pick(build(deps), 'start_generation')
    const context: ToolContext = { ...ctx(false), isConfirmed: () => confirmed }
    const input = { modelId: 'flux-dev', prompt: 'a fox', aspectRatio: '1:1' }
    expect(JSON.parse(await tool.execute(context, input)).error).toMatch(/budget_not_confirmed/)
    confirmed = true
    expect(JSON.parse(await tool.execute(context, input)).generationId).toBe('gen1')
    expect(deps.generations.create).toHaveBeenCalledOnce()
  })

  it('maps entityId to entityRefs and PREPENDS the placeholder to the prompt', async () => {
    const deps = fakes()
    await pick(build(deps), 'start_generation').execute(ctx(true), {
      modelId: 'flux-kontext-pro',
      prompt: 'in the snow',
      aspectRatio: '1:1',
      entityId: 'ent1',
    })
    expect(deps.generations.create.mock.calls[0]?.[1]).toMatchObject({
      prompt: '[[e1]] in the snow',
      entityRefs: [{ placeholder: 'e1', entityId: 'ent1' }],
    })
  })

  it('does not double-prepend when the model already placed [[e1]]', async () => {
    const deps = fakes()
    await pick(build(deps), 'start_generation').execute(ctx(true), {
      modelId: 'flux-kontext-pro',
      prompt: 'a portrait of [[e1]] in the snow',
      aspectRatio: '1:1',
      entityId: 'ent1',
    })
    expect(deps.generations.create.mock.calls[0]?.[1]).toMatchObject({
      prompt: 'a portrait of [[e1]] in the snow',
    })
  })

  it('appends the new generation to a canvas node history when canvasNodeRef is given', async () => {
    const deps = fakes()
    const out = await pick(build(deps), 'start_generation').execute(ctx(true), {
      modelId: 'flux-dev',
      prompt: 'a fox',
      aspectRatio: '1:1',
      canvasNodeRef: { canvasId: 'c1', nodeId: 'existing-node' },
    })
    expect(JSON.parse(out).generationId).toBe('gen1')
    const patch = patchOf(deps)
    expect(patch.nodes[0]?.generationIds).toEqual(['g-old', 'gen1'])
  })

  it('still reports the generation when the canvas write fails', async () => {
    // The money already moved: losing the board link must not turn a paid,
    // running generation into an error the model will retry (and pay for twice).
    const deps = fakes()
    deps.canvas.updateCanvas.mockImplementation(() => {
      throw new Error('canvas exploded')
    })
    const out = await pick(build(deps), 'start_generation').execute(ctx(true), {
      modelId: 'flux-dev',
      prompt: 'a fox',
      aspectRatio: '1:1',
      canvasNodeRef: { canvasId: 'c1', nodeId: 'existing-node' },
    })
    expect(JSON.parse(out).generationId).toBe('gen1')
  })

  it('returns insufficient_credits as DATA, not as a throw', async () => {
    const deps = fakes()
    deps.generations.create.mockImplementation(async () => {
      throw Object.assign(new Error('Not enough credits'), {
        statusCode: 402,
        apiCode: 'insufficient_credits',
      })
    })
    const out = await pick(build(deps), 'start_generation').execute(ctx(true), {
      modelId: 'flux-dev',
      prompt: 'a fox',
      aspectRatio: '1:1',
    })
    expect(JSON.parse(out).error).toBe('Not enough credits')
  })

  it('hides an unexpected failure behind a generic message', async () => {
    // An error with no apiCode may carry internals (paths, connection strings);
    // this channel reaches the model and then the user's chat card.
    const deps = fakes()
    deps.generations.create.mockImplementation(async () => {
      throw new Error('SQLITE_CANTOPEN: /Users/secret/data/app.db')
    })
    const out = await pick(build(deps), 'start_generation').execute(ctx(true), {
      modelId: 'flux-dev',
      prompt: 'a fox',
      aspectRatio: '1:1',
    })
    expect(JSON.parse(out).error).toBe('tool failed')
    expect(out).not.toMatch(/secret/)
  })

  it('rejects a malformed input as data (no throw, no service call)', async () => {
    const deps = fakes()
    const out = await pick(build(deps), 'start_generation').execute(ctx(true), { prompt: 'a fox' })
    expect(JSON.parse(out).error).toBeTruthy()
    expect(deps.generations.create).not.toHaveBeenCalled()
  })
})

describe('free structural tools', () => {
  it('create_entity makes a character and answers with its id', async () => {
    const deps = fakes()
    const out = await pick(build(deps), 'create_entity').execute(ctx(false), {
      name: 'Лис',
      description: 'космонавт',
    })
    // kind is FIXED: the agent builds characters, and a soul-less 'other' would
    // be unusable as a canvas character node.
    expect(deps.entities.create.mock.calls[0]?.[1]).toEqual({
      kind: 'character',
      name: 'Лис',
      description: 'космонавт',
    })
    expect(JSON.parse(out)).toEqual({ entityId: 'ent1' })
  })

  it('attach_entity_portrait copies a generation in as the FRONT view', async () => {
    const deps = fakes()
    const out = await pick(build(deps), 'attach_entity_portrait').execute(ctx(false), {
      entityId: 'ent1',
      generationId: 'gen1',
    })
    expect(deps.entities.addImage.mock.calls[0]?.[2]).toEqual({
      source: 'generated',
      generationId: 'gen1',
      view: 'front',
    })
    expect(JSON.parse(out)).toEqual({ entityId: 'ent1', primaryImageId: 'img1' })
  })

  it('create_canvas answers with the canvas id', async () => {
    const deps = fakes()
    const out = await pick(build(deps), 'create_canvas').execute(ctx(false), { title: 'Fox' })
    expect(JSON.parse(out)).toEqual({ canvasId: 'c1' })
  })

  it('create_entity surfaces a not-found style domain error as data', async () => {
    const deps = fakes()
    deps.entities.addImage.mockImplementation(async () => {
      throw Object.assign(new Error('generation cannot be attached: gen9'), {
        name: 'GenerationNotAttachableError',
      })
    })
    const out = await pick(build(deps), 'attach_entity_portrait').execute(ctx(false), {
      entityId: 'ent1',
      generationId: 'gen9',
    })
    expect(JSON.parse(out).error).toBe('generation cannot be attached: gen9')
  })
})

describe('add_canvas_nodes', () => {
  it('APPENDS to the stored document and mints server-side node ids', async () => {
    // Node ids are GLOBAL primary keys on disk. An LLM will happily emit "n1"
    // for every canvas it ever builds, so accepting its ids verbatim would hit a
    // cross-canvas UNIQUE violation — a 500 inside the loop. Ids are minted here
    // and the edges are rewired onto them.
    const deps = fakes()
    const out = await pick(build(deps), 'add_canvas_nodes').execute(ctx(false), {
      canvasId: 'c1',
      nodes: [
        { id: 'n1', kind: 'image', position: { x: 10, y: 0 }, config: { prompt: 'scene 1' } },
        { id: 'n2', kind: 'video', position: { x: 300, y: 0 }, config: { prompt: 'scene 2' } },
      ],
      edges: [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' }],
    })
    const patch = patchOf(deps)
    // Existing node survives (full-document PATCH means we must resend it).
    expect(patch.nodes).toHaveLength(3)
    expect(patch.nodes[0]?.id).toBe('existing-node')
    const first = patch.nodes[1]!
    const second = patch.nodes[2]!
    expect(first.id).not.toBe('n1')
    expect(second.id).not.toBe('n2')
    expect(patch.edges).toHaveLength(1)
    expect(patch.edges[0]?.sourceNodeId).toBe(first.id)
    expect(patch.edges[0]?.targetNodeId).toBe(second.id)
    // The model needs the real ids back to wire later runs to the right node.
    const answer = JSON.parse(out)
    expect(answer.canvasId).toBe('c1')
    expect(answer.nodes).toEqual([
      { ref: 'n1', nodeId: first.id },
      { ref: 'n2', nodeId: second.id },
    ])
  })

  it('lets an edge point at a node that is ALREADY on the canvas', async () => {
    const deps = fakes()
    await pick(build(deps), 'add_canvas_nodes').execute(ctx(false), {
      canvasId: 'c1',
      nodes: [{ id: 'n1', kind: 'video', position: { x: 0, y: 0 }, config: {} }],
      edges: [{ id: 'e1', sourceNodeId: 'existing-node', targetNodeId: 'n1' }],
    })
    const patch = patchOf(deps)
    expect(patch.edges[0]?.sourceNodeId).toBe('existing-node')
  })

  it('returns the canvas service validation error as data', async () => {
    const deps = fakes()
    deps.canvas.updateCanvas.mockImplementation(() => {
      throw Object.assign(new Error('the graph contains a cycle'), {
        name: 'CanvasValidationError',
      })
    })
    const out = await pick(build(deps), 'add_canvas_nodes').execute(ctx(false), {
      canvasId: 'c1',
      nodes: [{ id: 'n1', kind: 'image', position: { x: 0, y: 0 }, config: {} }],
    })
    expect(JSON.parse(out).error).toBe('the graph contains a cycle')
  })
})

describe('read-only tools', () => {
  it('list_models offers image + video models and hides unconfigured backends', async () => {
    const deps = fakes()
    const out = await pick(build(deps, ['runware']), 'list_models').execute(ctx(false), {})
    const { models } = JSON.parse(out) as { models: { id: string; type: string }[] }
    expect(models.length).toBeGreaterThan(0)
    // A model whose backend is off is worse than a missing one: the agent would
    // plan it, charge for it and get a refunded failure (catalog route precedent).
    expect(models.some((m) => m.id === 'wan-2-2')).toBe(false)
    expect(models.every((m) => m.type === 'image' || m.type === 'video')).toBe(true)
    // No audio/model3d rows: this agent builds images and videos (phase 1 scope).
    expect(models.some((m) => m.type === 'audio' || m.type === 'model3d')).toBe(false)
  })

  it('list_models includes a self-hosted model once its backend is configured', async () => {
    const deps = fakes()
    const out = await pick(build(deps, ['runware', 'wan-runpod']), 'list_models').execute(
      ctx(false),
      {},
    )
    const { models } = JSON.parse(out) as { models: { id: string }[] }
    expect(models.some((m) => m.id === 'wan-2-2')).toBe(true)
  })

  it('check_generation reports status, media and failure reason', async () => {
    const deps = fakes()
    const out = await pick(build(deps), 'check_generation').execute(ctx(false), {
      generationId: 'gen1',
    })
    expect(JSON.parse(out)).toEqual({ status: 'succeeded', mediaUrl: '/media/a.png' })

    deps.generations.get.mockImplementation(async () => ({
      id: 'gen1',
      status: 'failed',
      costCredits: 5,
      mediaUrls: [],
      errorMessage: 'content_blocked',
    }))
    const failed = await pick(build(deps), 'check_generation').execute(ctx(false), {
      generationId: 'gen1',
    })
    expect(JSON.parse(failed)).toEqual({ status: 'failed', errorMessage: 'content_blocked' })
  })
})

describe('the registry itself', () => {
  it('exposes exactly the phase-1 tool set, each with an object JSON Schema', () => {
    const tools = build(fakes())
    expect(tools.map((t) => t.spec.name).sort()).toEqual([
      'add_canvas_nodes',
      'attach_entity_portrait',
      'check_generation',
      'create_canvas',
      'create_entity',
      'list_models',
      'start_generation',
    ].sort())
    for (const tool of tools) {
      expect(tool.spec.inputSchema.type).toBe('object')
      expect(tool.spec.description.length).toBeGreaterThan(10)
    }
  })

  it('has no write_scenario tool — the brain writes scenes in its head', () => {
    // A tool for that would be a SECOND LLM call to produce text the same model
    // could have written in this turn (plan self-review note).
    expect(build(fakes()).some((t) => t.spec.name === 'write_scenario')).toBe(false)
  })
})
