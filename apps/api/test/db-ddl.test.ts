// Studio3D Task 8: the render/share tables. These assertions are structural, not
// behavioural — they pin the two properties that a later edit could silently break:
// the bootstrap must survive a SECOND boot (ddl.ts re-runs on every start), and
// model_render must never grow a cost column (ADR D3: a render spends our compute,
// not a provider invoice — a cost column here is an open invitation to wire it to
// the credit ledger, which is the one thing this table must never touch).
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDb } from '../src/db/client'
import {
  ASSET3D_DDL,
  CANVAS_DDL,
  CREATOR_DDL,
  DDL,
  ENTITY_DDL,
  FILM_DDL,
  MODEL3D_DDL,
  REFUND_ONCE_INDEX_DDL,
} from '../src/db/ddl'

describe('MODEL3D_DDL', () => {
  const boot = () => {
    const db = new Database(':memory:')
    for (const sql of [DDL, REFUND_ONCE_INDEX_DDL, ENTITY_DDL, FILM_DDL, MODEL3D_DDL]) db.exec(sql)
    return db
  }

  it('creates model_render and model_share', () => {
    const db = boot()
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r) => (r as { name: string }).name)
    expect(names).toContain('model_render')
    expect(names).toContain('model_share')
  })

  it('is idempotent — booting twice does not throw', () => {
    // ddl.ts runs on EVERY boot; a non-idempotent statement crashes the second start.
    const db = boot()
    expect(() => db.exec(MODEL3D_DDL)).not.toThrow()
  })

  it('carries no cost or credit column on model_render', () => {
    // A render spends OUR compute, not a provider invoice (ADR D3, film_render
    // precedent). A cost column here would invite someone to wire it to the ledger.
    const db = boot()
    const cols = db
      .prepare(`PRAGMA table_info(model_render)`)
      .all()
      .map((c) => (c as { name: string }).name)
    expect(cols).not.toContain('cost_credits')
    expect(cols).not.toContain('cost_usd')
  })

  it('one share per generation — re-sharing must not mint a second token', () => {
    // The share id IS the public token. Without this unique index, "Share" clicked
    // twice would leave two live tokens for one model and revoking (a DELETE) would
    // only kill one of them, leaving the model quietly public.
    const db = boot()
    const insert = db.prepare(
      `INSERT INTO model_share (id, user_id, generation_id, created_at) VALUES (?, ?, ?, ?)`,
    )
    db.prepare(
      `INSERT INTO user (id, email, email_verified, created_at, updated_at) VALUES ('u1','a@b.c',0,0,0)`,
    ).run()
    insert.run('tok-1', 'u1', 'gen-1', 0)
    expect(() => insert.run('tok-2', 'u1', 'gen-1', 0)).toThrow()
  })
})

// I2 (fix-wave): this file had zero assertions for asset3d/asset3d_part despite
// schema.ts.md claiming it pinned their shape — that claim was false (it pinned
// nothing for them). This block makes the claim true: shape + idempotence +
// the citation-not-FK law (imageGenerationId/meshGenerationId are bare TEXT, no
// REFERENCES, so a deleted generation orphans the citation instead of cascading
// the part away — ADR modular-3d-assets).
describe('ASSET3D_DDL', () => {
  const boot = () => {
    const db = new Database(':memory:')
    for (const sql of [DDL, REFUND_ONCE_INDEX_DDL, ASSET3D_DDL]) db.exec(sql)
    return db
  }

  it('creates asset3d and asset3d_part', () => {
    const db = boot()
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r) => (r as { name: string }).name)
    expect(names).toContain('asset3d')
    expect(names).toContain('asset3d_part')
  })

  it('is idempotent — booting twice does not throw', () => {
    const db = boot()
    expect(() => db.exec(ASSET3D_DDL)).not.toThrow()
  })

  it('asset3d_part cites generations by bare id — no FK to generation', () => {
    const db = boot()
    const fks = db
      .prepare(`PRAGMA foreign_key_list(asset3d_part)`)
      .all()
      .map((f) => (f as { table: string }).table)
    expect(fks).toContain('asset3d')
    expect(fks).not.toContain('generation')
  })
})

