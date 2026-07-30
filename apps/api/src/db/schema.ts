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
  // 'user' | 'super_admin'. TEXT with a TS-level enum (the generation.type
  // pattern): no CHECK constraint to migrate when roles grow. Only the dev-only
  // seed (modules/auth/dev-admin.ts) ever writes 'super_admin' — better-auth
  // exposes the field input:false, so no client can self-assign a role.
  role: text('role').notNull().default('user'),
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
  // INVARIANT (Soul Studio, ADR ai-soul-studio): when `soul` is not null this
  // column is DERIVED — the service overwrites it with composeSoul(soul) on every
  // soul change and ignores any description the client sends. A constructor
  // cannot round-trip prose, so there is exactly one writer.
  description: text('description').notNull().default(''),
  // The structured character spec (a JSON `Soul`), or NULL for every legacy /
  // hand-made entity. A COLUMN rather than a table because a soul-built character
  // IS an entity: it inherits ownership, soft delete and `[[e1]]` tagging from the
  // moment it exists. JSON rather than 10 columns because nothing queries INTO it —
  // the server reads it whole, composes text, and writes it back whole.
  soul: text('soul'),
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
  // 'generated' (Soul Studio) widens this the same way 'model3d' widened
  // generation.type: SQLite has no ENUM — the column is plain TEXT — so there is
  // no DDL to migrate. Every legacy row keeps its exact value; the drizzle enum
  // simply now admits the third source a photo can have.
  source: text('source', { enum: ['upload', 'library', 'generated'] }).notNull(),
  // Which portrait of the reference sheet this is, or NULL for an ordinary upload.
  // It is what makes the sheet render in a stable order AND what makes re-rolling
  // one view REPLACE that view instead of appending a fifth image nobody asked for
  // — without it, "re-roll the profile" and "add another photo" are the same write.
  view: text('view', { enum: ['front', 'three-quarter', 'profile', 'full-body'] }),
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
  // The shot's CAST: [{ placeholder, entityId }] as JSON. NULL = nobody tagged.
  // This is what makes a film rather than a pile of clips — the server substitutes
  // each character's name into the prompt AND attaches her photo as a reference,
  // so shot 2 shows the same fox as shot 1. Per-shot because a cast is per-beat.
  entityRefsJson: text('entity_refs_json'),
  // Arbitrary images the user ATTACHED to this shot as generation references —
  // not tagged entities, just "make it look like these". Stored as a JSON array of
  // { id, path } (path = the '/media/<uuid>.<ext>' saveDataUri returned), exactly
  // parallel to entity_refs_json. NULL = nothing attached. It lives on the SHOT so
  // an attachment PERSISTS: a re-generate re-reads it into the closed referenceImages
  // channel, whereas a one-off upload on the generation request would vanish the
  // moment the clip was remade. No new table — the refs are shot-owned and go away
  // with the shot (the film→shot cascade already covers deletion).
  referenceImagesJson: text('reference_images_json'),
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
  // Native generation audio: generate this shot's clip WITH the model's own
  // soundtrack and carry it into the export mix. 0/1 integer (SQLite boolean);
  // default 0 = the pre-feature behaviour, which also backfills legacy rows.
  audio: integer('audio', { mode: 'boolean' }).notNull().default(false),
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

// Studio3D (ADR: photo-to-3d-studio §D3) ---------------------------------------
// A turntable video of a model3d generation, shot through a named scene preset.
// Exactly the filmRender bargain: same status machine (processing →
// succeeded/failed, poll-driven, stale-reaped), and NO ledger — a render spends
// our compute, not a provider invoice, so there is no costCredits and no refund.
// The absence of a cost column is load-bearing, not an omission (db-ddl.test.ts
// asserts it): a cost here is what would tempt someone to wire this to credits.
export const modelRender = sqliteTable('model_render', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // No reference(): a generation may be deleted from the gallery while a render
  // survives. Same rule as shot.generationId — a stale link should read as an
  // orphaned render, not cascade the render away.
  generationId: text('generation_id').notNull(),
  // Which scene preset framed the shot. Validated against the shared preset table
  // in @opencreate/contracts, so the id is portable across renderers.
  presetId: text('preset_id').notNull(),
  // Which renderer produced this. 'browser' is the built path (client-side
  // WebCodecs); the other two are designed-but-unbuilt server paths. Storing it
  // means a later engine swap is a query, not archaeology.
  engine: text('engine', { enum: ['browser', 'chromium', 'blender'] })
    .notNull()
    .default('browser'),
  status: text('status', { enum: ['processing', 'succeeded', 'failed'] }).notNull(),
  progress: integer('progress'),
  // Array shape mirrors generation.mediaJson so the same serve/download path is
  // reused rather than duplicated.
  mediaJson: text('media_json').notNull().default('[]'),
  posterUrl: text('poster_url'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
})

