# schema.ts — AI component doc

> AI-facing sidecar for `schema.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Drizzle table definitions (plan Task 4): better-auth's four default tables (`user`, `session`, `account`, `verification` — singular names so the drizzle adapter maps 1:1) plus domain tables `generation` and `credit_transaction`.

## What it does (for an AI reader)
- Responsibilities: define column types/constraints; snake_case on disk ↔ camelCase in TS; `timestamp_ms` mode for all dates; `user.creditsBalance` is the denormalized balance.
- Public API / exports: `user`, `session`, `account`, `verification`, `generation`, `creditTransaction` table objects.
- Inputs → Outputs: none (declarative) → typed query builders via `drizzle(sqlite, { schema })`.
- Side effects: none — DDL execution lives in `ddl.ts`/`client.ts`.

## Dependencies
- Imports / depends on: `drizzle-orm/sqlite-core`.
- Used by: `db/client.ts`, `modules/auth/auth.ts` (adapter schema), `modules/credits/ledger.ts`, `modules/users/routes.ts`, `modules/credits/routes.ts`, later `modules/generations/*`; mirrored by `db/ddl.ts`.

## Diagram
```mermaid
erDiagram
  user ||--o{ session : has
  user ||--o{ account : has
  user ||--o{ generation : owns
  user ||--o{ credit_transaction : ledger
  generation ||--o{ credit_transaction : "charge/refund via generation_id"
```

## Key decisions / gotchas
- ANY change here MUST be mirrored in `ddl.ts` (idempotent SQL bootstrap) — there are no drizzle-kit migrations in MVP. Columns added AFTER first ship also need a guarded `ALTER TABLE` micro-migration in `client.ts` (CREATE IF NOT EXISTS never alters existing tables).
- `generation.errorCode` (`error_code`, nullable) is the machine-readable failure reason — today only `'content_blocked'` for NSFW safety blocks, so the SPA can localize the message instead of echoing raw provider text.
- `creditsBalance` is mutated ONLY inside the same transaction as a `credit_transaction` row (ledger invariant).
- `credit_transaction.amount` is signed: negative for `charge`, positive for `signup_bonus`/`refund`.

## Commits
- 273e3f4 feat(api): drizzle schema + sqlite bootstrap DDL
- 3b96d8c fix(api,web,contracts): respect the NSFW flag — content_blocked failure with refund, never store flagged assets, localized safety copy

## Key decisions (2026-07-09) — wan-runpod
- Added `provider: text(provider).notNull().default(runware)` to `generation` (VideoProvider seam). `.default()` makes it optional in `$inferInsert` (SQLite applies the default for image/legacy rows). The neutral provider job id / cost REUSE `runwareTaskUuid` / `runwareCostUsd` (no rename — keeps money-path code byte-for-byte, instant rollback). Mirror in `ddl.ts` + `client.ts` micro-migration.

## Key decisions (2026-07-09) — CinemaStudio
- `generation.type` enum gains `'audio'`; two nullable columns `composedPrompt` / `promptPresetJson` added (mirror `ddl.ts` + `client.ts` micro-migration).
- Four new tables: `film`, `shot`, `filmAudio`, `filmRender`. `shot.orderIndex` is `real()` (spaced reorder). `shot.generationId` / `filmAudio.generationId` have **no** `.references()` — a deleted generation leaves an empty ref, it does not cascade the film. `filmRender` has no cost/refund column (CPU, not a provider invoice); `mediaJson` mirrors `generation.mediaJson`'s `[url]` array shape so the same serve path is reused. `real` added to the drizzle-orm import.
