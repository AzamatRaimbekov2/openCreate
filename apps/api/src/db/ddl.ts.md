# ddl.ts — AI component doc

> AI-facing sidecar for `ddl.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Literal, idempotent `CREATE TABLE IF NOT EXISTS` SQL for all six tables + two hot-path indexes (plan Task 4). Replaces drizzle-kit migrations for the MVP so `:memory:` test databases bootstrap identically to the file db.

## What it does (for an AI reader)
- Responsibilities: hold the exact SQL mirror of `schema.ts` (snake_case columns, INTEGER epoch-ms timestamps, INTEGER 0/1 booleans, FK cascades).
- Public API / exports: `DDL` (string).
- Inputs → Outputs: none → executed once per `createDb()` call via `sqlite.exec(DDL)`.
- Side effects: none by itself (execution happens in `client.ts`).

## Dependencies
- Imports / depends on: nothing.
- Used by: `db/client.ts`.

## Diagram
```mermaid
flowchart LR
  S[schema.ts] -. must mirror .-> D[ddl.ts DDL string] --> E[sqlite.exec in createDb]
```

## Key decisions / gotchas
- Indexes: `idx_generation_user_created(user_id, created_at DESC)` and `idx_credit_tx_user(user_id, created_at DESC)` back the library list and transactions endpoints.
- Idempotent by construction — safe to run on every boot; adding a column later requires a guarded `ALTER TABLE` micro-migration in `client.ts` (CREATE IF NOT EXISTS never alters existing tables).
- `generation.error_code` (nullable TEXT) mirrors `schema.ts` — machine-readable failure reason (`content_blocked` for NSFW safety blocks); back-filled for older db files by `client.ts`.

## Commits
- 273e3f4 feat(api): drizzle schema + sqlite bootstrap DDL
- 3b96d8c fix(api,web,contracts): respect the NSFW flag — content_blocked failure with refund, never store flagged assets, localized safety copy