// A public link to a model. The id IS the token (an unguessable UUID), so
// revoking a share is a DELETE and nothing on `generation` has to change — this
// feature adds no is_public flag and does not touch the generation table at all.
// The unique index on generationId (ddl.ts) is what makes "Share" idempotent:
// without it a second click mints a second live token and revoke kills only one.
export const modelShare = sqliteTable('model_share', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  generationId: text('generation_id').notNull(),
  // The render to show on the public page; NULL = show the interactive model only.
  renderId: text('render_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// ── Modular 3D Assets (ADR modular-3d-assets) ────────────────────────────────
// asset3d cites generations by id; it owns no media. The ONLY cascading FKs are
// asset3d.userId → user and asset3d_part.assetId → asset3d. imageGenerationId /
// meshGenerationId are CITATIONS (bare text, no .references()) — deleting a
// generation from the library must leave an orphaned ref, never delete the part.
export const asset3d = sqliteTable('asset3d', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  // The FULL public path saveDataUri returns for the concept image, verbatim —
  // '/media/<uuid>.<ext>'. NOT a bare key: readAsDataUri needs the extension to
  // resolve the mime, and you cannot rebuild it from a bare uuid. Not a provider URL.
  conceptImagePath: text('concept_image_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const asset3dPart = sqliteTable('asset3d_part', {
  id: text('id').primaryKey(),
  assetId: text('asset_id')
    .notNull()
    .references(() => asset3d.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  // REAL so reorder/midpoint-insert spaces values without a whole-list renumber.
  sortOrder: real('sort_order').notNull(),
  // Citations — NO .references(): the part outlives a deleted generation.
  imageGenerationId: text('image_generation_id'),
  meshGenerationId: text('mesh_generation_id'),
  // Assembly transform (client-set via PATCH), stringified JSON; null until placed.
  transformJson: text('transform_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// Canvas Mode (ADR canvas-mode): the node-graph aggregate. Same discipline as
// film/shot — the canvas owns nodes/edges (FK cascade), a node CITES
// generations via a JSON id list with NO reference (a gallery delete must
// leave an empty version, never cascade the canvas away).
export const canvas = sqliteTable('canvas', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  // {x, y, zoom} JSON — the owner's last camera, restored on open.
  viewportJson: text('viewport_json').notNull().default('{"x":0,"y":0,"zoom":1}'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const canvasNode = sqliteTable('canvas_node', {
  id: text('id').primaryKey(),
  canvasId: text('canvas_id')
    .notNull()
    .references(() => canvas.id, { onDelete: 'cascade' }),
  kind: text('kind', {
    enum: ['image', 'video', 'upload', 'character', 'upscale', 'remove-bg', 'note'],
  }).notNull(),
  positionJson: text('position_json').notNull(),
  // Saved editor state, opaque to the server (runs re-validate at /generations).
  configJson: text('config_json').notNull().default('{}'),
  // Append-only version history (JSON string[]), latest succeeded = output.
  generationIdsJson: text('generation_ids_json').notNull().default('[]'),
  // Upload nodes only: server-minted '/media/…' path.
  uploadUrl: text('upload_url'),
})

export const canvasEdge = sqliteTable('canvas_edge', {
  id: text('id').primaryKey(),
  canvasId: text('canvas_id')
    .notNull()
    .references(() => canvas.id, { onDelete: 'cascade' }),
  sourceNodeId: text('source_node_id').notNull(),
  targetNodeId: text('target_node_id').notNull(),
})

// openCreator (ADR opencreator-agent D4): the agent chat. Two tables and no more
// — the agent's OUTPUT lives in the existing aggregates (entity, canvas,
// generation) and is cited by id inside content_json, so this module owns the
// conversation and nothing else.
export const creatorSession = sqliteTable('creator_session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // First user message, trimmed — the left rail needs a label before the agent
  // has said anything.
  title: text('title').notNull(),
  // TS-level enum over a TEXT column, exactly like generation.status: the union
  // is enforced in code (and by the shared contracts schema on the way out),
  // which keeps a new status from being a migration.
  status: text('status', {
    enum: ['idle', 'running', 'awaiting_confirm', 'failed'],
  }).notNull(),
  // THE BUDGET GATE (ADR D2). Integer 0/1 because SQLite has no boolean; read
  // fresh before EVERY charging tool call (never cached in the loop), so a
  // confirm that lands mid-turn is honoured and a new plan revokes the previous
  // confirmation. 0 is the default at the DDL level too — a session that never
  // reached /confirm structurally cannot spend.
  confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  // Doubles as the staleness clock: settleStaleCreatorSessions fails a `running`
  // session whose updated_at is older than the threshold (the API restart case —
  // in-flight turns live in process memory, so nothing else would settle them).
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const creatorMessage = sqliteTable('creator_message', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => creatorSession.id, { onDelete: 'cascade' }),
  // No 'tool' role (the ADR sketched one): a tool result is not something the
  // user reads — the loop turns each executed tool into an assistant `step`
  // message and keeps the raw JSON inside the turn's transcript.
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  // creatorMessageContentSchema, stringified. JSON rather than columns because
  // the four card kinds share almost no fields, and the server never queries
  // INTO a message — it reads the whole conversation, in order, or nothing.
  contentJson: text('content_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
