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
- **`style`** (ADR style-studio D2, 2026-07-31): the USER half of the style registry. Builtins are
  deliberately NOT rows — they are code, so a template or a film default can cite one without the db
  existing. `previewGenerationId` cites a generation with no reference (same rule as
  `shot.generationId`): deleting the generation empties the preview instead of cascading the style
  away, and ownership is re-checked whenever the preview is read.
- ANY change here MUST be mirrored in `ddl.ts` (idempotent SQL bootstrap) — there are no drizzle-kit migrations in MVP. Columns added AFTER first ship also need a guarded `ALTER TABLE` micro-migration in `client.ts` (CREATE IF NOT EXISTS never alters existing tables).
- `generation.errorCode` (`error_code`, nullable) is the machine-readable failure reason — today only `'content_blocked'` for NSFW safety blocks, so the SPA can localize the message instead of echoing raw provider text.
- `creditsBalance` is mutated ONLY inside the same transaction as a `credit_transaction` row (ledger invariant).
- `credit_transaction.amount` is signed: negative for `charge`, positive for `signup_bonus`/`refund`.

## Update 2026-07-15 — shot.audio
- `shot` += `audio integer(boolean) NOT NULL DEFAULT false` — native generation
  audio intent. DEFAULT 0 backfills legacy rows silent (what those clips are).

## Update 2026-07-21 — shot.referenceImagesJson
- `shot` += `referenceImagesJson text('reference_images_json')` (nullable) — arbitrary
  images ATTACHED to a shot as generation references, stored as a JSON array of
  `{ id, path }`, parallel to `entity_refs_json`. On the shot (not the generation) so an
  attachment survives a re-generate. Mirror in `ddl.ts` + a guarded `ALTER TABLE shot ADD
  COLUMN reference_images_json TEXT` micro-migration in `client.ts` (post-ship column).

## Commits
- 273e3f4 feat(api): drizzle schema + sqlite bootstrap DDL
- 3b96d8c fix(api,web,contracts): respect the NSFW flag — content_blocked failure with refund, never store flagged assets, localized safety copy
- 81c26c8 feat(canvas): canvas/canvas_node/canvas_edge tables
- fe8fdba feat(creator): session/message tables

## Key decisions (2026-07-09) — wan-runpod
- Added `provider: text(provider).notNull().default(runware)` to `generation` (VideoProvider seam). `.default()` makes it optional in `$inferInsert` (SQLite applies the default for image/legacy rows). The neutral provider job id / cost REUSE `runwareTaskUuid` / `runwareCostUsd` (no rename — keeps money-path code byte-for-byte, instant rollback). Mirror in `ddl.ts` + `client.ts` micro-migration.

## Key decisions (2026-07-09) — CinemaStudio
- `generation.type` enum gains `'audio'`; two nullable columns `composedPrompt` / `promptPresetJson` added (mirror `ddl.ts` + `client.ts` micro-migration).
- Four new tables: `film`, `shot`, `filmAudio`, `filmRender`. `shot.orderIndex` is `real()` (spaced reorder). `shot.generationId` / `filmAudio.generationId` have **no** `.references()` — a deleted generation leaves an empty ref, it does not cascade the film. `filmRender` has no cost/refund column (CPU, not a provider invoice); `mediaJson` mirrors `generation.mediaJson`'s `[url]` array shape so the same serve path is reused. `real` added to the drizzle-orm import.

## Key decisions (2026-07-11) — template catalog
Three tables gain one nullable column each. All additive: every pre-existing row reads NULL and
behaves exactly as before. Mirrored in `ddl.ts` (`FILM_DDL`) **and** guarded by `client.ts`
micro-migrations, because `CREATE TABLE IF NOT EXISTS` never alters a table that already exists.

