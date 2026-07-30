// apps/api/src/modules/creator/tools.ts
// openCreator's HANDS (ADR opencreator-agent D1/D2): thin wrappers over the
// services the product already has (entities, canvas, generations, catalog),
// called in-process with the CALLER's userId. Not HTTP self-calls, not
// packages/mcp — so every ownership rule, capability check, price and refund
// path stays exactly where it already lives. Zero new money code.
//
// TWO LAWS GOVERN THIS FILE.
//
// 1. THE BUDGET GATE IS HERE, IN CODE (ADR D2). `start_generation` — the only
//    tool that can spend — refuses outright while the session's `confirmed` flag
//    is 0: no service call, no charge, and the refusal is returned to the model
//    as DATA so it can go propose a plan. The gate is not a prompt instruction,
//    because a prompt can be argued with; this cannot.
//
// 2. AN EXECUTOR NEVER THROWS. Every failure — bad input, a missing entity, no
//    credits, an exploding service — comes back as a JSON string with an `error`
//    key. A throw here would kill the whole agent turn and leave the user with a
//    dead chat instead of an agent that says "that model can't do 9:16, trying
//    another". Unexpected errors are additionally sanitized (see toolError).
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { canvasEdgeSchema, canvasNodeSchema } from '@opencreate/contracts'
import type {
  CanvasDetail,
  CanvasEdge,
  CanvasNode,
  CatalogModel,
  VideoProviderId,
} from '@opencreate/contracts'
import type { FastifyBaseLogger } from 'fastify'
import { CATALOG } from '../catalog/catalog'
import type { CanvasService } from '../canvas/service'
import type { EntityService } from '../entities/service'
import type { GenerationService } from '../generations/service'
import type { BrainToolSpec } from './brain'

export type ToolContext = {
  userId: string
  // Читается перед КАЖДЫМ платным вызовом — см. бюджет-гейт. A callback rather
  // than a boolean on purpose: a turn executes several tools, and the flag can
  // flip under it (the user confirms) or be revoked (the agent proposes a new
  // plan). A captured boolean would let a stale `true` spend after a re-plan.
  isConfirmed: () => boolean
  // The request/turn-scoped logger the services already take, so a money event
  // triggered by the agent carries the same structured fields as a user's own.
  log: FastifyBaseLogger
}

// JSON string in, JSON string out — the model reads the result verbatim.
export type ToolExecutor = (ctx: ToolContext, input: unknown) => Promise<string>
export type CreatorTool = { spec: BrainToolSpec; execute: ToolExecutor }

// NARROWED service surfaces (asset3d's precedent): the agent can create and
// read, and that is all it is handed. It structurally cannot delete a canvas,
// remove an entity or refund a generation, because those methods are not in
// scope here — least privilege stated in the type, not in a review comment.
type Deps = {
  entities: Pick<EntityService, 'create' | 'addImage'>
  canvas: Pick<CanvasService, 'createCanvas' | 'getCanvas' | 'updateCanvas'>
  generations: Pick<GenerationService, 'create' | 'get'>
  // Which video backends this deployment can reach — the same set the public
  // catalog route filters on. A model whose backend is off is worse than a
  // missing model: the agent would plan it, CHARGE for it, and get a refunded
  // failure. So it is never offered.
  configuredProviders: ReadonlySet<VideoProviderId>
}

// ── result helpers ───────────────────────────────────────────────────────────

const ok = (value: Record<string, unknown>): string => JSON.stringify(value)

// Domain errors carry messages WRITTEN for a client ('Not enough credits',
// 'entity not found: x'), and the model can act on them. Anything else may carry
// internals (paths, connection strings, provider bodies) and this channel reaches
// the model and then the user's chat card — so it collapses to a fixed string,
// exactly like app.ts's 5xx sanitization.
const SAFE_ERROR_NAMES = new Set([
  'EntityNotFoundError',
  'EntityImageInvalidError',
  'GenerationNotAttachableError',
  'CanvasNotFoundError',
  'CanvasValidationError',
])

function toolError(err: unknown): string {
  if (err instanceof Error) {
    const apiCode = (err as { apiCode?: string }).apiCode
    if (typeof apiCode === 'string' || SAFE_ERROR_NAMES.has(err.name))
      return ok({ error: err.message })
  }
  return ok({ error: 'tool failed' })
}

// Every executor runs inside this: parse with the tool's own zod schema, run,
// and turn ANY failure into data. A validation error NAMES the offending field so
// the model can fix its own call on the next step instead of guessing.
function executor<T>(schema: z.ZodType<T>, run: (ctx: ToolContext, input: T) => Promise<string>) {
  return async (ctx: ToolContext, input: unknown): Promise<string> => {
    const parsed = schema.safeParse(input)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return ok({
        error: `invalid input: ${issue ? `${issue.path.join('.')} ${issue.message}` : 'unknown'}`,
      })
    }
    try {
      return await run(ctx, parsed.data)
    } catch (err) {
      return toolError(err)
    }
  }
}

