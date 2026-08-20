// Postgres client factory (Postgres migration, step 1 — groundwork only, NOT
// wired into index.ts/app.ts yet). Unlike client.ts's SQLite path (which
// bootstraps tables with a hand-rolled idempotent DDL.exec() on every boot),
// schema changes here go through drizzle-kit's generated migrations
// (drizzle-pg/*.sql, applied via `pnpm db:pg:migrate`) — the standard,
// versioned approach a real Postgres deployment should use, rather than
// reinventing SQLite's bootstrap-on-boot trick for a database that already
// has a real migration story.
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.pg'

export type PgDb = ReturnType<typeof createPgDb>['db']

export function createPgDb(connectionString: string) {
  const client = postgres(connectionString)
  // Pass the schema so db.query.* and better-auth's drizzle adapter can
  // resolve tables by name — mirrors client.ts's `drizzle(sqlite, { schema })`.
  const db = drizzle(client, { schema })
  return { db, client }
}
