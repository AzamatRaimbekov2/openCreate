// SQLite + drizzle factory (plan Task 4). One function owns connection setup so
// prod (file db) and tests (':memory:') get identical pragmas and bootstrap DDL.
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from './schema'
import { DDL } from './ddl'

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
  // Pass the schema so db.query.* and better-auth's drizzle adapter can
  // resolve tables by name.
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}