// ── tool 1: list_models ──────────────────────────────────────────────────────
// A COMPACT projection of the catalog, not the catalog DTO: the model pays for
// every token it reads, and it needs ids, prices and capabilities — not AIR
// strings or resolution profiles.
const listModelsSchema = z.object({}).loose()

type ListedModel = {
  id: string
  name: string
  type: 'image' | 'video'
  credits?: number
  creditsByDuration?: Record<string, number>
  aspectRatios: string[]
  referenceMode?: string
  supportsImageInput?: true
}

function projectModel(model: CatalogModel): ListedModel | null {
  // Phase 1 builds pictures and clips. Audio and 3D exist in the catalog but not
  // in this agent's tool set, and offering a model it cannot start is a trap.
  if (model.type !== 'image' && model.type !== 'video') return null
  return {
    id: model.id,
    name: model.name,
    type: model.type,
    ...(model.type === 'image' ? { credits: model.credits } : {}),
    ...(model.type === 'video' ? { creditsByDuration: model.creditsByDuration } : {}),
    aspectRatios: model.aspectRatios,
    ...(model.referenceMode ? { referenceMode: model.referenceMode } : {}),
    ...(model.supportsImageInput ? { supportsImageInput: true as const } : {}),
  }
}

// ── tool 3: create_entity ────────────────────────────────────────────────────
const createEntitySchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(1000),
})

// ── tool 4: attach_entity_portrait ───────────────────────────────────────────
const attachPortraitSchema = z.object({
  entityId: z.string().min(1).max(60),
  generationId: z.string().min(1).max(60),
})

// ── tool 5: create_canvas ────────────────────────────────────────────────────
const createCanvasSchema = z.object({ title: z.string().min(1).max(120) })

// ── tool 6: add_canvas_nodes ─────────────────────────────────────────────────
// Node/edge shapes are the CONTRACT schemas (one definition of a canvas node),
// with the id relaxed to a model-local label — see the id-minting note below.
const addNodesSchema = z.object({
  canvasId: z.string().min(1).max(60),
  nodes: z.array(canvasNodeSchema).min(1).max(40),
  edges: z.array(canvasEdgeSchema).max(80).optional(),
})

// ── tool 7: start_generation ─────────────────────────────────────────────────
const startGenerationSchema = z.object({
  modelId: z.string().min(1).max(80),
  prompt: z.string().min(2).max(2000),
  aspectRatio: z.enum(['16:9', '1:1', '9:16']),
  duration: z.number().int().min(1).max(15).optional(),
  // A tagged character. The mapping to entityRefs + the `[[e1]]` placeholder is
  // OURS: the model should name a character, not learn our prompt syntax.
  entityId: z.string().min(1).max(60).optional(),
  // Chain edge: condition this run on an own earlier image (i2i / i2v).
  inputGenerationId: z.string().min(1).max(60).optional(),
  // Where to record the run on the board, so the user watches it land.
  canvasNodeRef: z.object({ canvasId: z.string().max(60), nodeId: z.string().max(60) }).optional(),
})

// ── tool 8: check_generation ─────────────────────────────────────────────────
const checkGenerationSchema = z.object({ generationId: z.string().min(1).max(60) })

