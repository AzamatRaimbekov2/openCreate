# drizzle.config.ts — AI component doc

> AI-facing sidecar for `drizzle.config.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
drizzle-kit configuration (plan file map). Not used at runtime — MVP bootstraps tables via `src/db/ddl.ts`. Exists so `drizzle-kit generate/studio` can introspect the schema when real migrations are adopted post-MVP.

## What it does (for an AI reader)
- Responsibilities: point drizzle-kit at `src/db/schema.ts`, sqlite dialect, `./drizzle` output dir, db path from `DATABASE_PATH`.
- Public API / exports: default export — drizzle-kit `defineConfig` object.
- Inputs → Outputs: schema file → generated migration SQL / studio session (tooling only).
- Side effects: none at runtime.

## Dependencies
- Imports / depends on: `drizzle-kit` (dev dep).
- Used by: drizzle-kit CLI only; nothing in `src/` imports it.

## Diagram
```mermaid
flowchart LR
  K[drizzle-kit CLI] --> CFG[drizzle.config.ts] --> SCH[src/db/schema.ts]
```

## Key decisions / gotchas
- Runtime table creation stays in `ddl.ts` (works for `:memory:` tests); do not wire drizzle-kit migrations into boot without replacing that bootstrap.

## Commits
- 273e3f4 feat(api): drizzle schema + sqlite bootstrap DDL
