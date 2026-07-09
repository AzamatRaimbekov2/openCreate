// Idempotent SQL bootstrap (plan Task 4). Literal CREATE TABLE IF NOT EXISTS
// statements that MUST match schema.ts column-for-column. This replaces
// drizzle-kit migrations for the MVP: simpler, and it works for ':memory:'
// databases in tests (drizzle-kit can't migrate an in-memory db per test).
// timestamp_ms columns are INTEGER (epoch millis); booleans are INTEGER 0/1.
export const DDL = `
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  credits_balance INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  id_token TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS generation (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt TEXT NOT NULL,
  model_id TEXT NOT NULL,
  params_json TEXT NOT NULL,
  cost_credits INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'runware',
  runware_task_uuid TEXT,
  runware_cost_usd TEXT,
  media_json TEXT NOT NULL DEFAULT '[]',
  progress INTEGER,
  error_message TEXT,
  error_code TEXT,
  -- CinemaStudio (ADR cinema-studio §3): the prompt the MODEL actually saw
  -- (user text + preset fragments). NULL on legacy rows / no-preset rows →
  -- read 'prompt'. prompt_preset_json echoes the structured preset for Regenerate.
  composed_prompt TEXT,
  prompt_preset_json TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS credit_transaction (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  generation_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_generation_user_created ON generation(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transaction(user_id, created_at DESC);
`

// DB-level refund-once backstop (review finding). The ledger's app-level
// guard (applyRefund's in-transaction "already refunded?" check) is correct,
// but nothing at the DATABASE level stopped a future code path from inserting
// a second refund (or charge) row for the same generation. UNIQUE on
// (generation_id, kind) makes that physically impossible; signup bonuses are
// exempt because their generation_id is NULL and SQLite treats NULLs as
// distinct in unique indexes.
// Kept OUT of the main DDL string on purpose: db/client.ts execs it
// SEPARATELY inside a try/catch, because a legacy database that already
// contains duplicate (generation_id, kind) rows would make CREATE UNIQUE
// INDEX throw — and a mid-string failure would abort the rest of the
// bootstrap. Boot must survive on the app-level guard alone in that case.
export const REFUND_ONCE_INDEX_DDL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_tx_generation_kind
  ON credit_transaction(generation_id, kind);
`

// Entity library (ADR: entity-library-reference-tagging). Exec'd with the main
// DDL — all CREATE ... IF NOT EXISTS, so re-running on every boot is a no-op.
export const ENTITY_DDL = `
CREATE TABLE IF NOT EXISTS entity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  primary_image_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_entity_user_alive
  ON entity(user_id, deleted_at);

CREATE TABLE IF NOT EXISTS entity_image (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entity_image_entity ON entity_image(entity_id);

CREATE TABLE IF NOT EXISTS generation_entity (
  generation_id TEXT NOT NULL REFERENCES generation(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  placeholder TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_generation_entity_gen ON generation_entity(generation_id);
`

// CinemaStudio tables (ADR: cinema-studio). Exec'd with the main DDL — all
// CREATE ... IF NOT EXISTS, so re-running on every boot is a no-op. These are
// the composition layer OVER generations: a film owns ordered shots (each may
// cite a generation), audio tracks (each cites an audio generation), and render
// jobs (ffmpeg mp4s). No table here touches the credit ledger — a render spends
// our CPU, not a provider invoice (ADR §2), so film_render carries no cost.
export const FILM_DDL = `
CREATE TABLE IF NOT EXISTS film (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  default_style_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_film_user_updated ON film(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS shot (
  id TEXT PRIMARY KEY,
  film_id TEXT NOT NULL REFERENCES film(id) ON DELETE CASCADE,
  -- Real-valued sort key (REAL, not INTEGER): reorder spaces values out and
  -- midpoint-inserts, so moving a shot is one UPDATE, never a whole renumber.
  order_index REAL NOT NULL,
  -- The generation whose media this shot plays; NULL = a title card with no
  -- footage (solid background + overlay). No FK: a generation may be deleted
  -- from the gallery while a film still references it — the shot then reads as
  -- an empty slot rather than cascading the film away.
  generation_id TEXT,
  prompt TEXT NOT NULL DEFAULT '',
  prompt_preset_json TEXT,
  duration_ms INTEGER NOT NULL,
  trim_start_ms INTEGER NOT NULL DEFAULT 0,
  transition TEXT NOT NULL DEFAULT 'none',
  transition_ms INTEGER NOT NULL DEFAULT 0,
  title_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shot_film_order ON shot(film_id, order_index);

CREATE TABLE IF NOT EXISTS film_audio (
  id TEXT PRIMARY KEY,
  film_id TEXT NOT NULL REFERENCES film(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  -- Cites an audio generation (generation.type = 'audio'). No FK for the same
  -- reason as shot.generation_id — a deleted generation leaves an empty ref,
  -- it does not cascade the film's audio track away.
  generation_id TEXT NOT NULL,
  start_ms INTEGER NOT NULL DEFAULT 0,
  gain_db REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_film_audio_film ON film_audio(film_id);

CREATE TABLE IF NOT EXISTS film_render (
  id TEXT PRIMARY KEY,
  film_id TEXT NOT NULL REFERENCES film(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  progress INTEGER,
  media_json TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_film_render_film ON film_render(film_id, created_at DESC);
`
