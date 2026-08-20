// drizzle-kit config for the Postgres path (Postgres migration, step 1).
// Separate from drizzle.config.ts (SQLite, still the live path) so
// `drizzle-kit generate`/`migrate` never touches the SQLite output by
// accident: `pnpm db:pg:generate` / `pnpm db:pg:migrate` pass
// `--config drizzle.config.pg.ts` explicitly.
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.pg.ts',
  out: './drizzle-pg',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://opencreate:opencreate@localhost:5432/opencreate',
  },
})
