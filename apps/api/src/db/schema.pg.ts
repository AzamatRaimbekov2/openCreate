// Postgres mirror of schema.ts (Postgres migration, step 1 — groundwork only,
// NOT wired into client.ts/app.ts yet). Deliberately CONSERVATIVE: every column
// keeps the exact JS-facing shape the SQLite version has, so the eventual
// service-layer conversion (step 3+) is "add await", not "also fix every call
// site's data shape". Two intentional deviations from a "just use native
// Postgres types" migration, both discussed and agreed:
//   - JSON columns stay `text` (not `jsonb`) — jsonb would make Drizzle return
//     already-parsed objects, breaking every existing `JSON.parse(row.xJson)`
//     call site across the codebase.
//   - Timestamps use `timestamp(mode:'date')` (native Postgres column, JS Date
//     in/out) rather than trying to force epoch-ms integers into Postgres —
//     the JS-facing type is IDENTICAL to sqlite-core's `timestamp_ms` mode, so
//     this is the conservative choice even though the wire format differs.
// Any change here MUST be mirrored in schema.ts (and vice versa) until the
// SQLite path is retired.
import { boolean, integer, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  creditsBalance: integer('credits_balance').notNull().default(0),
  role: text('role').notNull().default('user'),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date' }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date' }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

export const generation = pgTable('generation', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['image', 'video', 'audio', 'model3d'] }).notNull(),
  mode: text('mode', { enum: ['text', 'image'] }).notNull(),
  status: text('status', { enum: ['processing', 'succeeded', 'failed'] }).notNull(),
  prompt: text('prompt').notNull(),
  modelId: text('model_id').notNull(),
  paramsJson: text('params_json').notNull(),
  costCredits: integer('cost_credits').notNull(),
  provider: text('provider').notNull().default('runware'),
  runwareTaskUuid: text('runware_task_uuid'),
  runwareCostUsd: text('runware_cost_usd'),
  mediaJson: text('media_json').notNull().default('[]'),
  progress: integer('progress'),
  errorMessage: text('error_message'),
  errorCode: text('error_code'),
  composedPrompt: text('composed_prompt'),
  promptPresetJson: text('prompt_preset_json'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  completedAt: timestamp('completed_at', { mode: 'date' }),
})

export const creditTransaction = pgTable('credit_transaction', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  kind: text('kind', { enum: ['signup_bonus', 'charge', 'refund'] }).notNull(),
  generationId: text('generation_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Entity library — reusable characters/objects/places a user can tag in prompts.
// ADR: docs/wiki/decisions/entity-library-reference-tagging.md
// ─────────────────────────────────────────────────────────────────────────────

export const entity = pgTable('entity', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['character', 'object', 'place', 'other'] }).notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  soul: text('soul'),
  primaryImageId: text('primary_image_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
})

export const entityImage = pgTable('entity_image', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entity.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  source: text('source', { enum: ['upload', 'library', 'generated'] }).notNull(),
  view: text('view', { enum: ['front', 'three-quarter', 'profile', 'full-body'] }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
})

