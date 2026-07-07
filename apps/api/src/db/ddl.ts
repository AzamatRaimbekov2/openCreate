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
  runware_task_uuid TEXT,
  runware_cost_usd TEXT,
  media_json TEXT NOT NULL DEFAULT '[]',
  progress INTEGER,
  error_message TEXT,
  error_code TEXT,
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
