// SQLite + drizzle factory (plan Task 4). One function owns connection setup so
// prod (file db) and tests (':memory:') get identical pragmas and bootstrap DDL.
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from './schema'
import {
  DDL,
  ENTITY_DDL,
  FILM_DDL,
  MODEL3D_DDL,
  ASSET3D_DDL,
  CANVAS_DDL,
  REFUND_ONCE_INDEX_DDL,
} from './ddl'

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
  // Studio3D tables (model_render/model_share) — same contract again. Adding
  // 'model3d' as a generation type needs NO DDL at all (generation.type is TEXT
  // with a TS-level enum), so these two tables are the feature's whole DB surface.
  sqlite.exec(MODEL3D_DDL)
  // Modular 3D Assets (ADR modular-3d-assets): two brand-new tables (asset3d,
  // asset3d_part), so only the idempotent CREATE IF NOT EXISTS exec is needed —
  // no micro-migration guard.
  sqlite.exec(ASSET3D_DDL)
  // Canvas Mode (ADR canvas-mode): three brand-new tables, so only the
  // idempotent CREATE IF NOT EXISTS exec is needed — no micro-migration guard.
  sqlite.exec(CANVAS_DDL)
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
  // user.role: 'user' | 'super_admin' (dev super-admin seed). DEFAULT 'user'
  // backfills every pre-existing account as a plain user in one statement —
  // which is what they all are; the only super_admin is written by the
  // dev-only seed (modules/auth/dev-admin.ts) at boot.
  const userColumns = (sqlite.pragma('table_info(user)') as Array<{ name: string }>).map(
    (column) => column.name,
  )
  if (!userColumns.includes('role')) {
    sqlite.exec("ALTER TABLE user ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
  }
  // Template catalog (ADR: template-catalog). Three additive, nullable columns —
  // every pre-existing film/shot reads NULL and behaves exactly as before:
  //  · shot.model_id      the model this shot generates with. Was transient
  //                       inspector state (defaulted to videoModels[0] on every
  //                       mount); persisting it is what lets a template pin a tier.
  //  · shot.voiceover_json  { text, voice } — the spoken line, as authored copy.
  //                       A draft slot: film_audio needs a generation_id, so a
  //                       template previously could not ship a script without
  //                       first charging for the TTS.
  //  · film.template_id   provenance, so the audio panel can offer the template's
  //                       music prompt and so we can ask which templates convert.
  const shotColumns = (sqlite.pragma('table_info(shot)') as Array<{ name: string }>).map(
    (column) => column.name,
  )
  if (!shotColumns.includes('model_id')) {
    sqlite.exec('ALTER TABLE shot ADD COLUMN model_id TEXT')
  }
  if (!shotColumns.includes('voiceover_json')) {
    sqlite.exec('ALTER TABLE shot ADD COLUMN voiceover_json TEXT')
  }
  //  · shot.entity_refs_json  the shot's CAST: which characters are tagged in it.
  //    Additive and nullable — an existing film simply has no tags, which is what
  //    it always meant. Nothing to backfill.
  if (!shotColumns.includes('entity_refs_json')) {
    sqlite.exec('ALTER TABLE shot ADD COLUMN entity_refs_json TEXT')
  }
  //  · shot.audio  native generation audio (0/1). DEFAULT 0 backfills every
  //    pre-feature shot as silent — exactly what those clips are.
  if (!shotColumns.includes('audio')) {
    sqlite.exec('ALTER TABLE shot ADD COLUMN audio INTEGER NOT NULL DEFAULT 0')
  }
  //  · shot.reference_images_json  arbitrary images ATTACHED to the shot as
  //    references (JSON array of { id, path }). Additive and nullable — an existing
  //    shot simply has nothing attached, which reads identically to the old shape.
  if (!shotColumns.includes('reference_images_json')) {
    sqlite.exec('ALTER TABLE shot ADD COLUMN reference_images_json TEXT')
  }
  const filmColumns = (sqlite.pragma('table_info(film)') as Array<{ name: string }>).map(
    (column) => column.name,
  )
  if (!filmColumns.includes('template_id')) {
    sqlite.exec('ALTER TABLE film ADD COLUMN template_id TEXT')
  }
  //  · film_audio.shot_id  which shot a voiceover track belongs to. Without it the
  //                        editor cannot tell whether a shot is already voiced, so
  //                        a second click on "Voice this shot" would append a
  //                        second overlapping track AND charge for it again.
  const filmAudioColumns = (sqlite.pragma('table_info(film_audio)') as Array<{ name: string }>).map(
    (column) => column.name,
  )
  if (!filmAudioColumns.includes('shot_id')) {
    sqlite.exec('ALTER TABLE film_audio ADD COLUMN shot_id TEXT')
  }
  // Soul Studio (ADR ai-soul-studio). Two additive, nullable columns — the whole
  // DB surface of the feature. Nothing is backfilled and nothing needs to be:
  //  · entity.soul       the structured character spec (JSON). NULL is not a gap,
  //                      it is the legacy entity's meaning: "free prose, no
  //                      constructor". So the expand step IS the migration — there
  //                      is no contract step, and rolling the code back leaves a
  //                      column the old writers simply never read.
  //  · entity_image.view which slot of the reference sheet a photo fills. NULL =
  //                      an ordinary upload, which is exactly what every existing
  //                      row is. Re-rolling a view replaces the row holding it,
  //                      so without this column a re-roll would silently append.
  // entity_image.source gaining 'generated' needs NO statement here: the column is
  // plain TEXT and the enum lives only in TypeScript.
  const entityColumns = (sqlite.pragma('table_info(entity)') as Array<{ name: string }>).map(
    (column) => column.name,
  )
  if (!entityColumns.includes('soul')) {
    sqlite.exec('ALTER TABLE entity ADD COLUMN soul TEXT')
  }
  const entityImageColumns = (
    sqlite.pragma('table_info(entity_image)') as Array<{ name: string }>
  ).map((column) => column.name)
  if (!entityImageColumns.includes('view')) {
    sqlite.exec('ALTER TABLE entity_image ADD COLUMN view TEXT')
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