export const generationEntity = pgTable('generation_entity', {
  generationId: text('generation_id')
    .notNull()
    .references(() => generation.id, { onDelete: 'cascade' }),
  entityId: text('entity_id').notNull(),
  placeholder: text('placeholder').notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// CinemaStudio — the composition layer over generations.
// ADR: docs/wiki/decisions/cinema-studio.md
// ─────────────────────────────────────────────────────────────────────────────

export const film = pgTable('film', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  aspectRatio: text('aspect_ratio', { enum: ['16:9', '1:1', '9:16'] }).notNull(),
  defaultStyleId: text('default_style_id'),
  templateId: text('template_id'),
  coverImagePath: text('cover_image_path'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

export const shot = pgTable('shot', {
  id: text('id').primaryKey(),
  filmId: text('film_id')
    .notNull()
    .references(() => film.id, { onDelete: 'cascade' }),
  orderIndex: real('order_index').notNull(),
  generationId: text('generation_id'),
  prompt: text('prompt').notNull().default(''),
  promptPresetJson: text('prompt_preset_json'),
  entityRefsJson: text('entity_refs_json'),
  referenceImagesJson: text('reference_images_json'),
  modelId: text('model_id'),
  aspectRatio: text('aspect_ratio', { enum: ['16:9', '1:1', '9:16'] }),
  durationMs: integer('duration_ms').notNull(),
  trimStartMs: integer('trim_start_ms').notNull().default(0),
  transition: text('transition', { enum: ['none', 'crossfade'] })
    .notNull()
    .default('none'),
  transitionMs: integer('transition_ms').notNull().default(0),
  titleJson: text('title_json'),
  voiceoverJson: text('voiceover_json'),
  audio: boolean('audio').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
})

export const filmAudio = pgTable('film_audio', {
  id: text('id').primaryKey(),
  filmId: text('film_id')
    .notNull()
    .references(() => film.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['music', 'voiceover'] }).notNull(),
  generationId: text('generation_id').notNull(),
  shotId: text('shot_id'),
  startMs: integer('start_ms').notNull().default(0),
  gainDb: real('gain_db').notNull().default(0),
})

export const filmRender = pgTable('film_render', {
  id: text('id').primaryKey(),
  filmId: text('film_id')
    .notNull()
    .references(() => film.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['processing', 'succeeded', 'failed'] }).notNull(),
  progress: integer('progress'),
  mediaJson: text('media_json'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  completedAt: timestamp('completed_at', { mode: 'date' }),
})

// Studio3D (ADR: photo-to-3d-studio §D3) ---------------------------------------
export const modelRender = pgTable('model_render', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  generationId: text('generation_id').notNull(),
  presetId: text('preset_id').notNull(),
  engine: text('engine', { enum: ['browser', 'chromium', 'blender'] })
    .notNull()
    .default('browser'),
  status: text('status', { enum: ['processing', 'succeeded', 'failed'] }).notNull(),
  progress: integer('progress'),
  mediaJson: text('media_json').notNull().default('[]'),
  posterUrl: text('poster_url'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  completedAt: timestamp('completed_at', { mode: 'date' }),
})

export const modelShare = pgTable('model_share', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  generationId: text('generation_id').notNull(),
  renderId: text('render_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
})

// ── Modular 3D Assets (ADR modular-3d-assets) ────────────────────────────────
export const asset3d = pgTable('asset3d', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  conceptImagePath: text('concept_image_path').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
})

export const asset3dPart = pgTable('asset3d_part', {
  id: text('id').primaryKey(),
  assetId: text('asset_id')
    .notNull()
    .references(() => asset3d.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  sortOrder: real('sort_order').notNull(),
  imageGenerationId: text('image_generation_id'),
  meshGenerationId: text('mesh_generation_id'),
  transformJson: text('transform_json'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
})

// Canvas Mode (ADR canvas-mode) ------------------------------------------------
export const canvas = pgTable('canvas', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  viewportJson: text('viewport_json').notNull().default('{"x":0,"y":0,"zoom":1}'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

export const canvasNode = pgTable('canvas_node', {
  id: text('id').primaryKey(),
  canvasId: text('canvas_id')
    .notNull()
    .references(() => canvas.id, { onDelete: 'cascade' }),
  kind: text('kind', {
    enum: ['image', 'video', 'prompt', 'upload', 'character', 'upscale', 'remove-bg', 'note'],
  }).notNull(),
  positionJson: text('position_json').notNull(),
  configJson: text('config_json').notNull().default('{}'),
  generationIdsJson: text('generation_ids_json').notNull().default('[]'),
  uploadUrl: text('upload_url'),
})

export const canvasEdge = pgTable('canvas_edge', {
  id: text('id').primaryKey(),
  canvasId: text('canvas_id')
    .notNull()
    .references(() => canvas.id, { onDelete: 'cascade' }),
  sourceNodeId: text('source_node_id').notNull(),
  targetNodeId: text('target_node_id').notNull(),
})

// Style Studio (ADR style-studio D2) -------------------------------------------
export const style = pgTable('style', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['prompt'] })
    .notNull()
    .default('prompt'),
  fragment: text('fragment').notNull(),
  negative: text('negative').notNull().default(''),
  recommendedModelId: text('recommended_model_id'),
  configJson: text('config_json').notNull().default('{}'),
  referenceImagesJson: text('reference_images_json'),
  previewGenerationId: text('preview_generation_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

// openCreator (ADR opencreator-agent D4) ---------------------------------------
export const creatorSession = pgTable('creator_session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  status: text('status', {
    enum: ['idle', 'running', 'awaiting_confirm', 'failed'],
  }).notNull(),
  confirmed: boolean('confirmed').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
})

export const creatorMessage = pgTable('creator_message', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => creatorSession.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  contentJson: text('content_json').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
})
