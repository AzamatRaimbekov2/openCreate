// The full openCreate tool table — one entry per REST endpoint, declared as data.
// Each tool reuses the SHARED @opencreate/contracts zod schema for its body, so a
// tool's input can never drift from what the API validates. Path/query params and
// async polling are the only per-endpoint extras.
//
// Coverage mirrors the real routes (apps/api/src/modules/*/routes.ts). There is
// deliberately NO tool for capabilities the API doesn't expose as an endpoint
// (e.g. entity images / portraits have no standalone route).
import {
  addFilmAudioInputSchema,
  addShotReferenceInputSchema,
  createAsset3dInputSchema,
  createAsset3dPartInputSchema,
  createEntityInputSchema,
  createFilmFromTemplateInputSchema,
  createFilmInputSchema,
  createGenerationInputSchema,
  createModelRenderInputSchema,
  createShotInputSchema,
  createStoryboardInputSchema,
  generateShotClipInputSchema,
  promptEnhanceInputSchema,
  reorderShotsInputSchema,
  updateAsset3dInputSchema,
  updateAsset3dPartInputSchema,
  updateEntityInputSchema,
  updateFilmInputSchema,
  updateShotInputSchema,
} from '@opencreate/contracts'
import type { ToolDef } from './registry'

// Generations/clips finish fast-ish; renders (ffmpeg / 3D) take longer.
const GEN_POLL = { timeoutMs: 120_000, intervalMs: 3_000 } as const
const RENDER_POLL = { timeoutMs: 300_000, intervalMs: 4_000 } as const

