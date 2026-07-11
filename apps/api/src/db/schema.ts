// Drizzle schema (plan Task 4). First four tables use better-auth's DEFAULT
// singular table/field names (user/session/account/verification) so the drizzle
// adapter maps 1:1 without renaming config; `generation` and `credit_transaction`
// are our domain tables. Column names are snake_case on disk, camelCase in TS.
// Any change here MUST be mirrored in ddl.ts (the idempotent SQL bootstrap).
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  // Denormalized credit balance — mutated ONLY inside the same transaction as a
  // credit_transaction ledger row (see modules/credits/ledger.ts invariants).
  creditsBalance: integer('credits_balance').notNull().default(0),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const generation = sqliteTable('generation', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // 'model3d' (Studio3D) widens this enum at the TYPE level only: SQLite has no
  // ENUM type — the column is plain TEXT — so no DDL/migration exists to change.
  // Every legacy row keeps its exact value; the drizzle enum simply now admits
  // the fourth media type the contracts already define.
  type: text('type', { enum: ['image', 'video', 'audio', 'model3d'] }).notNull(),
  mode: text('mode', { enum: ['text', 'image'] }).notNull(),
  status: text('status', { enum: ['processing', 'succeeded', 'failed'] }).notNull(),
  prompt: text('prompt').notNull(),
  modelId: text('model_id').notNull(),
  paramsJson: text('params_json').notNull(),
  costCredits: integer('cost_credits').notNull(),
  // Which video backend ran this job (VideoProvider seam). Additive + back-compat:
  // NOT NULL DEFAULT 'runware' so every legacy row and image row reads 'runware'.
  // The poll path resolves the provider from THIS column (durable state), not the
  // live catalog, so a job always polls the backend it was submitted to.
  provider: text('provider').notNull().default('runware'),
  // Provider job handle + operator cost. Kept under the legacy `runware_*` names
  // (reused, not renamed — see the ADR's additive/reversible DB decision) but now
  // hold the NEUTRAL job id/cost for whichever provider ran: Runware's taskUUID or
  // the ComfyUI prompt_id. Reusing them keeps the money-path guards byte-for-byte.
  runwareTaskUuid: text('runware_task_uuid'),
  runwareCostUsd: text('runware_cost_usd'),
  mediaJson: text('media_json').notNull().default('[]'),
  progress: integer('progress'),
  errorMessage: text('error_message'),
  // Machine-readable failure reason (contracts ApiErrorCode subset). Set for
  // failures the SPA must localize specially — today only 'content_blocked'
  // (NSFW safety filter), where the raw provider errorMessage is not user copy.
  errorCode: text('error_code'),
  // CinemaStudio (ADR cinema-studio §3). composedPrompt = what the MODEL saw
  // (user text + preset fragments); NULL → read `prompt`. promptPresetJson =
  // the structured preset echoed back for the composer's Regenerate pre-fill.
  composedPrompt: text('composed_prompt'),
  promptPresetJson: text('prompt_preset_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
})