// I2 (fix-wave, C1's underlying spec §5): shape + idempotence + the SAME
// citation-not-FK law for canvas_node's generation_ids_json (a JSON array, not
// a column, so it can never be an FK target — this test pins that canvas_node's
// only REFERENCES is its owning canvas) and canvas_edge (owns no FK to
// canvas_node either — the endpoints are validated at the SERVICE layer, see
// service.ts validateGraph, not enforced by SQLite).
describe('CANVAS_DDL', () => {
  const boot = () => {
    const db = new Database(':memory:')
    for (const sql of [DDL, REFUND_ONCE_INDEX_DDL, CANVAS_DDL]) db.exec(sql)
    return db
  }

  it('creates canvas, canvas_node and canvas_edge', () => {
    const db = boot()
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r) => (r as { name: string }).name)
    expect(names).toContain('canvas')
    expect(names).toContain('canvas_node')
    expect(names).toContain('canvas_edge')
  })

  it('is idempotent — booting twice does not throw', () => {
    const db = boot()
    expect(() => db.exec(CANVAS_DDL)).not.toThrow()
  })

  it('canvas_node has no FK to generation (generation_ids_json is a citation, not a column)', () => {
    const db = boot()
    const fks = db
      .prepare(`PRAGMA foreign_key_list(canvas_node)`)
      .all()
      .map((f) => (f as { table: string }).table)
    expect(fks).toContain('canvas')
    expect(fks).not.toContain('generation')
  })

  it('canvas_edge has no FK to canvas_node — endpoints are validated at the service layer', () => {
    const db = boot()
    const fks = db
      .prepare(`PRAGMA foreign_key_list(canvas_edge)`)
      .all()
      .map((f) => (f as { table: string }).table)
    expect(fks).toContain('canvas')
    expect(fks).not.toContain('canvas_node')
    expect(fks).not.toContain('generation')
  })
})

// openCreator (ADR opencreator-agent, Task 2). Shape + idempotence, plus the two
// properties the BUDGET GATE rests on: `confirmed` exists and defaults to 0 (a
// brand-new session can never spend), and a message CITES artifacts inside
// content_json rather than through an FK (deleting a generation must leave a
// stale citation in the chat, never cascade the conversation away).
describe('CREATOR_DDL', () => {
  const boot = () => {
    const db = new Database(':memory:')
    for (const sql of [DDL, REFUND_ONCE_INDEX_DDL, CREATOR_DDL]) db.exec(sql)
    return db
  }

  it('creates creator_session and creator_message', () => {
    const db = boot()
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r) => (r as { name: string }).name)
    expect(names).toContain('creator_session')
    expect(names).toContain('creator_message')
  })

  it('is idempotent — booting twice does not throw', () => {
    const db = boot()
    expect(() => db.exec(CREATOR_DDL)).not.toThrow()
  })

  it('confirmed defaults to 0 — a fresh session structurally cannot spend', () => {
    // THE budget gate's foundation (ADR D2): tools.ts refuses start_generation
    // while this flag is 0, so a column that defaulted to 1 (or was nullable and
    // read as truthy) would hand a brand-new session the user's whole balance.
    const db = boot()
    db.prepare(
      `INSERT INTO user (id, email, email_verified, created_at, updated_at) VALUES ('u1','a@b.c',0,0,0)`,
    ).run()
    db.prepare(
      `INSERT INTO creator_session (id, user_id, title, status, created_at, updated_at)
       VALUES ('s1','u1','t','idle',0,0)`,
    ).run()
    const row = db.prepare(`SELECT confirmed FROM creator_session WHERE id='s1'`).get()
    expect((row as { confirmed: number }).confirmed).toBe(0)
  })

  it('creator_message cascades from its session and cites artifacts without FKs', () => {
    const db = boot()
    db.pragma('foreign_keys = ON')
    const fks = db
      .prepare(`PRAGMA foreign_key_list(creator_message)`)
      .all()
      .map((f) => (f as { table: string }).table)
    expect(fks).toContain('creator_session')
    // A step message names a canvas/entity/generation inside content_json. No FK:
    // a gallery delete must leave the chat readable, not erase the conversation.
    expect(fks).not.toContain('generation')
    expect(fks).not.toContain('canvas')
    expect(fks).not.toContain('entity')
  })

  it('deleting a session removes its messages (owned, unlike the citations)', () => {
    const db = boot()
    db.pragma('foreign_keys = ON')
    db.prepare(
      `INSERT INTO user (id, email, email_verified, created_at, updated_at) VALUES ('u1','a@b.c',0,0,0)`,
    ).run()
    db.prepare(
      `INSERT INTO creator_session (id, user_id, title, status, created_at, updated_at)
       VALUES ('s1','u1','t','idle',0,0)`,
    ).run()
    db.prepare(
      `INSERT INTO creator_message (id, session_id, role, content_json, created_at)
       VALUES ('m1','s1','user','{"kind":"text","text":"hi"}',0)`,
    ).run()
    db.prepare(`DELETE FROM creator_session WHERE id='s1'`).run()
    const left = db.prepare(`SELECT COUNT(*) AS n FROM creator_message`).get()
    expect((left as { n: number }).n).toBe(0)
  })
})

