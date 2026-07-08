// Drizzle schema (plan Task 4). First four tables use better-auth's DEFAULT
// singular table/field names (user/session/account/verification) so the drizzle
// adapter maps 1:1 without renaming config; `generation` and `credit_transaction`
// are our domain tables. Column names are snake_case on disk, camelCase in TS.
// Any change here MUST be mirrored in ddl.ts (the idempotent SQL bootstrap).
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
  type: text('type', { enum: ['image', 'video'] }).notNull(),
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