- **`shot.modelId`** (`model_id TEXT`) — the catalog model this shot generates with; NULL = no opinion
  (fall back to the style's recommendation, then the first video model). Before this column the model
  was transient inspector state: re-selecting a shot forgot which model made its clip, and a template
  had nowhere to pin its price/quality tier.
- **`shot.voiceoverJson`** (`voiceover_json TEXT`) — `{ text, voice }`, the line this shot's character
  speaks, as authored copy. A DRAFT SLOT, not an asset: `film_audio` requires a `generation_id`, so
  before this column there was no way to hand a user a script without first generating (and charging
  for) the TTS. Generating it produces an audio generation and files a `film_audio` track at this
  shot's timeline offset.
- **`film.templateId`** (`template_id TEXT`) — which template this film was instantiated from; NULL for
  a hand-made film. **Deliberately NOT an FK**: templates are code, not rows — retiring one from the
  catalog must leave old films intact, just unlinked.
- **`filmAudio.shotId`** (`shot_id TEXT`) — the shot a voiceover track belongs to; NULL = a film-wide
  bed. It is what makes "voice this shot" a REPLACE rather than an append (without it, a second click
  adds a second overlapping track and charges again). **No FK on purpose**: the film cascade already
  removes these rows, and a stale link should read as an unattached track, not delete someone's audio.

## Key decisions (2026-07-12) — Studio3D
- **`generation.type` enum widens to `['image','video','audio','model3d']`.** This is a **TYPE-LEVEL
  change only — there is NO DDL change and NO migration.** SQLite has no `ENUM` type: the column is and
  always was plain `TEXT`, and the drizzle `{ enum: [...] }` list is a compile-time refinement drizzle
  applies to `$inferSelect`/`$inferInsert`, not a database constraint. Widening it is therefore purely
  additive and instantly reversible — every existing row keeps its exact value, and nothing in `ddl.ts`
  moves.
- It is what closes the deliberate typecheck gap left by the contracts task: `generationTypeSchema`
  already admitted `'model3d'`, so `service.ts`'s `type: model.type` in the charge+insert transaction
  could not assign until this enum admitted it too.
- The reused neutral columns carry 3D unchanged: `runwareTaskUuid` holds the Runware `3dInference`
  taskUUID (as it holds a ComfyUI `prompt_id` for wan-runpod), `runwareCostUsd` holds the mesh's actual
  invoiced cost — which SCALES with the pbr/faceLimit knobs, which is why a settled 3D row bills from
  the poll response and never from a catalog list price. `provider` stays `'runware'` on a 3D row; the
  poll path branches on `type`, not on it (see `service.ts.md`).

## Key decisions (2026-07-13) — Studio3D renders + shares
Two new tables mirroring `MODEL3D_DDL` column-for-column. Both hang off `user` with a cascade and both
reference `generation` **only by loose id**, never by FK.

- **`modelRender`** — the `filmRender` bargain applied to 3D: identical status machine, and **no
  `costCredits`, no refund, no ledger link**. A render spends our compute, not a provider invoice
  (ADR §D3). `mediaJson` keeps the array shape of `generation.mediaJson` so the existing serve/download
  path is reused rather than duplicated. `engine` is a drizzle enum (`browser | chromium | blender`)
  defaulting to `'browser'`, the only built renderer.
- **`modelShare`** — id-as-token. The uniqueness that makes sharing idempotent lives in the DDL index
  (`idx_model_share_gen`), not here; drizzle's schema object does not express it, so **`ddl.ts` is the
  source of truth for that constraint** and `test/db-ddl.test.ts` pins it.

## Key decisions (2026-07-13) — AI Soul Studio
Two additive columns on the entity library, and one widened TS enum. No new table: a soul-built
character **is** an `entity`, so it inherits ownership, soft delete and `[[e1]]` tagging for free.

- **`entity.soul`** — `text('soul')`, nullable, holds a JSON `Soul`. A JSON column rather than ten
  typed ones because nothing queries *into* it: the server reads it whole, composes text from it, and
  writes it back whole. It carries an invariant the database cannot express and the service must:
  **`soul != null` ⟹ `description` is DERIVED** (`composeSoul(soul)`), and a client-sent description
  is ignored. One writer, no override flag.
- **`entityImage.view`** — nullable drizzle enum (`front | three-quarter | profile | full-body`). It is
  what makes the sheet render in a stable order AND what makes re-rolling one view *replace* that view
  rather than append a fifth image. Without it, "re-roll the profile" and "add another photo" are the
  same write.
- **`entityImage.source`** gained `'generated'` — a TS-level widening only. The column is plain TEXT, so
  there is no DDL to change, exactly as when `generation.type` gained `'model3d'`.

## Key decisions (2026-07-16) — user.role (dev super-admin)
- `user` gains `role: text NOT NULL DEFAULT 'user'` — TEXT with a TS-level enum (`user | super_admin`), the `generation.type` pattern: no CHECK constraint to migrate when roles grow. Mirrored in `ddl.ts` CREATE TABLE + a guarded ALTER micro-migration in `client.ts`. Written as `super_admin` ONLY by the dev-only seed (`modules/auth/dev-admin.ts`); better-auth exposes it `input:false` so clients cannot self-assign.

## Key decisions (2026-07-18) — Modular 3D Assets (ADR modular-3d-assets)
Two new tables, `asset3d` and `asset3dPart`. Like `film`/`shot`, an asset is an
aggregate that **cites generations by id** — it owns no media. Mirror both tables
into `ddl.ts` (`ASSET3D_DDL`); they are brand-new, so `CREATE TABLE IF NOT EXISTS`
alone suffices — **no `client.ts` ALTER micro-migration** (that guard is only for
adding a column to a table that already ships).

- **`asset3d`** — `id`, `userId` (→ `user`, cascade), `title`, `conceptImagePath`,
  `createdAt`. `conceptImagePath` stores the FULL public path `saveDataUri`
  returns (`/media/<uuid>.<ext>`) verbatim, NOT a bare key: `readAsDataUri` needs
  the extension to resolve the mime, and it cannot be rebuilt from a bare uuid.
  It is our stored path, never a provider URL (those expire after 7 days).
- **`asset3dPart`** — `id`, `assetId` (→ `asset3d`, cascade), `name`,
  `description` (default `''`), `sortOrder` (**`real()`**, the `shot.orderIndex`
  precedent: a reorder/midpoint-insert spaces values without a whole-list
  renumber), `imageGenerationId`, `meshGenerationId`, `transformJson`, `createdAt`.
- **Citations are BARE `text()` — NO `.references()`** on `imageGenerationId` /
  `meshGenerationId`, exactly like `shot.generationId`: deleting a generation from
  the library must leave an orphaned ref, never cascade the part away. The ONLY
  cascading edges are the owner edges (`asset3d.userId`, `asset3dPart.assetId`).
- **Part status is NOT a column.** The `draft|extracting|extracted|meshing|ready`
  state is DERIVED at read time from the cited generations' live statuses (the
  films/shots lesson: a persisted status is a second source of truth). Nothing
  here stores it.
