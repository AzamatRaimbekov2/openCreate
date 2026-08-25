// The openCreate tool table — SIXTEEN tools, each fronting a family of endpoints
// through an `action` (ADR mcp-server §P2.5). Every action reuses the SHARED
// @opencreate/contracts zod schema for its body, so a tool's input can never
// drift from what the API validates.
//
// Coverage mirrors the real routes (apps/api/src/modules/*/routes.ts) with two
// deliberate omissions:
//
//   · /api/admin/analytics/* — reads every user's spend and our provider
//     invoices. The role check would still hold; this is a second lock on the
//     same door, chosen because the door opens onto other people's data (§P2.6).
//   · /api/creator/* — openCreator is our own in-app agent chat. Claude calling
//     it would be an agent driving a second agent to reach the same endpoints
//     this table already exposes directly: a longer path to the same place, with
//     an extra model's judgement in between. If it is ever wanted it belongs
//     behind ONE tool, not five.
//   · /api/share/:token — the public read side of a share link. A client that
//     has a token can open the URL; there is nothing for a tool to add.
//   · capabilities the API exposes no endpoint for (entity portraits).
import {
  addFilmAudioInputSchema,
  addShotReferenceInputSchema,
  addStyleReferenceInputSchema,
  createAsset3dInputSchema,
  createAsset3dPartInputSchema,
  createCanvasInputSchema,
  createEntityInputSchema,
  createFilmFromTemplateInputSchema,
  createFilmInputSchema,
  createFilmsFromTemplateBatchInputSchema,
  createGenerationInputSchema,
  createModelRenderInputSchema,
  createShotInputSchema,
  createStoryboardInputSchema,
  createStyleInputSchema,
  generateShotClipInputSchema,
  promptEnhanceInputSchema,
  reorderShotsInputSchema,
  updateAsset3dInputSchema,
  updateAsset3dPartInputSchema,
  updateCanvasInputSchema,
  updateEntityInputSchema,
  updateFilmInputSchema,
  updateShotInputSchema,
  updateStyleInputSchema,
} from '@opencreate/contracts'
import type { ToolDef } from './registry'

// Generations/clips finish fast-ish; renders (ffmpeg / 3D) take longer.
const GEN_POLL = { timeoutMs: 120_000, intervalMs: 3_000 } as const
const RENDER_POLL = { timeoutMs: 300_000, intervalMs: 4_000 } as const

