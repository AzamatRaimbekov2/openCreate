// Studio3D Task 8: the render/share tables. These assertions are structural, not
// behavioural — they pin the two properties that a later edit could silently break:
// the bootstrap must survive a SECOND boot (ddl.ts re-runs on every start), and
// model_render must never grow a cost column (ADR D3: a render spends our compute,
// not a provider invoice — a cost column here is an open invitation to wire it to
// the credit ledger, which is the one thing this table must never touch).
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { DDL, ENTITY_DDL, FILM_DDL, MODEL3D_DDL, REFUND_ONCE_INDEX_DDL } from '../src/db/ddl'

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