- `test/db-ddl.test.ts` pins the shape AND the citation-not-FK rule
  (`foreign_key_list(asset3d_part)` contains `asset3d`, not `generation`).

## Key decisions (2026-07-30) — Canvas Mode
Three drizzle tables mirroring `CANVAS_DDL` column-for-column (ADR `docs/wiki/decisions/canvas-mode.md`):

- **`canvas`** — `id`, `userId` (→ `user`, cascade), `title`, `viewportJson` (default
  `'{"x":0,"y":0,"zoom":1}'`), `createdAt`/`updatedAt` (`timestamp_ms`). `updatedAt` exists because the
  list is ordered by it — a canvas is a document you return to, so "recently worked on" is the useful
  order, unlike `asset3d`/`film` list ordering by creation.
- **`canvasNode`** — `id`, `canvasId` (→ `canvas`, cascade), `kind` (drizzle `enum` over the node
  kinds, TS-level only — the column is plain TEXT), `positionJson`, `configJson` (default `'{}'`),
  `generationIdsJson` (default `'[]'`), `uploadUrl` (nullable; upload nodes only).
  - **`kind` must mirror `canvasNodeKindSchema` in contracts, and only the type checker enforces
    that.** `'prompt'` (ADR `canvas-prompt-node`, 2026-08-02) shipped in contracts and the web half
    while this list still held the 7 original kinds — 862 API tests stayed green because SQLite
    accepts any TEXT, and the failure surfaced only as `TS2769` on the insert in
    `modules/canvas/service.ts`. Widening the set is a **type change only**: no CHECK constraint in
    `CANVAS_DDL`, so no migration, and old rows stay readable. When a kind is added to contracts,
    add it here in the same change.
- **`canvasEdge`** — `id`, `canvasId` (→ `canvas`, cascade), `sourceNodeId`, `targetNodeId`.
- **Citations are bare `text()` — NO `.references()`** on the ids inside `generationIdsJson` (they are
  a JSON array, not a column) and none on the edge endpoints. The only cascading edges are the owner
  edges. A gallery delete leaves an empty version on the node; it never removes the node or canvas.
