// drizzle-kit config (plan file map). NOT used at runtime — the MVP bootstraps
// tables via src/db/ddl.ts inside createDb(). This exists so `pnpm dlx drizzle-kit
// generate/studio` can introspect the schema when real migrations are adopted.
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_PATH ?? './data/opencreate.db' },
})