export const tools: ToolDef[] = [
  // ── Account ────────────────────────────────────────────────────────────────
  {
    name: 'account',
    title: 'Account, balance and spend',
    description:
      'The signed-in account: profile, credit balance, and what credits went to. Read this before a batch — every generation spends real credits.',
    actions: {
      me: { summary: 'Profile and current credit balance.', method: 'GET', path: () => '/api/me' },
      usage: {
        summary: 'Personal spend over a window: credits, success rate, breakdown by type and day.',
        method: 'GET',
        query: ['days'],
        path: () => '/api/me/usage',
      },
      transactions: {
        summary: 'The raw credit ledger — charges, refunds, signup bonus.',
        method: 'GET',
        path: () => '/api/credits/transactions',
      },
    },
  },

  // ── Catalog ────────────────────────────────────────────────────────────────
  {
    name: 'list_models',
    title: 'List models and prices',
    description:
      'Every available generation model (image / video / audio / 3D) with its credit price. Call this before create_generation — the modelId is what picks the media type, and the price is what the user is about to spend.',
    actions: {
      list: { summary: 'The full catalog with prices.', method: 'GET', path: () => '/api/catalog' },
    },
  },

  // ── Generations (the money path — its own tool, deliberately) ───────────────
  {
    name: 'create_generation',
    title: 'Generate image / video / audio / 3D',
    description:
      'Create a generation. THIS SPENDS CREDITS. modelId (from list_models) picks the media type. Images finish synchronously; video/audio/3D run async — with wait (default true) the tool polls to completion and returns the finished asset URL.',
    actions: {
      create: {
        summary: 'Submit one generation and (by default) wait for it.',
        method: 'POST',
        body: createGenerationInputSchema,
        path: () => '/api/generations',
        poll: { path: (r) => `/api/generations/${r.id}`, ...GEN_POLL },
      },
    },
  },
  {
    name: 'generations',
    title: 'Browse generations',
    description: 'The gallery: list, fetch and delete past generations. Fetching is also the manual poll for an async job.',
    actions: {
      list: {
        summary: 'List newest first. Optional limit (max 50) and cursor.',
        method: 'GET',
        query: ['limit', 'cursor'],
        path: () => '/api/generations',
      },
      get: {
        summary: 'One generation by id — also the manual poll for a running job.',
        method: 'GET',
        pathParams: ['generationId'],
        path: (a) => `/api/generations/${a.generationId}`,
      },
      delete: {
        summary: 'Remove a generation from the gallery.',
        method: 'DELETE',
        pathParams: ['generationId'],
        path: (a) => `/api/generations/${a.generationId}`,
      },
    },
  },

  // ── Films ──────────────────────────────────────────────────────────────────
  {
    name: 'films',
    title: 'Film projects',
    description:
      'Film projects — the multi-shot format. Creating and editing a film is FREE; only generating clips and rendering spend anything. Audio tracks live here too, because a track belongs to a film.',
    actions: {
      list: { summary: 'The user\'s film projects.', method: 'GET', path: () => '/api/films' },
      get: {
        summary: 'One film with its shots, audio tracks and renders.',
        method: 'GET',
        pathParams: ['filmId'],
        path: (a) => `/api/films/${a.filmId}`,
      },
      create: {
        summary: 'Create an empty film (title + settings).',
        method: 'POST',
        body: createFilmInputSchema,
        path: () => '/api/films',
      },
      update: {
        summary: 'Change a film\'s title or settings.',
        method: 'PATCH',
        pathParams: ['filmId'],
        body: updateFilmInputSchema,
        path: (a) => `/api/films/${a.filmId}`,
      },
      delete: {
        summary: 'Delete a film and its shots.',
        method: 'DELETE',
        pathParams: ['filmId'],
        path: (a) => `/api/films/${a.filmId}`,
      },
      add_audio: {
        summary: 'Attach an audio track to a film.',
        method: 'POST',
        pathParams: ['filmId'],
        body: addFilmAudioInputSchema,
        path: (a) => `/api/films/${a.filmId}/audio`,
      },
      delete_audio: {
        summary: 'Remove an audio track (needs audioId).',
        method: 'DELETE',
        pathParams: ['filmId', 'audioId'],
        path: (a) => `/api/films/${a.filmId}/audio/${a.audioId}`,
      },
    },
  },

  // ── Shots ──────────────────────────────────────────────────────────────────
  {
    name: 'shots',
    title: 'Film shots',
    description:
      'The shots inside a film: add, edit, reorder, and attach reference images. All free — a shot is a prompt plus settings until you generate its clip.',
    actions: {
      add: {
        summary: 'Add a shot (prompt + camera/motion settings).',
        method: 'POST',
        pathParams: ['filmId'],
        body: createShotInputSchema,
        path: (a) => `/api/films/${a.filmId}/shots`,
      },
      update: {
        summary: 'Change a shot\'s prompt or settings (needs shotId).',
        method: 'PATCH',
        pathParams: ['filmId', 'shotId'],
        body: updateShotInputSchema,
        path: (a) => `/api/films/${a.filmId}/shots/${a.shotId}`,
      },
      delete: {
        summary: 'Delete a shot (needs shotId).',
        method: 'DELETE',
        pathParams: ['filmId', 'shotId'],
        path: (a) => `/api/films/${a.filmId}/shots/${a.shotId}`,
      },
      reorder: {
        summary: 'Reorder by passing the FULL ordered list of shot ids.',
        method: 'POST',
        pathParams: ['filmId'],
        body: reorderShotsInputSchema,
        path: (a) => `/api/films/${a.filmId}/shots/reorder`,
      },
      add_reference: {
        summary: 'Attach a reference image to a shot (needs shotId).',
        method: 'POST',
        pathParams: ['filmId', 'shotId'],
        body: addShotReferenceInputSchema,
        path: (a) => `/api/films/${a.filmId}/shots/${a.shotId}/references`,
      },
      remove_reference: {
        summary: 'Detach a reference (needs shotId, refId).',
        method: 'DELETE',
        pathParams: ['filmId', 'shotId', 'refId'],
        path: (a) => `/api/films/${a.filmId}/shots/${a.shotId}/references/${a.refId}`,
      },
    },
  },

  // ── The two film money paths, each its own tool ────────────────────────────
  {
    name: 'generate_storyboard',
    title: 'Draft shots from a script',
    description:
      'Turn a script or brief into DRAFT shots via Claude. Nothing is generated and nothing is charged until you call generate_shot_clip on a shot.',
    actions: {
      create: {
        summary: 'Draft shots into a film from a brief.',
        method: 'POST',
        pathParams: ['filmId'],
        body: createStoryboardInputSchema,
        path: (a) => `/api/films/${a.filmId}/storyboard`,
      },
    },
  },
  {
    name: 'generate_shot_clip',
    title: 'Generate one shot\'s clip',
    description:
      'Render one shot into a video clip. THIS SPENDS CREDITS, per shot. With wait (default true) it polls to completion.',
    actions: {
      create: {
        summary: 'Generate the clip for one shot (needs shotId).',
        method: 'POST',
        pathParams: ['filmId', 'shotId'],
        body: generateShotClipInputSchema,
        path: (a) => `/api/films/${a.filmId}/shots/${a.shotId}/clip`,
        poll: { path: (r) => `/api/generations/${r.id}`, ...GEN_POLL },
      },
    },
  },
  {
    name: 'render_film',
    title: 'Render a film to one video',
    description:
      'Stitch a film\'s generated clips and audio into a single video. Spends no provider credits — it is our own compute — but needs every shot to have a clip already.',
    actions: {
      start: {
        summary: 'Start a render and (by default) wait for it.',
        method: 'POST',
        pathParams: ['filmId'],
        path: (a) => `/api/films/${a.filmId}/renders`,
        poll: { path: (r, a) => `/api/films/${a.filmId as string}/renders/${r.id}`, ...RENDER_POLL },
      },
      get: {
        summary: 'Check a render\'s status (needs renderId).',
        method: 'GET',
        pathParams: ['filmId', 'renderId'],
        path: (a) => `/api/films/${a.filmId}/renders/${a.renderId}`,
      },
    },
  },

  // ── Templates, including the Shorts batch ──────────────────────────────────
  {
    name: 'templates',
    title: 'Templates and batch creation',
    description:
      'Pre-authored formats (including the vertical `shorts` shelf) that instantiate into films. Applying a template charges NOTHING — the films arrive as drafts and you generate clips afterwards. `create_batch` is the Shorts Studio surface: one template, up to 20 rows of knob values, N films under one batch id, in one transaction.',
    actions: {
      list: {
        summary: 'The template gallery, with each template\'s knobs and per-clip price.',
        method: 'GET',
        path: () => '/api/templates',
      },
      create_film: {
        summary: 'Instantiate ONE film from a template.',
        method: 'POST',
        body: createFilmFromTemplateInputSchema,
        path: () => '/api/films/from-template',
      },
      create_batch: {
        summary: 'Instantiate N films from one template (max 20 rows) under one batch id.',
        method: 'POST',
        body: createFilmsFromTemplateBatchInputSchema,
        path: () => '/api/films/from-template/batch',
      },
    },
  },

  // ── Entities ───────────────────────────────────────────────────────────────
  {
    name: 'entities',
    title: 'Entity library',
    description:
      'Reusable characters, objects and places that can be tagged in prompts so they stay consistent across generations.',
    actions: {
      list: { summary: 'All entities.', method: 'GET', path: () => '/api/entities' },
      get: {
        summary: 'One entity by id.',
        method: 'GET',
        pathParams: ['entityId'],
        path: (a) => `/api/entities/${a.entityId}`,
      },
      create: {
        summary: 'Create an entity.',
        method: 'POST',
        body: createEntityInputSchema,
        path: () => '/api/entities',
      },
      update: {
        summary: 'Update an entity.',
        method: 'PATCH',
        pathParams: ['entityId'],
        body: updateEntityInputSchema,
        path: (a) => `/api/entities/${a.entityId}`,
      },
      delete: {
        summary: 'Delete an entity.',
        method: 'DELETE',
        pathParams: ['entityId'],
        path: (a) => `/api/entities/${a.entityId}`,
      },
    },
  },

  // ── Styles ─────────────────────────────────────────────────────────────────
  {
    name: 'styles',
    title: 'Style library',
    description:
      'User-built styles — a reusable look that can be applied to generations, with optional reference images.',
    actions: {
      list: { summary: 'All styles.', method: 'GET', path: () => '/api/styles' },
      create: {
        summary: 'Create a style.',
        method: 'POST',
        body: createStyleInputSchema,
        path: () => '/api/styles',
      },
      update: {
        summary: 'Update a style.',
        method: 'PATCH',
        pathParams: ['styleId'],
        body: updateStyleInputSchema,
        path: (a) => `/api/styles/${a.styleId}`,
      },
      delete: {
        summary: 'Delete a style.',
        method: 'DELETE',
        pathParams: ['styleId'],
        path: (a) => `/api/styles/${a.styleId}`,
      },
      add_reference: {
        summary: 'Attach a reference image to a style.',
        method: 'POST',
        pathParams: ['styleId'],
        body: addStyleReferenceInputSchema,
        path: (a) => `/api/styles/${a.styleId}/references`,
      },
      remove_reference: {
        summary: 'Detach a style reference (needs refId).',
        method: 'DELETE',
        pathParams: ['styleId', 'refId'],
        path: (a) => `/api/styles/${a.styleId}/references/${a.refId}`,
      },
    },
  },

  // ── Canvas ─────────────────────────────────────────────────────────────────
  {
    name: 'canvases',
    title: 'Canvas boards',
    description:
      'Node-graph boards that cite generations — the non-linear workspace. Boards themselves are free; the generations they cite are the ones that cost.',
    actions: {
      list: { summary: 'All canvases.', method: 'GET', path: () => '/api/canvases' },
      get: {
        summary: 'One canvas with its nodes and edges.',
        method: 'GET',
        pathParams: ['canvasId'],
        path: (a) => `/api/canvases/${a.canvasId}`,
      },
      create: {
        summary: 'Create a canvas.',
        method: 'POST',
        body: createCanvasInputSchema,
        path: () => '/api/canvases',
      },
      update: {
        summary: 'Update a canvas (nodes, edges, title).',
        method: 'PATCH',
        pathParams: ['canvasId'],
        body: updateCanvasInputSchema,
        path: (a) => `/api/canvases/${a.canvasId}`,
      },
      delete: {
        summary: 'Delete a canvas.',
        method: 'DELETE',
        pathParams: ['canvasId'],
        path: (a) => `/api/canvases/${a.canvasId}`,
      },
    },
  },

  // ── 3D ─────────────────────────────────────────────────────────────────────
  {
    name: 'assets3d',
    title: 'Modular 3D assets',
    description: 'Multi-part 3D assets and the parts inside them.',
    actions: {
      list: { summary: 'All 3D assets.', method: 'GET', path: () => '/api/assets3d' },
      get: {
        summary: 'One asset with its parts.',
        method: 'GET',
        pathParams: ['assetId'],
        path: (a) => `/api/assets3d/${a.assetId}`,
      },
      create: {
        summary: 'Create an asset.',
        method: 'POST',
        body: createAsset3dInputSchema,
        path: () => '/api/assets3d',
      },
      update: {
        summary: 'Update an asset.',
        method: 'PATCH',
        pathParams: ['assetId'],
        body: updateAsset3dInputSchema,
        path: (a) => `/api/assets3d/${a.assetId}`,
      },
      delete: {
        summary: 'Delete an asset.',
        method: 'DELETE',
        pathParams: ['assetId'],
        path: (a) => `/api/assets3d/${a.assetId}`,
      },
      add_part: {
        summary: 'Add a part to an asset.',
        method: 'POST',
        pathParams: ['assetId'],
        body: createAsset3dPartInputSchema,
        path: (a) => `/api/assets3d/${a.assetId}/parts`,
      },
      update_part: {
        summary: 'Update a part (needs partId).',
        method: 'PATCH',
        pathParams: ['assetId', 'partId'],
        body: updateAsset3dPartInputSchema,
        path: (a) => `/api/assets3d/${a.assetId}/parts/${a.partId}`,
      },
      delete_part: {
        summary: 'Delete a part (needs partId).',
        method: 'DELETE',
        pathParams: ['assetId', 'partId'],
        path: (a) => `/api/assets3d/${a.assetId}/parts/${a.partId}`,
      },
    },
  },
  {
    name: 'model_renders',
    title: 'Turntable renders of a 3D model',
    description:
      'Render a 3D generation as a turntable video through a named scene preset. Our own compute, not a provider invoice.',
    actions: {
      create: {
        summary: 'Start a turntable render and (by default) wait for it.',
        method: 'POST',
        body: createModelRenderInputSchema,
        path: () => '/api/model-renders',
        poll: { path: (r) => `/api/model-renders/${r.id}`, ...RENDER_POLL },
      },
      get: {
        summary: 'Check a render\'s status (needs renderId).',
        method: 'GET',
        pathParams: ['renderId'],
        path: (a) => `/api/model-renders/${a.renderId}`,
      },
      delete: {
        summary: 'Delete a render (needs renderId).',
        method: 'DELETE',
        pathParams: ['renderId'],
        path: (a) => `/api/model-renders/${a.renderId}`,
      },
    },
  },

  // ── Prompt ─────────────────────────────────────────────────────────────────
  {
    name: 'enhance_prompt',
    title: 'Enhance a prompt',
    description:
      'Rewrite a short prompt into a fuller one using the same enhancer the web composer uses. Free, and it generates nothing — it only returns text.',
    actions: {
      enhance: {
        summary: 'Expand a prompt.',
        method: 'POST',
        body: promptEnhanceInputSchema,
        path: () => '/api/prompt/enhance',
      },
    },
  },
]