// film.batch_id (ADR: shorts-studio §2). The column is nullable and additive, so
// the interesting part is not the column — it is the INDEX, and the order the two
// statements run in.
//
// CREATE TABLE IF NOT EXISTS is a no-op on a database that already has `film`, so
// on an existing volume batch_id does not exist until client.ts's ALTER TABLE
// runs — which is AFTER the DDL exec. An index on batch_id written inside
// FILM_DDL would therefore pass every fresh-volume test and brick the boot of
// every deployed one with "no such column: batch_id". That is why it lives in its
// own constant, and this is the test that keeps it there.
describe('film.batch_id on an existing volume', () => {
  // A film table exactly as it was BEFORE this feature: no batch_id.
  const LEGACY_FILM_DDL = `
    CREATE TABLE film (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL,
      default_style_id TEXT,
      template_id TEXT,
      cover_image_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );`

  // The real boot path against a FILE, because ':memory:' is always a fresh
  // volume and can never model the case this test exists for.
  const bootOntoLegacyFile = () => {
    const path = join(mkdtempSync(join(tmpdir(), 'oc-batchid-')), 'app.db')
    const legacy = new Database(path)
    legacy.exec(LEGACY_FILM_DDL)
    legacy
      .prepare(
        `INSERT INTO film (id, user_id, title, aspect_ratio, created_at, updated_at)
         VALUES ('old-film', 'u1', 'Старый фильм', '16:9', 0, 0)`,
      )
      .run()
    legacy.close()
    return path
  }

  it('adds the column and its index without bricking the boot', () => {
    const path = bootOntoLegacyFile()
    const { sqlite } = createDb(path)

    const columns = (sqlite.pragma('table_info(film)') as Array<{ name: string }>).map(
      (c) => c.name,
    )
    expect(columns).toContain('batch_id')

    const indexes = (sqlite.pragma('index_list(film)') as Array<{ name: string }>).map(
      (i) => i.name,
    )
    expect(indexes).toContain('idx_film_user_batch')

    // The pre-existing film survives, reading NULL — which is not a gap, it is
    // the truth about a film that was made on its own.
    const old = sqlite.prepare(`SELECT batch_id FROM film WHERE id='old-film'`).get()
    expect((old as { batch_id: string | null }).batch_id).toBeNull()
  })

  it('is idempotent — the second boot of the same file is a no-op', () => {
    const path = bootOntoLegacyFile()
    createDb(path).sqlite.close()
    expect(() => createDb(path)).not.toThrow()
  })
})