- **No status/derived column.** A node's run state is DERIVED from the cited generations at read time
  in the SPA (the films/shots and asset3d lesson: a persisted status is a second source of truth).
- `test/db-ddl.test.ts` (fix-wave I2) pins the shape of all three tables, boot idempotence, and the
  citation-not-FK rule for both `canvas_node` (`foreign_key_list` contains `canvas`, not `generation`)
  and `canvas_edge` (contains `canvas`, not `canvas_node` or `generation` — edge endpoints are
  validated at the SERVICE layer, `service.ts` `validateGraph`, not by a SQLite FK).

## Key decisions (2026-07-30) — openCreator agent
Two drizzle tables mirroring `CREATOR_DDL` column-for-column (ADR `docs/wiki/decisions/opencreator-agent.md`):

- **`creatorSession`** — `id`, `userId` (→ `user`, cascade), `title`, `status` (drizzle `enum` over
  `idle|running|awaiting_confirm|failed`, TS-level only — the column is plain TEXT), `confirmed`,
  `createdAt`/`updatedAt` (`timestamp_ms`).
- **`confirmed` is `integer(..., { mode: 'boolean' }).notNull().default(false)`** — the budget gate
  (ADR D2). `mode: 'boolean'` is what lets the service read it as `true`/`false` while SQLite stores
  0/1. It is re-read from the row before EVERY charging tool call rather than captured once per turn,
  so a confirm that lands mid-turn is honoured and a fresh plan revokes the previous confirmation.
- **`updatedAt` is also the staleness clock.** In-flight agent loops live in process memory (the
  DeepInfra-job precedent), so an API restart leaves `running` sessions that nothing would settle;
  `settleStaleCreatorSessions` fails those older than the threshold at boot.
- **`creatorMessage`** — `id`, `sessionId` (→ `creatorSession`, cascade), `role` (`user|assistant`),
  `contentJson`, `createdAt`.
- **`role` has no `'tool'` member**, though the ADR sketched one: a tool result is not something a
  user reads. The loop writes each executed tool as an assistant `step` card and keeps the raw JSON
  inside that turn's in-memory transcript, so the chat never shows provider payloads.
- **Citations are inside `contentJson`, so there is no `.references()` to `generation`, `canvas` or
  `entity`** — a gallery delete must leave a stale link on an old card, never remove the conversation.
  The only cascading edges are the owner edges (`creatorSession.userId`, `creatorMessage.sessionId`).
- `test/db-ddl.test.ts` pins the shape of both tables, boot idempotence, `confirmed` defaulting to 0,
  the citation-not-FK rule, and the session→messages cascade.

## Update 2026-07-31 — style.reference_images_json
- `style` += `referenceImagesJson text('reference_images_json')` (nullable) — the IMAGE half of the
  style package (ADR `style-studio` amendment A1). JSON `[{ id, path }]`, byte-identically shaped to
  `shot.reference_images_json`, so the two reference stores stay recognizably the same thing.
- **A column, not a key inside `config_json`**, even though `config_json` was designed as the
  extension seam: these are STORED FILES with a lifetime, and an orphan sweep has to be able to see
  them without parsing an open-ended blob.
- NULL = nothing attached, which is what every row written before this has always meant — so the
  expand step is the whole migration (nothing to backfill, no contract step). Paired with a
  pragma-guarded `ALTER TABLE style ADD COLUMN reference_images_json TEXT` in `client.ts`.
- `kind` did NOT gain a value: a style is a PACKAGE (fragments AND images at once), not a new kind.

## Update 2026-07-31 — film.cover_image_path
- `film` += `coverImagePath text('cover_image_path')` (nullable) — the film's cover picture (owner
  request 2026-07-31), holding the `/media/<uuid>.<ext>` path `saveDataUri` returned.
- **A path, not bytes and not a generation citation.** A cover is an UPLOADED file, so it is stored
  the way every other uploaded image is (entity photos, shot/style references) and the column keeps
  what storage handed back — `toFilmDto` maps it to `coverUrl` by identity.
- NULL = no cover, which is every film written before this. Nothing to backfill; paired with a
  pragma-guarded `ALTER TABLE film ADD COLUMN cover_image_path TEXT` in `client.ts` that reuses the
  existing `filmColumns` read.
- Deleting a film does NOT delete the file (see `deleteFilm`) — the same harmless-orphan treatment
  render outputs and detached references already get.