export const creditTransaction = sqliteTable('credit_transaction', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Signed amount: negative for 'charge', positive for 'signup_bonus'/'refund'.
  amount: integer('amount').notNull(),
  kind: text('kind', { enum: ['signup_bonus', 'charge', 'refund'] }).notNull(),
  generationId: text('generation_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Entity library — reusable characters/objects/places a user can tag in prompts.
// ADR: docs/wiki/decisions/entity-library-reference-tagging.md
// ─────────────────────────────────────────────────────────────────────────────

export const entity = sqliteTable('entity', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // What the user made. The provider mapping (character → ACE++ Portrait,
  // everything else → Subject) lives in the provider adapter, not here: the
  // domain records what a thing IS, not how a given vendor conditions on it.
  kind: text('kind', { enum: ['character', 'object', 'place', 'other'] }).notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  // The ONE image sent as a reference (Runware accepts a single one). Nullable:
  // an entity exists before its first photo is uploaded. No FK to entity_image —
  // that would be circular; the service validates the id belongs to this entity.
  primaryImageId: text('primary_image_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  // SOFT delete: a past generation cites this entity, and provenance ("what did
  // I actually tag when I made this?") must survive the user tidying up.
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
})

export const entityImage = sqliteTable('entity_image', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entity.id, { onDelete: 'cascade' }),
  // Served from OUR storage, never a provider URL: Runware assets expire after
  // 7 days, so an entity pointing at one silently breaks a week after creation.
  url: text('url').notNull(),
  source: text('source', { enum: ['upload', 'library'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// Provenance of a generation: which entities it cited, under which placeholder.
// Written AFTER the prompt is composed, so the row records what actually reached
// the model — not what the client claimed it wanted.
export const generationEntity = sqliteTable('generation_entity', {
  generationId: text('generation_id')
    .notNull()
    .references(() => generation.id, { onDelete: 'cascade' }),
  // No cascade: the entity soft-deletes, so the citation outlives it
  entityId: text('entity_id').notNull(),
  placeholder: text('placeholder').notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// CinemaStudio — the composition layer over generations.
// ADR: docs/wiki/decisions/cinema-studio.md
// ─────────────────────────────────────────────────────────────────────────────

// A film project: a title, the canvas aspect every shot is scaled/padded to,
// and the style the composer pre-selects for new shots.
export const film = sqliteTable('film', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  aspectRatio: text('aspect_ratio', { enum: ['16:9', '1:1', '9:16'] }).notNull(),
  defaultStyleId: text('default_style_id'),
  // Which template this film was instantiated from (ADR: template-catalog), or
  // NULL for a hand-made film. Not an FK: templates are code, not rows — deleting
  // a template from the catalog must leave old films intact, just unlinked.
  templateId: text('template_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// One clip on the timeline. orderIndex is REAL so a reorder spaces values and
// midpoint-inserts (one UPDATE, no whole-list renumber). generationId is
// nullable and carries NO drizzle reference on purpose: a generation the user
// deletes from the gallery must leave this shot as an empty slot, not cascade
// the whole film away.
export const shot = sqliteTable('shot', {
  id: text('id').primaryKey(),
  filmId: text('film_id')
    .notNull()
    .references(() => film.id, { onDelete: 'cascade' }),
  orderIndex: real('order_index').notNull(),
  generationId: text('generation_id'),
  prompt: text('prompt').notNull().default(''),
  promptPresetJson: text('prompt_preset_json'),
  // The catalog model this shot generates with; NULL = no opinion (fall back to
  // the style's recommendation, then the first video model). Before this column
  // the model was transient inspector state — re-selecting a shot forgot which
  // model made its clip, and a template had nowhere to pin its tier.
  modelId: text('model_id'),
  // Milliseconds — the timeline unit. Video shot plays [trimStart, trimStart+duration).
  durationMs: integer('duration_ms').notNull(),
  trimStartMs: integer('trim_start_ms').notNull().default(0),
  transition: text('transition', { enum: ['none', 'crossfade'] })
    .notNull()
    .default('none'),
  transitionMs: integer('transition_ms').notNull().default(0),
  titleJson: text('title_json'),
  // { text, voice } — the line this shot's character SPEAKS, as authored copy.
  // A draft slot, not an asset: FilmAudio requires a generationId, so before this
  // column there was no way to hand a user a script without first generating (and
  // charging for) the TTS. Generating it produces an audio generation and files a
  // FilmAudio track at this shot's timeline offset.
  voiceoverJson: text('voiceover_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// A music bed or voiceover laid under the timeline; cites an audio generation.
// No reference on generationId — same "leave an empty ref, don't cascade" rule.
export const filmAudio = sqliteTable('film_audio', {
  id: text('id').primaryKey(),
  filmId: text('film_id')
    .notNull()
    .references(() => film.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['music', 'voiceover'] }).notNull(),
  generationId: text('generation_id').notNull(),
  // The shot this track voices; NULL = a film-wide bed. It makes "voice this
  // shot" a REPLACE rather than an append — without it a second click would add a
  // second overlapping track and charge for it again. No FK on purpose: the shot
  // cascade already removes the film's rows, and a stale link should read as an
  // unattached track, not delete someone's audio.
  shotId: text('shot_id'),
  startMs: integer('start_ms').notNull().default(0),
  gainDb: real('gain_db').notNull().default(0),
})

// An ffmpeg export job. Same status-machine SHAPE as a generation
// (processing → succeeded/failed, poll-driven, stale-reaped) but NO ledger:
// a render spends our CPU, not a provider invoice, so there is no costCredits
// and no refund. mediaJson holds [renderMediaUrl] once succeeded (array shape
// mirrors generation.mediaJson so the same download/serve path is reused).
export const filmRender = sqliteTable('film_render', {
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
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
})