export function buildCreatorTools(deps: Deps): CreatorTool[] {
  // Append `generationId` to one node's history through the ordinary
  // full-document PATCH (the canvas service has no per-node write — the doc is
  // replaced whole, and that is the autosave semantic every other writer uses).
  function appendNodeGeneration(
    ctx: ToolContext,
    canvasId: string,
    nodeId: string,
    generationId: string,
  ): void {
    const detail: CanvasDetail = deps.canvas.getCanvas(ctx.userId, canvasId)
    deps.canvas.updateCanvas(ctx.userId, canvasId, {
      nodes: detail.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, generationIds: [...node.generationIds, generationId] }
          : node,
      ),
      edges: detail.edges,
    })
  }

  return [
    {
      spec: {
        name: 'list_models',
        description:
          'List the image and video models available right now, with their credit prices, aspect ratios and whether they can take a character reference. Call this before proposing a plan so the estimate uses real prices.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      execute: executor(listModelsSchema, async () => {
        const models = CATALOG.filter(
          // Same rule as the public catalog route: image models are always
          // Runware (always on); a video model with no explicit provider is a
          // Runware model.
          (model) =>
            model.type !== 'video' || deps.configuredProviders.has(model.provider ?? 'runware'),
        )
          .map(projectModel)
          .filter((model): model is ListedModel => model !== null)
        return ok({ models })
      }),
    },

    // write_scenario is DELIBERATELY ABSENT. The brain writes scenes in its own
    // head inside this turn; a tool for it would be a second LLM call to produce
    // text the same model could have written for free, and it would give the
    // scenario a provider dependency it does not need.

    {
      spec: {
        name: 'create_entity',
        description:
          'Create a reusable CHARACTER in the user library from a name and a visual description. Returns entityId, which you can pass to start_generation to keep the character consistent across shots.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Short character name, e.g. "Лис-космонавт"' },
            description: {
              type: 'string',
              description: 'Visual description: species, age, build, clothing, distinctive features',
            },
          },
          required: ['name', 'description'],
        },
      },
      execute: executor(createEntitySchema, async (ctx, input) => {
        // kind is FIXED to 'character': that is what an agent has any business
        // minting (a place/object would be unusable as a canvas character node),
        // and it keeps one decision out of the model's hands.
        const entity = await deps.entities.create(ctx.userId, {
          kind: 'character',
          name: input.name,
          description: input.description,
        })
        return ok({ entityId: entity.id })
      }),
    },

    {
      spec: {
        name: 'attach_entity_portrait',
        description:
          'Give a character its face: copy a finished image generation into the entity as its front portrait. Do this once per character, right after its first successful image, so later shots can reference it.',
        inputSchema: {
          type: 'object',
          properties: {
            entityId: { type: 'string' },
            generationId: { type: 'string', description: 'A succeeded IMAGE generation of yours' },
          },
          required: ['entityId', 'generationId'],
        },
      },
      execute: executor(attachPortraitSchema, async (ctx, input) => {
        // 'front' is the sheet's hero shot AND the view that becomes the entity's
        // primary image (entities/service.ts addImage) — which is precisely what
        // makes `[[e1]]` resolve to a reference the provider can condition on.
        // The four default-deny checks inside copyGeneratedAsset (own, succeeded,
        // image, still has its asset) are what make this safe to hand an agent.
        const entity = await deps.entities.addImage(ctx.userId, input.entityId, {
          source: 'generated',
          generationId: input.generationId,
          view: 'front',
        })
        return ok({ entityId: entity.id, primaryImageId: entity.primaryImageId })
      }),
    },

    {
      spec: {
        name: 'create_canvas',
        description:
          'Create an empty canvas (a visual board) to hold the shots of this task. Returns canvasId.',
        inputSchema: {
          type: 'object',
          properties: { title: { type: 'string' } },
          required: ['title'],
        },
      },
      execute: executor(createCanvasSchema, async (ctx, input) => {
        const canvas = deps.canvas.createCanvas(ctx.userId, { title: input.title })
        return ok({ canvasId: canvas.id })
      }),
    },

    {
      spec: {
        name: 'add_canvas_nodes',
        description:
          'Add nodes (and optional edges between them) to a canvas in ONE call. Node kinds: image, video, upload, character, upscale, remove-bg, note. Put the shot prompt and modelId in the node config. Use your own short ids to wire edges; the answer maps them to the real node ids.',
        inputSchema: {
          type: 'object',
          properties: {
            canvasId: { type: 'string' },
            nodes: {
              type: 'array',
              description: 'Each node: { id, kind, position: {x,y}, config: {prompt?, modelId?, aspectRatio?, duration?, entityId?, text?} }',
              items: { type: 'object' },
            },
            edges: {
              type: 'array',
              description:
                'Each edge: { id, sourceNodeId, targetNodeId } — ids may be your node ids or ids already on the canvas',
              items: { type: 'object' },
            },
          },
          required: ['canvasId', 'nodes'],
        },
      },
      execute: executor(addNodesSchema, async (ctx, input) => {
        // APPEND, not replace: PATCH carries the full document, so the stored
        // nodes/edges must be resent or the model's first add would wipe the board.
        const detail: CanvasDetail = deps.canvas.getCanvas(ctx.userId, input.canvasId)
        // Node ids are GLOBAL primary keys on disk (canvas_node.id), not
        // canvas-scoped — the I1 fix-wave lesson. An LLM will happily emit "n1"
        // for every canvas it ever builds, so accepting its ids verbatim would
        // eventually raise a cross-canvas UNIQUE violation: an unmapped SQLite
        // error (500) inside the agent loop. Mint real ids here and rewire the
        // edges onto them; an edge endpoint that is NOT in the map is an existing
        // node the model is connecting to, so it passes through untouched.
        const idMap = new Map<string, string>()
        const nodes: CanvasNode[] = input.nodes.map((node) => {
          const id = randomUUID()
          idMap.set(node.id, id)
          return { ...node, id }
        })
        const edges: CanvasEdge[] = (input.edges ?? []).map((edge) => ({
          id: randomUUID(),
          sourceNodeId: idMap.get(edge.sourceNodeId) ?? edge.sourceNodeId,
          targetNodeId: idMap.get(edge.targetNodeId) ?? edge.targetNodeId,
        }))
        deps.canvas.updateCanvas(ctx.userId, input.canvasId, {
          nodes: [...detail.nodes, ...nodes],
          edges: [...detail.edges, ...edges],
        })
        // Hand the real ids back keyed by the model's own labels, so the next
        // step can point start_generation at the right node.
        return ok({
          canvasId: input.canvasId,
          nodes: input.nodes.map((node) => ({ ref: node.id, nodeId: idMap.get(node.id) })),
        })
      }),
    },

    {
      spec: {
        name: 'start_generation',
        description:
          'Spend credits: submit one image or video generation. REQUIRES the user to have confirmed the plan — call propose_plan first and wait. Returns generationId; poll it with check_generation.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'An id from list_models' },
            prompt: { type: 'string', description: 'The full visual prompt for this shot' },
            aspectRatio: { type: 'string', enum: ['16:9', '1:1', '9:16'] },
            duration: { type: 'number', description: 'Video only: seconds (see creditsByDuration)' },
            entityId: {
              type: 'string',
              description: 'Optional character to keep consistent (from create_entity)',
            },
            inputGenerationId: {
              type: 'string',
              description: 'Optional: an own succeeded image to use as the input for this run',
            },
            canvasNodeRef: {
              type: 'object',
              description: 'Optional: record this run on a canvas node',
              properties: { canvasId: { type: 'string' }, nodeId: { type: 'string' } },
            },
          },
          required: ['modelId', 'prompt', 'aspectRatio'],
        },
      },
      execute: executor(startGenerationSchema, async (ctx, input) => {
        // ══ THE BUDGET GATE (ADR D2) ══════════════════════════════════════════
        // Refused BEFORE the service is touched, so an unconfirmed session cannot
        // charge a single credit no matter what the transcript says. The refusal
        // is a normal tool result: the model reads it and goes to propose_plan.
        if (!ctx.isConfirmed())
          return ok({
            error:
              'budget_not_confirmed — call propose_plan with the itemized credit cost and wait for the user to confirm before generating anything',
          })
        // `[[e1]]` is our prompt syntax, not the model's problem: give the tool a
        // character id and it becomes an entityRef plus a placeholder — exactly
        // what the canvas run path does (useNodeGeneration buildRunInput).
        const prompt =
          input.entityId && !input.prompt.includes('[[e1]]')
            ? `[[e1]] ${input.prompt}`
            : input.prompt
        const { dto } = await deps.generations.create(
          ctx.userId,
          {
            modelId: input.modelId,
            prompt,
            aspectRatio: input.aspectRatio,
            ...(input.duration !== undefined ? { duration: input.duration } : {}),
            ...(input.entityId
              ? { entityRefs: [{ placeholder: 'e1', entityId: input.entityId }] }
              : {}),
            ...(input.inputGenerationId ? { inputGenerationId: input.inputGenerationId } : {}),
          },
          ctx.log,
        )
        // The board link is BEST EFFORT, and the order matters: the charge has
        // already happened, so a canvas write that fails must not turn a paid,
        // running generation into an error — the model would retry and pay twice.
        if (input.canvasNodeRef) {
          try {
            appendNodeGeneration(ctx, input.canvasNodeRef.canvasId, input.canvasNodeRef.nodeId, dto.id)
          } catch {
            ctx.log.warn(
              { event: 'creator.canvas_link_failed', generationId: dto.id },
              'could not record the agent generation on its canvas node',
            )
          }
        }
        return ok({ generationId: dto.id, status: dto.status, costCredits: dto.costCredits })
      }),
    },

    {
      spec: {
        name: 'check_generation',
        description:
          'Check one generation you started. Returns status (processing | succeeded | failed), the media url when it is ready, and the failure reason when it is not. Poll a video every few steps rather than in a tight loop.',
        inputSchema: {
          type: 'object',
          properties: { generationId: { type: 'string' } },
          required: ['generationId'],
        },
      },
      execute: executor(checkGenerationSchema, async (ctx, input) => {
        // This IS the poll that settles a video (service.get talks to the
        // provider and can refund a failure) — the agent uses the same money path
        // the SPA does, which is why no settlement logic lives here.
        const dto = await deps.generations.get(ctx.userId, input.generationId, ctx.log)
        return ok({
          status: dto.status,
          ...(dto.mediaUrls[0] ? { mediaUrl: dto.mediaUrls[0] } : {}),
          ...(dto.errorMessage ? { errorMessage: dto.errorMessage } : {}),
        })
      }),
    },
  ]
}