export const tools: ToolDef[] = [
  // ── Meta ──────────────────────────────────────────────────────────────────
  {
    name: 'get_me',
    title: 'Get my account',
    description: 'Return the signed-in user profile and current credit balance.',
    method: 'GET',
    path: () => '/api/me',
  },
  {
    name: 'list_catalog',
    title: 'List models',
    description: 'List every available generation model (image/video/audio/3D) with its credit price.',
    method: 'GET',
    path: () => '/api/catalog',
  },
  {
    name: 'list_credit_transactions',
    title: 'List credit transactions',
    description: 'List the credit ledger (charges, refunds, signup bonus) for the signed-in user.',
    method: 'GET',
    path: () => '/api/credits/transactions',
  },

  // ── Generations ─────────────────────────────────────────────────────────────
  {
    name: 'create_generation',
    title: 'Generate image / video / audio / 3D',
    description:
      'Create a generation. modelId (from list_catalog) picks the media type. Images finish synchronously; video/audio/3D run async — with wait (default true) the tool polls to completion and returns the finished asset URL.',
    method: 'POST',
    body: createGenerationInputSchema,
    path: () => '/api/generations',
    poll: { path: (r) => `/api/generations/${r.id}`, ...GEN_POLL },
  },
  {
    name: 'list_generations',
    title: 'List generations',
    description: 'List the gallery of generations, newest first. Optional limit (max 50) and cursor for paging.',
    method: 'GET',
    query: ['limit', 'cursor'],
    path: () => '/api/generations',
  },
  {
    name: 'get_generation',
    title: 'Get generation',
    description: 'Fetch one generation by id (also the manual poll for an async video/audio/3D job).',
    method: 'GET',
    pathParams: ['generationId'],
    path: (a) => `/api/generations/${a.generationId}`,
  },
  {
    name: 'delete_generation',
    title: 'Delete generation',
    description: 'Delete a generation from the gallery.',
    method: 'DELETE',
    pathParams: ['generationId'],
    path: (a) => `/api/generations/${a.generationId}`,
  },

  // ── Films ────────────────────────────────────────────────────────────────────
  {
    name: 'list_films',
    title: 'List films',
    description: 'List the signed-in user\'s film projects.',
    method: 'GET',
    path: () => '/api/films',
  },
  {
    name: 'get_film',
    title: 'Get film',
    description: 'Fetch one film with its shots, audio tracks, and renders.',
    method: 'GET',
    pathParams: ['filmId'],
    path: (a) => `/api/films/${a.filmId}`,
  },
  {
    name: 'create_film',
    title: 'Create film',
    description: 'Create an empty film project (title + settings). Add shots or generate a storyboard next.',
    method: 'POST',
    body: createFilmInputSchema,
    path: () => '/api/films',
  },
  {
    name: 'update_film',
    title: 'Update film',
    description: 'Update a film\'s title or settings.',
    method: 'PATCH',
    pathParams: ['filmId'],
    body: updateFilmInputSchema,
    path: (a) => `/api/films/${a.filmId}`,
  },
  {
    name: 'delete_film',
    title: 'Delete film',
    description: 'Delete a film project and its shots.',
    method: 'DELETE',
    pathParams: ['filmId'],
    path: (a) => `/api/films/${a.filmId}`,
  },
  {
    name: 'create_film_from_template',
    title: 'Create film from template',
    description: 'Instantiate a whole film from a pre-authored template (see list_templates). Charges nothing on apply.',
    method: 'POST',
    body: createFilmFromTemplateInputSchema,
    path: () => '/api/films/from-template',
  },
  {
    name: 'list_templates',
    title: 'List templates',
    description: 'List the gallery of pre-authored film templates (viral formats) that instantiate into a film.',
    method: 'GET',
    path: () => '/api/templates',
  },

  // ── Shots ────────────────────────────────────────────────────────────────────
  {
    name: 'add_shot',
    title: 'Add shot',
    description: 'Add a shot (a prompt + camera/motion settings) to a film.',
    method: 'POST',
    pathParams: ['filmId'],
    body: createShotInputSchema,
    path: (a) => `/api/films/${a.filmId}/shots`,
  },
  {
    name: 'update_shot',
    title: 'Update shot',
    description: 'Update a shot\'s prompt or settings.',
    method: 'PATCH',
    pathParams: ['filmId', 'shotId'],
    body: updateShotInputSchema,
    path: (a) => `/api/films/${a.filmId}/shots/${a.shotId}`,
  },
  {
    name: 'delete_shot',
    title: 'Delete shot',
    description: 'Delete a shot from a film.',
    method: 'DELETE',
    pathParams: ['filmId', 'shotId'],
    path: (a) => `/api/films/${a.filmId}/shots/${a.shotId}`,
  },
  {
    name: 'reorder_shots',
    title: 'Reorder shots',
    description: 'Reorder a film\'s shots by passing the full ordered list of shot ids.',
    method: 'POST',
    pathParams: ['filmId'],
    body: reorderShotsInputSchema,
    path: (a) => `/api/films/${a.filmId}/shots/reorder`,
  },
  {
    name: 'generate_storyboard',
    title: 'Generate storyboard',
    description: 'Turn a script/brief into DRAFT shots via Claude. Nothing is generated or charged until you run generate_shot_clip.',
    method: 'POST',
    pathParams: ['filmId'],
    body: createStoryboardInputSchema,
    path: (a) => `/api/films/${a.filmId}/storyboard`,
  },
  {
    name: 'generate_shot_clip',
    title: 'Generate shot clip',
    description:
      'Generate the clip for a shot (spends credits). Images return synchronously; video runs async — with wait (default true) the tool polls to completion.',
    method: 'POST',
    pathParams: ['filmId', 'shotId'],
    body: generateShotClipInputSchema,
    path: (a) => `/api/films/${a.filmId}/shots/${a.shotId}/clip`,
    poll: { path: (r) => `/api/generations/${r.id}`, ...GEN_POLL },
  },
  {
    name: 'add_shot_reference',
    title: 'Add shot reference image',
    description: 'Attach a reference image (data URI) to a shot to steer its generation.',
    method: 'POST',
    pathParams: ['filmId', 'shotId'],
    body: addShotReferenceInputSchema,
    path: (a) => `/api/films/${a.filmId}/shots/${a.shotId}/references`,
  },
  {
    name: 'remove_shot_reference',
    title: 'Remove shot reference image',
    description: 'Detach a reference image from a shot.',
    method: 'DELETE',
    pathParams: ['filmId', 'shotId', 'refId'],
    path: (a) => `/api/films/${a.filmId}/shots/${a.shotId}/references/${a.refId}`,
  },

  // ── Audio & render ───────────────────────────────────────────────────────────
  {
    name: 'add_film_audio',
    title: 'Add film audio',
    description: 'Attach an audio track (music/voiceover generation or upload) to a film\'s timeline.',
    method: 'POST',
    pathParams: ['filmId'],
    body: addFilmAudioInputSchema,
    path: (a) => `/api/films/${a.filmId}/audio`,
  },
  {
    name: 'delete_film_audio',
    title: 'Delete film audio',
    description: 'Remove an audio track from a film.',
    method: 'DELETE',
    pathParams: ['filmId', 'audioId'],
    path: (a) => `/api/films/${a.filmId}/audio/${a.audioId}`,
  },
  {
    name: 'render_film',
    title: 'Render film',
    description:
      'Render the film timeline into a single mp4 (server-side ffmpeg). Async — with wait (default true) the tool polls until the render finishes and returns the mp4 URL.',
    method: 'POST',
    pathParams: ['filmId'],
    path: (a) => `/api/films/${a.filmId}/renders`,
    poll: { path: (r, a) => `/api/films/${a.filmId}/renders/${r.id}`, ...RENDER_POLL },
  },
  {
    name: 'get_render',
    title: 'Get render',
    description: 'Fetch a film render by id (manual poll / result).',
    method: 'GET',
    pathParams: ['filmId', 'renderId'],
    path: (a) => `/api/films/${a.filmId}/renders/${a.renderId}`,
  },

  // ── Entities (characters / objects / places) ─────────────────────────────────
  {
    name: 'list_entities',
    title: 'List entities',
    description: 'List the entity library (characters, objects, places) usable as tagged references in prompts.',
    method: 'GET',
    path: () => '/api/entities',
  },
  {
    name: 'get_entity',
    title: 'Get entity',
    description: 'Fetch one entity with its reference images and soul spec.',
    method: 'GET',
    pathParams: ['entityId'],
    path: (a) => `/api/entities/${a.entityId}`,
  },
  {
    name: 'create_entity',
    title: 'Create entity',
    description: 'Create a library entity (character/object/place) that can be tagged into generation prompts.',
    method: 'POST',
    body: createEntityInputSchema,
    path: () => '/api/entities',
  },
  {
    name: 'update_entity',
    title: 'Update entity',
    description: 'Update an entity\'s name, description, images, or soul spec.',
    method: 'PATCH',
    pathParams: ['entityId'],
    body: updateEntityInputSchema,
    path: (a) => `/api/entities/${a.entityId}`,
  },
  {
    name: 'delete_entity',
    title: 'Delete entity',
    description: 'Delete a library entity.',
    method: 'DELETE',
    pathParams: ['entityId'],
    path: (a) => `/api/entities/${a.entityId}`,
  },

  // ── 3D assets (Studio3D / modular assets) ────────────────────────────────────
  {
    name: 'list_assets3d',
    title: 'List 3D assets',
    description: 'List modular 3D assets (concept image → named parts → per-part meshes).',
    method: 'GET',
    path: () => '/api/assets3d',
  },
  {
    name: 'get_asset3d',
    title: 'Get 3D asset',
    description: 'Fetch one 3D asset with its parts.',
    method: 'GET',
    pathParams: ['assetId'],
    path: (a) => `/api/assets3d/${a.assetId}`,
  },
  {
    name: 'create_asset3d',
    title: 'Create 3D asset',
    description: 'Create a modular 3D asset from a concept image.',
    method: 'POST',
    body: createAsset3dInputSchema,
    path: () => '/api/assets3d',
  },
  {
    name: 'update_asset3d',
    title: 'Update 3D asset',
    description: 'Rename a 3D asset.',
    method: 'PATCH',
    pathParams: ['assetId'],
    body: updateAsset3dInputSchema,
    path: (a) => `/api/assets3d/${a.assetId}`,
  },
  {
    name: 'delete_asset3d',
    title: 'Delete 3D asset',
    description: 'Delete a 3D asset and its parts.',
    method: 'DELETE',
    pathParams: ['assetId'],
    path: (a) => `/api/assets3d/${a.assetId}`,
  },
  {
    name: 'add_asset3d_part',
    title: 'Add 3D asset part',
    description: 'Add a named part (e.g. Body, Hair, Armor) to a 3D asset.',
    method: 'POST',
    pathParams: ['assetId'],
    body: createAsset3dPartInputSchema,
    path: (a) => `/api/assets3d/${a.assetId}/parts`,
  },
  {
    name: 'update_asset3d_part',
    title: 'Update 3D asset part',
    description: 'Update a 3D asset part.',
    method: 'PATCH',
    pathParams: ['assetId', 'partId'],
    body: updateAsset3dPartInputSchema,
    path: (a) => `/api/assets3d/${a.assetId}/parts/${a.partId}`,
  },
  {
    name: 'delete_asset3d_part',
    title: 'Delete 3D asset part',
    description: 'Delete a part from a 3D asset.',
    method: 'DELETE',
    pathParams: ['assetId', 'partId'],
    path: (a) => `/api/assets3d/${a.assetId}/parts/${a.partId}`,
  },

  // ── Model renders (Studio3D presentable clips) ───────────────────────────────
  {
    name: 'create_model_render',
    title: 'Render 3D model',
    description:
      'Render a turntable/preset clip from a 3D model generation. Async — with wait (default true) the tool polls until the render finishes.',
    method: 'POST',
    pathParams: ['generationId'],
    body: createModelRenderInputSchema,
    path: (a) => `/api/models/${a.generationId}/renders`,
    poll: { path: (r) => `/api/model-renders/${r.id}`, ...RENDER_POLL },
  },
  {
    name: 'get_model_render',
    title: 'Get 3D model render',
    description: 'Fetch a 3D model render by id (manual poll / result).',
    method: 'GET',
    pathParams: ['renderId'],
    path: (a) => `/api/model-renders/${a.renderId}`,
  },
  {
    name: 'delete_model_render',
    title: 'Delete 3D model render',
    description: 'Delete a 3D model render.',
    method: 'DELETE',
    pathParams: ['renderId'],
    path: (a) => `/api/model-renders/${a.renderId}`,
  },

  // ── Prompt ───────────────────────────────────────────────────────────────────
  {
    name: 'enhance_prompt',
    title: 'Enhance prompt',
    description: 'Rewrite a prompt to be richer (enhance) or safer/simpler (soften). Charges nothing.',
    method: 'POST',
    body: promptEnhanceInputSchema,
    path: () => '/api/prompt/enhance',
  },
]
