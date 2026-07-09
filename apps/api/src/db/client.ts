// SQLite + drizzle factory (plan Task 4). One function owns connection setup so
// prod (file db) and tests (':memory:') get identical pragmas and bootstrap DDL.
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from './schema'
import { DDL, ENTITY_DDL, FILM_DDL, REFUND_ONCE_INDEX_DDL } from './ddl'

export type Db = ReturnType<typeof createDb>['db']

export function createDb(path: string) {
  // File-backed dbs need their parent dir (./data) to exist; ':memory:' must not
  // touch the filesystem at all (tests run without any disk side effects).
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  // WAL: readers don't block the writer (API + polling reads share one file).
  sqlite.pragma('journal_mode = WAL')
  // SQLite ships with FK enforcement OFF; our cascades rely on it being ON.
  sqlite.pragma('foreign_keys = ON')
  // Idempotent bootstrap — CREATE IF NOT EXISTS, safe to run on every boot.
  sqlite.exec(DDL)
  // Entity library tables — separate constant, same idempotent contract
  sqlite.exec(ENTITY_DDL)
  // CinemaStudio tables (film/shot/film_audio/film_render) — separate constant,
  // same idempotent CREATE IF NOT EXISTS contract.
  sqlite.exec(FILM_DDL)
  // Micro-migrations: CREATE TABLE IF NOT EXISTS never alters tables that
  // already exist, so columns added after a db file was first created must be
  // back-filled here (SQLite has no ADD COLUMN IF NOT EXISTS). Guarded by
  // pragma table_info so re-runs are no-ops.
  const generationColumns = (
    sqlite.pragma('table_info(generation)') as Array<{ name: string }>
  ).map((column) => column.name)
  if (!generationColumns.includes('error_code')) {
    // error_code: machine-readable failure reason (e.g. 'content_blocked') —
    // added for the NSFW safety-filter handling; see modules/generations.
    sqlite.exec('ALTER TABLE generation ADD COLUMN error_code TEXT')
  }
  if (!generationColumns.includes('provider')) {
    // provider: which video backend ran the job (VideoProvider seam). Additive
    // and back-compat — every pre-existing row (and every image row) predates
    // self-host, so DEFAULT 'runware' backfills them correctly in one statement.
    // The legacy runware_task_uuid / runware_cost_usd columns are REUSED as the
    // neutral provider job id / cost (see schema.ts), so no further migration is
    // needed; this is the whole additive DB change for the wan-runpod provider.
    sqlite.exec("ALTER TABLE generation ADD COLUMN provider TEXT NOT NULL DEFAULT 'runware'")
  }
  // CinemaStudio (ADR cinema-studio §3): composed_prompt = what the model saw,
  // prompt_preset_json = the structured preset echoed back. Both nullable and
  // additive — legacy rows read NULL and fall back to `prompt`.
  if (!generationColumns.includes('composed_prompt')) {
    sqlite.exec('ALTER TABLE generation ADD COLUMN composed_prompt TEXT')
  }
  if (!generationColumns.includes('prompt_preset_json')) {
    sqlite.exec('ALTER TABLE generation ADD COLUMN prompt_preset_json TEXT')
  }
  // DB-level refund-once backstop (review finding): UNIQUE(generation_id,
  // kind) makes a duplicate refund (or charge) ledger row physically
  // impossible even if a future code path bypasses the ledger's transactional
  // guard. Exec'd SEPARATELY from the main DDL and wrapped in try/catch on
  // purpose: no healthy database should contain duplicates (the app-level
  // guard has enforced refund-once since day one), but IF a legacy file does,
  // CREATE UNIQUE INDEX throws — and bricking the boot over a backstop we can
  // live without is worse than running on the app-level guard alone. Log the
  // skip so the operator knows the ledger needs manual repair.
  try {
    sqlite.exec(REFUND_ONCE_INDEX_DDL)
  } catch (err) {
    console.warn(
      '[db] refund-once unique index skipped (legacy duplicate ledger rows?) —',
      err instanceof Error ? err.message : err,
    )
  }
  // Pass the schema so db.query.* and better-auth's drizzle adapter can
  // resolve tables by name.
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}
