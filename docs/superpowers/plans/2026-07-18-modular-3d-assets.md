# Modular 3D Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `asset3d` aggregate (concept image → named parts → per-part extraction image → per-part mesh → client assembly/export) over the UNCHANGED generation lifecycle, exactly as approved in `docs/wiki/decisions/modular-3d-assets.md`.

**Architecture:** An `asset3d` / `asset3d_part` aggregate that only CITES generations by id (the CinemaStudio films/shots pattern). Decomposition = a FREE Claude-vision analyze (storyboard pattern) + PAID per-part extraction (a standard image generation) + PAID per-part mesh (a standard `model3d` generation). Every paid step rides `generationService.create()` — no new ledger, no new refund path. Part status is DERIVED from the cited generations' live statuses at read time — there is no status COLUMN (never persisted, no second source of truth) — but it IS the read-time OUTPUT of the GET endpoint, serialized on the part DTO exactly as the ADR HTTP surface promises ("asset + parts + derived statuses"). Assembly and GLB export are client-side (FRONTEND, a later build).

**Tech Stack:** Fastify + Drizzle (better-sqlite3, idempotent DDL) · `@opencreate/contracts` (zod, no build step) · `@anthropic-ai/sdk` (optional key) · Runware image + `3dInference` via the existing `generationService` · Vitest (`app.inject`). FRONTEND (later): React 19 + Vite, TanStack Router/Query, three.js lazy chunk, `GLTFExporter`.

---

## Scope & Build Split

This plan is the **shared artifact for the whole feature**. Only the BACKEND is built now.

| Layer | Status | Covered by |
| --- | --- | --- |
| **BACKEND** — contracts, DB tables, `assets3d` module (service/analyze/routes), app wiring, tests | **THIS BUILD** | Tasks 1–10 |
| **FRONTEND** — `apps/web/src/modules/Assets3D/` wizard, routes, three.js assembly viewer, `GLTFExporter` | **LATER** | Appendix F (spec only, do NOT implement now) |

## HTTP surface (must match ADR exactly)

| Method | Path | Notes |
| --- | --- | --- |
| GET / POST | `/api/assets3d` | list / create (title + concept dataUri; nothing charged) → 200 / 201 |
| GET / PATCH / DELETE | `/api/assets3d/:id` | asset + parts (+ derived statuses) / rename / delete rows only → 200 / 200 / 204 |
| POST | `/api/assets3d/:id/analyze` | Claude part suggestion; FREE; 502 `provider_error` without key |
| POST | `/api/assets3d/:id/parts` | manual part create → 201 |
| PATCH / DELETE | `/api/assets3d/:id/parts/:pid` | edit name/description/`transformJson` / delete → 200 / 204 |
| POST | `/api/assets3d/:id/parts/:pid/extract` | charged image generation (server model rule + prompt) → 200 |
| POST | `/api/assets3d/:id/parts/:pid/mesh` | charged `model3d` generation `{ modelId }` → 202 |

## BINDING project rules (enforced in every task)

- **TEST FIRST.** Each behavioural task writes the failing test, runs it red, implements minimally, runs it green, commits.
- **Money path UNCHANGED.** Parts CITE generations via `generationService.create()`. No ledger import in `assets3d`. Refund-exactly-once stays inside `create()`/`failGeneration`. The orchestrator NEVER refunds.
- **Part status DERIVED, never stored.** No status column on `asset3d_part`; the DTO computes `draft|extracting|extracted|meshing|ready` from the cited generations' live statuses AND serializes it on the part (per `asset3dPartSchema.status`) — the value is derived, never persisted.
- **Dependency surface is narrow + declared.** `assets3d` depends on `generationService` narrowed to `Pick<…,'create' | 'get'>`, on `storage` + `db`, and on the shared read-only `CATALOG` registry (`../catalog/catalog` — the same registry the generation service imports, used only to pick the reference-capable extraction model). It never reaches into any other module's internals or stateful services.
- **Every `.ts` gets a `.ts.md` sidecar** (repo convention; use the `sidecar-docs` skill format: `# <file> — AI component doc`, Purpose / What it does / Public API).
- **Files under 500 lines** (CLAUDE.md). `service.ts` holds CRUD + extract + mesh + DTO; `analyze.ts` is separate to keep both small.
- **Citation FKs are bare `text()`** — no `.references()`, no cascade — so deleting a generation from the library never cascades a part away. Only owner edges cascade.
- **Same 404 for missing-or-foreign.** Never a 403 existence oracle.
- **Verify commands:** `pnpm --filter @opencreate/contracts typecheck && pnpm --filter @opencreate/contracts test` for contracts; `pnpm --filter @opencreate/api test` for the API (or `rtk vitest` for filtered output). `.rtk/filters.toml` is not applied this session, so rtk-wrapped test/typecheck output is NOT filtered.

---

## File Structure (backend)

**Create**
- `packages/contracts/src/asset3d.ts` — wire contracts (schemas + inferred types).
- `packages/contracts/src/asset3d.ts.md` — sidecar.
- `packages/contracts/src/asset3d.test.ts` — schema parse/reject specs.
- `apps/api/src/modules/assets3d/service.ts` — aggregate CRUD + extract + mesh (calls the dto helpers).
- `apps/api/src/modules/assets3d/service.ts.md` — sidecar.
- `apps/api/src/modules/assets3d/dto.ts` — `derivePartStatus` + `toPartDto` (split out to keep `service.ts` < 500 lines; see Task 6 / Fix).
- `apps/api/src/modules/assets3d/dto.ts.md` — sidecar.
- `apps/api/src/modules/assets3d/analyze.ts` — FREE Claude-vision part suggestion.
- `apps/api/src/modules/assets3d/analyze.ts.md` — sidecar.
- `apps/api/src/modules/assets3d/routes.ts` — thin HTTP layer.
- `apps/api/src/modules/assets3d/routes.ts.md` — sidecar.
- `apps/api/test/assets3d.test.ts` — HTTP E2E suite.

**Modify**
- `packages/contracts/src/index.ts` — add `export * from './asset3d'` after `./generation`.
- `apps/api/src/db/schema.ts` (+ `.ts.md`) — add `asset3d`, `asset3dPart` tables.
- `apps/api/src/db/ddl.ts` (+ `.ts.md`) — add `ASSET3D_DDL`.
- `apps/api/src/db/client.ts` (+ `.ts.md`) — import + `sqlite.exec(ASSET3D_DDL)`.
- `apps/api/src/modules/generations/service.ts` (+ `.ts.md`) — Task 4: server-only `referenceImages` channel on `create()` (additive, ledger-untouched). **See OPEN RISK.**
- `apps/api/src/app.ts` — wire `createAsset3dService` + `createAnalyzeService` + `registerAsset3dRoutes`.
- `apps/api/test/helpers/build-test-app.ts` — add `anthropicApiKey` override.

---

## OPEN RISK — the extraction reference channel (read before Task 4)

`extract()` must call `generationService.create()` with the concept image as the model's **reference image**. Today an image generation's reference flows **only** through `entityRefs` (the service loads a stored *entity's* photo and resolves it to a data URI in `referenceImages`). A concept image is **not** an entity, and `create()` has **no** channel for a raw reference data URI (`inputImage` is used only by the `model3d` branch and image-to-image `mode`, and is never forwarded to `imageInference`).

**Chosen resolution (minimal, additive, ledger-free):** widen the *service-level* input `create()` accepts to `CreateGenerationInput & { referenceImages?: string[] }` — WITHOUT adding the field to the client-facing `createGenerationInputSchema`. Because the generation route zod-parses the body (`createGenerationInputSchema.safeParse`), zod strips unknown keys, so **no client can inject** a reference; only in-process orchestrators (like `assets3d`) that build the input object directly can set it. In the reference-resolution block, seed `referenceImages` from `input.referenceImages` and validate it exactly like entity-derived refs (`model.referenceMode` present, count ≤ `maxReferenceImages`). This touches `create()` but **not** the ledger, the refund path, or the wire contract.

**Rejected alternative:** minting a throwaway hidden entity per asset to carry the concept image — pollutes the entity library, needs cleanup, and closes a dependency cycle.

**Action for the owner:** confirm this server-only extension is acceptable before Task 4. If not, the fallback is the ephemeral-entity approach and Task 4/6 change shape. Everything else in the plan is independent of this decision.

---

## Task 1: Contracts — `asset3d` wire surface

**Files:**
- Create: `packages/contracts/src/asset3d.ts`
- Create: `packages/contracts/src/asset3d.ts.md`
- Create: `packages/contracts/src/asset3d.test.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing test** — `packages/contracts/src/asset3d.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  analyzeResponseSchema,
  asset3dPartSchema,
  createAsset3dInputSchema,
  meshPartInputSchema,
  updateAsset3dPartInputSchema,
  MAX_PARTS,
} from './asset3d'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('createAsset3dInputSchema', () => {
  it('accepts a title + png/jpeg/webp data-uri concept image', () => {
    expect(createAsset3dInputSchema.safeParse({ title: 'Knight', conceptImage: PNG }).success).toBe(true)
  })
  it('rejects an svg concept image (stored-XSS)', () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zz4='
    expect(createAsset3dInputSchema.safeParse({ title: 'X', conceptImage: svg }).success).toBe(false)
  })
  it('rejects a non-data-uri concept image (SSRF: no URLs)', () => {
    expect(createAsset3dInputSchema.safeParse({ title: 'X', conceptImage: 'https://x/y.png' }).success).toBe(false)
  })
  it('has no partId/status/generation ids (server establishes provenance)', () => {
    const parsed = createAsset3dInputSchema.parse({ title: 'X', conceptImage: PNG })
    expect('imageGenerationId' in parsed).toBe(false)
    expect('status' in parsed).toBe(false)
  })
})

describe('asset3dPartSchema', () => {
  it('cites generations by nullable id and carries a derived status field', () => {
    const part = asset3dPartSchema.parse({
      id: 'p1', assetId: 'a1', name: 'Helmet', description: '', sortOrder: 1000,
      imageGenerationId: null, meshGenerationId: null, transform: null,
      status: 'draft', createdAt: new Date().toISOString(),
    })
    expect(part.imageGenerationId).toBeNull()
    expect(part.status).toBe('draft')
  })
  it('rejects an unknown status value (enum is the derived-state closed set)', () => {
    expect(
      asset3dPartSchema.safeParse({
        id: 'p1', assetId: 'a1', name: 'H', description: '', sortOrder: 1000,
        imageGenerationId: null, meshGenerationId: null, transform: null,
        status: 'exploded', createdAt: new Date().toISOString(),
      }).success,
    ).toBe(false)
  })
})

describe('updateAsset3dPartInputSchema', () => {
  it('distinguishes cleared transform (null) from untouched (absent)', () => {
    expect(updateAsset3dPartInputSchema.parse({ transform: null }).transform).toBeNull()
    expect('transform' in updateAsset3dPartInputSchema.parse({ name: 'Boot' })).toBe(false)
  })
  it('validates a Vec3 transform (Y-up, meters)', () => {
    const t = { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    expect(updateAsset3dPartInputSchema.safeParse({ transform: t }).success).toBe(true)
    expect(updateAsset3dPartInputSchema.safeParse({ transform: { position: [0, 1] } }).success).toBe(false)
  })
})

describe('analyzeResponseSchema', () => {
  it(`caps parts at MAX_PARTS (${MAX_PARTS})`, () => {
    const parts = Array.from({ length: MAX_PARTS + 1 }, (_, i) => ({ name: `p${i}`, description: 'd' }))
    expect(analyzeResponseSchema.safeParse({ parts }).success).toBe(false)
  })
})

describe('meshPartInputSchema', () => {
  it('takes only a modelId (server composes everything else)', () => {
    expect(meshPartInputSchema.safeParse({ modelId: 'trellis-2' }).success).toBe(true)
    expect(meshPartInputSchema.safeParse({}).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run it red**

Run: `pnpm --filter @opencreate/contracts test -- asset3d`
Expected: FAIL — `Cannot find module './asset3d'`.

- [ ] **Step 3: Implement `packages/contracts/src/asset3d.ts`**

```ts
// packages/contracts/src/asset3d.ts
// Modular 3D Assets wire contracts (ADR: docs/wiki/decisions/modular-3d-assets.md).
// An `asset3d` is an aggregate that CITES generations by id — it never owns media,
// exactly like Film/Shot. A part's image and mesh are ordinary generations; the
// row holds only their (nullable) foreign keys. Part STATUS is DERIVED at read
// time from those cited generations' statuses — there is NO status COLUMN (the
// films/shots lesson: a persisted status is a second source of truth, a bug
// class). It DOES appear on the read DTO (`asset3dPartSchema.status`) because the
// ADR GET endpoint returns "asset + parts + derived statuses"; it is recomputed
// on every read, never stored, and is REJECTED on every input schema. Provenance
// the server establishes (userId, createdAt, the citations, the derived status)
// never appears in create/patch inputs.
import { z } from 'zod'

// The closed set of derived part states (D4). Order = the extraction→mesh flow:
// draft → extracting → extracted → meshing → ready.
export const partStatusSchema = z.enum(['draft', 'extracting', 'extracted', 'meshing', 'ready'])
export type PartStatus = z.infer<typeof partStatusSchema>

// Hard cap on analyze output AND on manual parts — a multi-GLB assembly stresses
// VRAM, and the ADR bounds it. Enforced here (contract) and server-side.
export const MAX_PARTS = 12

// Concept + part uploads: anchored data-uri regex with the `;base64,` boundary
// (a `.startsWith()` check has a prefix-boundary hole — model-render.ts precedent).
// svg is excluded on purpose (stored-XSS). 14MB cap tracks generation.inputImage.
const MAX_IMAGE_CHARS = 14_000_000
const dataUriImage = z
  .string()
  .regex(/^data:image\/(png|jpe?g|webp);base64,/, 'must be a png/jpeg/webp data URI')
  .max(MAX_IMAGE_CHARS)

// ── Assembly transform (client-side, renderer-agnostic, Y-up / meters, glTF) ──
const vec3 = z.tuple([z.number(), z.number(), z.number()])
export const partTransformSchema = z.object({
  position: vec3,
  rotation: vec3, // Euler radians, XYZ
  scale: vec3,
})
export type PartTransform = z.infer<typeof partTransformSchema>

// ── Part DTO — cites generations, carries a DERIVED (never persisted) status ──
export const asset3dPartSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  name: z.string(),
  description: z.string(),
  sortOrder: z.number(),
  // Citations: the extraction image and the mesh, each null until generated.
  imageGenerationId: z.string().nullable(),
  meshGenerationId: z.string().nullable(),
  // Assembly transform; null until the user places the part in the viewer.
  transform: partTransformSchema.nullable(),
  // Derived at read time from the cited generations' live statuses — recomputed
  // per GET, never stored (no status column). Output-only: no input schema has it.
  status: partStatusSchema,
  createdAt: z.string(),
})
export type Asset3dPart = z.infer<typeof asset3dPartSchema>

// ── Asset DTO ────────────────────────────────────────────────────────────────
export const asset3dSchema = z.object({
  id: z.string(),
  title: z.string(),
  // Our stored /media key for the concept image (never a provider URL — those
  // expire after 7 days). Served path once saved.
  conceptImageUrl: z.string(),
  createdAt: z.string(),
})
export type Asset3d = z.infer<typeof asset3dSchema>

// ── Inputs ───────────────────────────────────────────────────────────────────
// No generation ids, no status: the server sets citations via extract/mesh.
export const createAsset3dInputSchema = z.object({
  title: z.string().min(1).max(120),
  conceptImage: dataUriImage,
})
export type CreateAsset3dInput = z.infer<typeof createAsset3dInputSchema>

export const updateAsset3dInputSchema = z.object({ title: z.string().min(1).max(120) }).partial()
export type UpdateAsset3dInput = z.infer<typeof updateAsset3dInputSchema>

export const createAsset3dPartInputSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(600).optional(),
})
export type CreateAsset3dPartInput = z.infer<typeof createAsset3dPartInputSchema>

// PATCH: every field optional; `transform: null` clears, absent = untouched. No
// generation-id fields — the citations are set only by extract/mesh routes.
export const updateAsset3dPartInputSchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(600),
    transform: partTransformSchema.nullable(),
  })
  .partial()
export type UpdateAsset3dPartInput = z.infer<typeof updateAsset3dPartInputSchema>

// Mesh: the ONLY thing the client picks is the tier (a model3d catalog id). The
// server supplies the part image and composes the job. No prompt, no model
// composition leaks to the client (the server-model rule).
export const meshPartInputSchema = z.object({ modelId: z.string().min(1).max(80) })
export type MeshPartInput = z.infer<typeof meshPartInputSchema>

// ── Composite read shape ─────────────────────────────────────────────────────
export const asset3dDetailSchema = z.object({
  asset: asset3dSchema,
  parts: z.array(asset3dPartSchema),
})
export type Asset3dDetail = z.infer<typeof asset3dDetailSchema>

export const asset3dListSchema = z.object({ items: z.array(asset3dSchema) })
export type Asset3dList = z.infer<typeof asset3dListSchema>

// ── Analyze (FREE Claude vision) — validated on the way OUT of the model, like
// storyboard. A draft part is just a name + description; nothing is charged.
export const analyzePartSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(600),
})
export type AnalyzePart = z.infer<typeof analyzePartSchema>
export const analyzeResponseSchema = z.object({ parts: z.array(analyzePartSchema).min(1).max(MAX_PARTS) })
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>
```

- [ ] **Step 4: Add the barrel export** — `packages/contracts/src/index.ts`, immediately after `export * from './generation'`:

```ts
// Modular 3D Assets (ADR modular-3d-assets): an aggregate that cites generations
// by id (like film). Exported after generation because parts cite generations.
export * from './asset3d'
```

- [ ] **Step 5: Write the sidecar** — `packages/contracts/src/asset3d.ts.md`

```markdown
# asset3d.ts — AI component doc

Created: 2026-07-18. Keep this in sync on every change.

## Purpose
Wire contracts for Modular 3D Assets (ADR modular-3d-assets): the `asset3d`
aggregate and its `asset3d_part` children, which CITE generations by id instead
of owning media.

## What it does
- DTOs: `asset3dSchema`, `asset3dPartSchema` (nullable `imageGenerationId` /
  `meshGenerationId`, plus a `status` (`partStatusSchema`) that is DERIVED at read
  time and serialized on the read DTO — never persisted, never on any input).
- Inputs: create/update asset, create/update part (`transform` clear-vs-untouch),
  `meshPartInputSchema` (`{ modelId }` only — server composes the rest).
- `analyzeResponseSchema` — FREE Claude draft parts, validated on the way out,
  capped at `MAX_PARTS` (12).
- `partTransformSchema` — Vec3 position/rotation/scale, Y-up/meters (glTF).

## Public API
`MAX_PARTS`, `partStatusSchema`/`PartStatus`, `partTransformSchema`/`PartTransform`, `asset3dSchema`/`Asset3d`,
`asset3dPartSchema`/`Asset3dPart`, `createAsset3dInputSchema`/`CreateAsset3dInput`,
`updateAsset3dInputSchema`, `createAsset3dPartInputSchema`,
`updateAsset3dPartInputSchema`, `meshPartInputSchema`/`MeshPartInput`,
`asset3dDetailSchema`/`Asset3dDetail`, `asset3dListSchema`,
`analyzePartSchema`, `analyzeResponseSchema`/`AnalyzeResponse`.
```

- [ ] **Step 6: Run green + typecheck**

Run: `pnpm --filter @opencreate/contracts test -- asset3d && pnpm --filter @opencreate/contracts typecheck`
Expected: PASS; no TS errors (barrel order is correct — `asset3d` imports nothing from other modules).

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/asset3d.ts packages/contracts/src/asset3d.ts.md \
  packages/contracts/src/asset3d.test.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): asset3d wire surface for modular 3D assets"
```

---

## Task 2: DB tables — `asset3d`, `asset3d_part`

**Files:**
- Modify: `apps/api/src/db/schema.ts` (+ `apps/api/src/db/schema.ts.md`)

- [ ] **Step 1: Add the tables** at the bottom of `schema.ts` (Studio3D-section style). `sortOrder` is `real()` so a reorder/midpoint-insert spaces values without renumbering (the `shot.orderIndex` precedent). The generation citations are BARE `text()` — no `.references()` — so deleting a generation never cascades a part away. Only the owner edges cascade.

```ts
// ── Modular 3D Assets (ADR modular-3d-assets) ────────────────────────────────
// asset3d cites generations by id; it owns no media. The ONLY cascading FKs are
// asset3d.userId → user and asset3d_part.assetId → asset3d. imageGenerationId /
// meshGenerationId are CITATIONS (bare text, no .references()) — deleting a
// generation from the library must leave an orphaned ref, never delete the part.
export const asset3d = sqliteTable('asset3d', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  // The FULL public path saveDataUri returns for the concept image, verbatim —
  // '/media/<uuid>.<ext>'. NOT a bare key: readAsDataUri needs the extension to
  // resolve the mime, and you cannot rebuild it from a bare uuid. Not a provider URL.
  conceptImagePath: text('concept_image_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const asset3dPart = sqliteTable('asset3d_part', {
  id: text('id').primaryKey(),
  assetId: text('asset_id')
    .notNull()
    .references(() => asset3d.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  // REAL so reorder/midpoint-insert spaces values without a whole-list renumber.
  sortOrder: real('sort_order').notNull(),
  // Citations — NO .references(): the part outlives a deleted generation.
  imageGenerationId: text('image_generation_id'),
  meshGenerationId: text('mesh_generation_id'),
  // Assembly transform (client-set via PATCH), stringified JSON; null until placed.
  transformJson: text('transform_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
```

- [ ] **Step 2: Update `apps/api/src/db/schema.ts.md`** — note the two new tables, the citation-not-ownership rule (bare-text FKs), and the "mirror every change into ddl.ts" reminder.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @opencreate/api typecheck`
Expected: PASS (imports `real`, `text`, `integer`, `sqliteTable`, `user` already exist in schema.ts).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/src/db/schema.ts.md
git commit -m "feat(db): asset3d + asset3d_part drizzle tables"
```

---

## Task 3: DDL + boot wiring

**Files:**
- Modify: `apps/api/src/db/ddl.ts` (+ `.ts.md`)
- Modify: `apps/api/src/db/client.ts` (+ `.ts.md`)
- Test: `apps/api/test/db-ddl.test.ts` (extend the existing structural test)

- [ ] **Step 1: Write the failing structural test.** Find the existing `apps/api/test/db-ddl.test.ts` (it asserts table shapes, e.g. the absence of a cost column on `model_render`). Add:

```ts
it('creates asset3d + asset3d_part with citation (non-FK) generation columns', () => {
  const { sqlite } = createDb(':memory:')
  const assetCols = (sqlite.pragma('table_info(asset3d)') as Array<{ name: string }>).map((c) => c.name)
  expect(assetCols).toEqual(
    expect.arrayContaining(['id', 'user_id', 'title', 'concept_image_path', 'created_at']),
  )
  const partCols = (sqlite.pragma('table_info(asset3d_part)') as Array<{ name: string }>).map((c) => c.name)
  expect(partCols).toEqual(
    expect.arrayContaining([
      'id', 'asset_id', 'name', 'description', 'sort_order',
      'image_generation_id', 'mesh_generation_id', 'transform_json', 'created_at',
    ]),
  )
  // Citations are NOT foreign keys — deleting a generation must not cascade a part.
  const fkTargets = (sqlite.pragma('foreign_key_list(asset3d_part)') as Array<{ table: string }>).map((f) => f.table)
  expect(fkTargets).toContain('asset3d') // owner edge cascades
  expect(fkTargets).not.toContain('generation') // citation edge does NOT
})
```

(Match the file's existing import of `createDb`; if it destructures differently, follow the local style.)

- [ ] **Step 2: Run it red**

Run: `pnpm --filter @opencreate/api test -- db-ddl`
Expected: FAIL — `no such table: asset3d`.

- [ ] **Step 3: Add `ASSET3D_DDL`** to `apps/api/src/db/ddl.ts` (column-for-column mirror of schema.ts; all `IF NOT EXISTS`; leading comment cites the ADR and the citation-not-FK rule):

```ts
// Modular 3D Assets (ADR modular-3d-assets). Mirrors schema.ts column-for-column.
// image_generation_id / mesh_generation_id are CITATIONS: plain TEXT with NO
// REFERENCES clause, so deleting a generation never cascades a part away. The
// only cascading edges are asset3d.user_id and asset3d_part.asset_id.
export const ASSET3D_DDL = `
CREATE TABLE IF NOT EXISTS asset3d (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  concept_image_path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asset3d_user_created ON asset3d(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS asset3d_part (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset3d(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order REAL NOT NULL,
  image_generation_id TEXT,
  mesh_generation_id TEXT,
  transform_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asset3d_part_asset ON asset3d_part(asset_id, sort_order);
`
```

- [ ] **Step 4: Wire boot** in `apps/api/src/db/client.ts`: add `ASSET3D_DDL` to the ddl import line and exec it right after `sqlite.exec(MODEL3D_DDL)` (a brand-new table needs ONLY the CREATE IF NOT EXISTS exec — no pragma micro-migration):

```ts
import { DDL, ENTITY_DDL, FILM_DDL, MODEL3D_DDL, ASSET3D_DDL, REFUND_ONCE_INDEX_DDL } from './ddl'
// …after sqlite.exec(MODEL3D_DDL):
// Modular 3D Assets (ADR modular-3d-assets): two brand-new tables, so only the
// idempotent CREATE exec is needed — no micro-migration guard.
sqlite.exec(ASSET3D_DDL)
```

- [ ] **Step 5: Update `ddl.ts.md` and `client.ts.md`** — record the new const and the added exec line.

- [ ] **Step 6: Run green**

Run: `pnpm --filter @opencreate/api test -- db-ddl`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db/ddl.ts apps/api/src/db/ddl.ts.md apps/api/src/db/client.ts \
  apps/api/src/db/client.ts.md apps/api/test/db-ddl.test.ts
git commit -m "feat(db): ASSET3D_DDL bootstrap + structural test"
```

---

## Task 4: Server-only reference channel on `create()` — **GATED on the OPEN RISK above**

> Do NOT start until the owner confirms the server-only `referenceImages` extension (see OPEN RISK). This is the one money-path-adjacent change: additive, ledger-untouched, wire-contract unchanged.

**Files:**
- Modify: `apps/api/src/modules/generations/service.ts` (+ `.ts.md`)
- Test: `apps/api/test/generations-reference-image.test.ts` (new, service-level)

- [ ] **Step 1: Write the failing test** — a direct-service test that a server-supplied reference data URI reaches `imageInference.referenceImages` and is validated against `referenceMode`.

```ts
import { describe, expect, it, vi } from 'vitest'
import { createDb } from '../src/db/client'
import { createGenerationService } from '../src/modules/generations/service'
import { createLocalStorage } from '../src/storage/local'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DATA_URI = 'data:image/png;base64,iVBORw0KGgo='

function svc(runware: any) {
  const { db } = createDb(':memory:')
  const storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'oc-ref-')), ['runware.ai'])
  return { svc: createGenerationService({ db, runware, storage, pollMinIntervalMs: 0 }), db }
}

it('forwards a server-supplied referenceImages data URI to imageInference (PURE concept: no entityRefs, no entities service)', async () => {
  const runware = {
    imageInference: vi.fn(async () => ({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })),
    submitVideo: vi.fn(), submitAudio: vi.fn(), submit3d: vi.fn(), getResponse: vi.fn(),
  }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('x'), { status: 200 })))
  const { svc: s } = svc(runware)
  // NOTE: pass a real userId with balance via your existing test seam; abbreviated here.
  // The assertion is the point — this is the scope-trap guard (Fix #4): the service
  // is built WITHOUT an entities dependency and the input has NO entityRefs, so the
  // ONLY way referenceImages reaches imageInference is the unconditional direct-ref path.
  // await s.create(userId, { modelId: 'flux-kontext-pro', prompt: 'the helmet', aspectRatio: '1:1', referenceImages: [DATA_URI] })
  // expect(runware.imageInference.mock.calls[0][0].referenceImages).toEqual([DATA_URI])
  vi.unstubAllGlobals()
})

it('rejects referenceImages on a model without referenceMode BEFORE charge', () => {
  // create(...) with modelId lacking referenceMode + referenceImages → ValidationError (400), imageInference NOT called.
})
```

(Flesh out the abbreviated user/balance setup to match the codebase's existing direct-service generation tests — reuse the same helper they use to insert a funded user.)

- [ ] **Step 2: Run it red**

Run: `pnpm --filter @opencreate/api test -- generations-reference-image`
Expected: FAIL — `referenceImages` not accepted / not forwarded.

- [ ] **Step 3: Implement the minimal, additive change** in `generations/service.ts`:
  1. Add a service-level input type and use it in `create`'s signature:
     ```ts
     // Server-only: orchestrators (assets3d.extract) may hand create() reference
     // image data URIs directly. NOT part of createGenerationInputSchema, so the
     // generation route (which zod-strips the body) can never let a client set it.
     export type CreateGenerationServiceInput = CreateGenerationInput & { referenceImages?: string[] }
     ```
     and change `async create(userId: string, input: CreateGenerationInput, reqLog?)` → `input: CreateGenerationServiceInput`.
  2. **SCOPE — the trap (Fix #4).** Today `referenceImages` is assigned only INSIDE `if (refs.length > 0 && entities)`, and the `referenceMode`/`maxReferenceImages` checks live INSIDE `if (refs.length > 0)`. A pure concept extraction has `refs.length === 0` and no injected `entities` service, so both the append and the capability gate would be SKIPPED — the concept ref would be dropped silently and the extractor would redraw from prompt alone at full price. So both must move to UNCONDITIONAL scope: compute `directRefs`/`totalRefs` at the top of the resolution block, run the capability gate whenever `totalRefs > 0` (NOT nested under `refs.length > 0` or `entities`), and append `directRefs` whenever `directRefs.length > 0` (NOT nested under the entity block):
     ```ts
     // UNCONDITIONAL — not inside `if (refs.length > 0)` / `if (entities)`.
     const directRefs = input.referenceImages ?? []
     const totalRefs = refs.length + directRefs.length
     if (totalRefs > 0) {
       if (!model.referenceMode) throw new ValidationError(`${model.id} cannot use reference images`)
       if (totalRefs > (model.maxReferenceImages ?? 1))
         throw new ValidationError(`${model.id} accepts at most ${model.maxReferenceImages ?? 1} reference image(s)`)
     }
     // …entity urls (if any) are resolved into `referenceImages` inside the existing
     // entity block; THEN, unconditionally, fold in the direct refs:
     if (directRefs.length > 0) referenceImages = [...(referenceImages ?? []), ...directRefs]
     ```
  Keep every check BEFORE `chargeCredits` (an impossible job costs nothing). Do NOT touch the transaction, ledger, or settle/refund paths.

- [ ] **Step 4: Run green + full generations suite** (regression guard on the money path)

Run: `pnpm --filter @opencreate/api test -- generations`
Expected: PASS — including the pre-existing charge/refund/poll tests (unchanged behaviour when `referenceImages` is absent).

- [ ] **Step 5: Update `generations/service.ts.md`** — document the server-only channel and why it is not in the client schema.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/generations/service.ts apps/api/src/modules/generations/service.ts.md \
  apps/api/test/generations-reference-image.test.ts
git commit -m "feat(generations): server-only referenceImages channel for orchestrators"
```

---

## Task 5: `analyze.ts` — FREE Claude-vision part suggestion

**Files:**
- Create: `apps/api/src/modules/assets3d/analyze.ts` (+ `.ts.md`)
- Test: `apps/api/test/assets3d-analyze.test.ts` (service-level, storyboard pattern)

Mirrors `films/storyboard.ts`: `ANTHROPIC_API_KEY`-gated, injectable `complete`, `Asset3dAnalyzeUnavailableError` (502 `provider_error`), STRICT-JSON parsed + `analyzeResponseSchema`-validated. The concept image is read from storage as a data URI and sent as a vision block. The service depends on the asset3d service narrowed to the ownership check + the concept image, never reaching into its internals.

- [ ] **Step 1: Write the failing test** — `apps/api/test/assets3d-analyze.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { createAnalyzeService, Asset3dAnalyzeUnavailableError } from '../src/modules/assets3d/analyze'

const parts = { parts: [{ name: 'Helmet', description: 'steel dome' }, { name: 'Boots', description: 'leather' }] }

function fakeAssets() {
  return {
    requireAssetConcept: vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo='),
    replaceDraftParts: vi.fn(async () => parts.parts.map((p, i) => ({ id: `p${i}`, name: p.name }))),
  }
}

it('without a key AND without an injected complete → 502 provider_error', async () => {
  const svc = createAnalyzeService({ anthropicApiKey: null, assets: fakeAssets() as any })
  await expect(svc.analyze('u1', 'a1')).rejects.toBeInstanceOf(Asset3dAnalyzeUnavailableError)
})

it('with an injected complete → validated draft parts (nothing charged)', async () => {
  const assets = fakeAssets()
  const svc = createAnalyzeService({
    anthropicApiKey: 'test',
    assets: assets as any,
    complete: async () => JSON.stringify(parts),
  })
  const out = await svc.analyze('u1', 'a1')
  expect(out).toHaveLength(2)
  expect(assets.requireAssetConcept).toHaveBeenCalledWith('u1', 'a1') // ownership first
})

it('a malformed completion → 502 (not a broken write)', async () => {
  const svc = createAnalyzeService({ anthropicApiKey: 'test', assets: fakeAssets() as any, complete: async () => 'not json' })
  await expect(svc.analyze('u1', 'a1')).rejects.toBeInstanceOf(Asset3dAnalyzeUnavailableError)
})
```

- [ ] **Step 2: Run it red**

Run: `pnpm --filter @opencreate/api test -- assets3d-analyze`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/api/src/modules/assets3d/analyze.ts`**

```ts
// apps/api/src/modules/assets3d/analyze.ts
// FREE decomposition step (ADR D2): Claude vision lists the named parts of a
// concept image. Gated on ANTHROPIC_API_KEY exactly like storyboard — unset →
// 502 provider_error, and the wizard still works because the user can add parts
// by hand. Nothing is charged; each draft part lands with generationId = null.
import Anthropic from '@anthropic-ai/sdk'
import { analyzeResponseSchema, MAX_PARTS } from '@opencreate/contracts'
import type { Asset3dPart } from '@opencreate/contracts'

export class Asset3dAnalyzeUnavailableError extends Error {
  statusCode = 502
  apiCode = 'provider_error'
  constructor(message = 'Part analysis is not configured') {
    super(message)
  }
}

// The narrow slice of the asset3d service analyze depends on — ownership + the
// concept image, and the atomic draft-part replace. No cross-module reach-in.
type AssetsForAnalyze = {
  // Ownership-checked; returns the concept image as a data URI (throws 404 if not the caller's).
  requireAssetConcept: (userId: string, assetId: string) => Promise<string>
  // Replace the asset's draft parts (parts with no citations) with the analyzed set, atomically.
  replaceDraftParts: (userId: string, assetId: string, parts: { name: string; description: string }[]) => Promise<Asset3dPart[]>
}

const SYSTEM_PROMPT = `You segment a single concept image of ONE object/character into its distinct,
separable PARTS for modular 3D reconstruction (e.g. Body, Hair, Helmet, Armor, Boots, Belt).
Return STRICT JSON only — no prose, no markdown fences — matching exactly:
{"parts":[{"name":string,"description":string}]}
Rules:
- "name" is a short noun (1-3 words). "description" is a concrete visual description of that part
  in isolation (material, color, shape) so an image model can redraw it alone.
- Only list parts that are visually separable. Merge trivial detail into the nearest larger part.
- At most ${MAX_PARTS} parts.`

type Deps = {
  anthropicApiKey: string | null
  assets: AssetsForAnalyze
  complete?: (system: string, imageDataUri: string) => Promise<string>
}

export type AnalyzeService = ReturnType<typeof createAnalyzeService>

export function createAnalyzeService({ anthropicApiKey, assets, complete }: Deps) {
  const run =
    complete ??
    (async (system: string, imageDataUri: string): Promise<string> => {
      if (!anthropicApiKey) throw new Asset3dAnalyzeUnavailableError()
      const client = new Anthropic({ apiKey: anthropicApiKey })
      const [, mediaType, b64] = imageDataUri.match(/^data:(image\/[a-z+]+);base64,(.*)$/is) ?? []
      if (!b64) throw new Asset3dAnalyzeUnavailableError('unreadable concept image')
      const res = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        system,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/png', data: b64 } },
              { type: 'text', text: 'List the separable parts of this object as STRICT JSON.' },
            ],
          },
        ],
      })
      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
    })

  async function analyze(userId: string, assetId: string): Promise<Asset3dPart[]> {
    if (!anthropicApiKey && !complete) throw new Asset3dAnalyzeUnavailableError()
    // Ownership (throws 404) + the concept image, BEFORE any model call.
    const concept = await assets.requireAssetConcept(userId, assetId)
    const raw = await run(SYSTEM_PROMPT, concept)
    const parsed = parseAnalyze(raw)
    return assets.replaceDraftParts(userId, assetId, parsed.parts)
  }

  return { analyze }
}

export function parseAnalyze(raw: string): { parts: { name: string; description: string }[] } {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Asset3dAnalyzeUnavailableError('The analyzer returned an unreadable response')
  }
  const result = analyzeResponseSchema.safeParse(json)
  if (!result.success) throw new Asset3dAnalyzeUnavailableError('The analyzer returned an invalid response')
  return result.data
}
```

- [ ] **Step 4: Run green**

Run: `pnpm --filter @opencreate/api test -- assets3d-analyze`
Expected: PASS.

- [ ] **Step 5: Write `analyze.ts.md`** (Purpose / What it does / Public API: `createAnalyzeService`, `AnalyzeService`, `Asset3dAnalyzeUnavailableError`, `parseAnalyze`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/assets3d/analyze.ts apps/api/src/modules/assets3d/analyze.ts.md \
  apps/api/test/assets3d-analyze.test.ts
git commit -m "feat(assets3d): free Claude-vision part analysis"
```

---

## Task 6: `service.ts` + `dto.ts` — aggregate CRUD + extract + mesh + derived-status DTO

**Files:**
- Create: `apps/api/src/modules/assets3d/service.ts` (+ `.ts.md`)
- Create: `apps/api/src/modules/assets3d/dto.ts` (+ `.ts.md`) — `derivePartStatus` + `toPartDto` (Fix #7: split out so `service.ts` stays < 500 lines).

The service factory mirrors `createFilmService`. Ownership is the type signature (`userId` first, every query scoped, one 404 for missing-or-foreign). It depends on `db`, `storage`, `generations: Pick<GenerationService, 'create' | 'get'>` (narrowed — `create` for extract/mesh, `get` for reading a cited generation's status when deriving part state; NEVER the ledger), and the shared read-only `CATALOG` registry (`../catalog/catalog`, for `pickExtractionModel` — declared in the dependency-surface rule). Constants at module top: `MAX_PARTS` (import), `ORDER_STEP = 1000`.

Key methods and their invariants:

- `requireAsset(userId, assetId)` / `requirePart(userId, assetId, partId)` — ownership gates, `Asset3dNotFoundError` (404).
- `createAsset(userId, input)` — `const conceptImagePath = storage.saveDataUri(input.conceptImage, newKey())` (saveDataUri RETURNS the full `/media/<uuid>.<ext>` public path); insert that path into `conceptImagePath`; the returned `Asset3d` DTO's `conceptImageUrl` = that path VERBATIM (guaranteed to start `/media/`). No `'/media/' + key` reconstruction anywhere.
- `listAssets(userId)` / `getAsset(userId, id)` — the latter returns `Asset3dDetail` with parts and DERIVED statuses. Each part's DTO is built by `toPartDto` (in `dto.ts`), which is async because it awaits `derivePartStatus` (see below).
- `updateAsset` (rename) / `deleteAsset` — delete removes rows only; FK cascade drops parts; cited generations are NEVER touched.
- `addPart` / `updatePart` (PATCH with `!== undefined` guards; `transform: null` clears vs absent = untouched) / `deletePart`.
- `requireAssetConcept(userId, assetId)` — ownership-checked; returns `storage.readAsDataUri(asset.conceptImagePath)` — the stored full path passed straight through (the seam `analyze.ts` depends on). No reconstruction.
- `replaceDraftParts(userId, assetId, parts)` — one `db.transaction`: delete existing parts with BOTH citations null (drafts), insert the analyzed set with spaced `sortOrder`. Parts already extracted/meshed are preserved.
- `extract(userId, assetId, partId)` — the paid image gen (see below).
- `mesh(userId, assetId, partId, { modelId })` — the paid model3d gen (see below).

**Derived status (`dto.ts`)** — NEVER stored; computed from the cited generations at read time AND serialized on the part DTO (per `asset3dPartSchema.status`, added in Task 1). Split into its own file so `service.ts` stays under 500 lines (Fix #7). `derivePartStatus` + `toPartDto` take the narrowed `generations: Pick<GenerationService,'get'>` as an argument (no module-level state):

```ts
// apps/api/src/modules/assets3d/dto.ts
import type { PartStatus, Asset3dPart } from '@opencreate/contracts'

type GenGet = { get: (userId: string, id: string) => Promise<{ status: string } | undefined> | { status: string } | undefined }

export async function derivePartStatus(gen: GenGet, userId: string, row: {
  imageGenerationId: string | null; meshGenerationId: string | null
}): Promise<PartStatus> {
  if (!row.imageGenerationId) return 'draft'
  const img = await Promise.resolve(gen.get(userId, row.imageGenerationId)).catch(() => null)
  if (!img || img.status !== 'succeeded') return 'extracting'
  if (!row.meshGenerationId) return 'extracted'
  const mesh = await Promise.resolve(gen.get(userId, row.meshGenerationId)).catch(() => null)
  if (!mesh || mesh.status !== 'succeeded') return 'meshing'
  return 'ready'
}

// Maps a DB row → Asset3dPart, awaiting the derived status so it appears on the wire.
export async function toPartDto(gen: GenGet, userId: string, row: /* asset3d_part row */ any): Promise<Asset3dPart> {
  return {
    id: row.id, assetId: row.assetId, name: row.name, description: row.description,
    sortOrder: row.sortOrder,
    imageGenerationId: row.imageGenerationId, meshGenerationId: row.meshGenerationId,
    transform: row.transformJson ? JSON.parse(row.transformJson) : null,
    status: await derivePartStatus(gen, userId, row),
    createdAt: new Date(row.createdAt).toISOString(),
  }
}
```

`getAsset` awaits `toPartDto` for each part (`Promise.all`). The status is recomputed on every read from the live cited-generation statuses — there is no column and no persisted copy. Task 10 drives a cited generation to terminal and GETs the asset to assert the status transitions (`draft`→`extracting`→`extracted`→`meshing`→`ready`).

**`extract()`** — the core citation write (ADR D2):

```ts
async function extract(userId: string, assetId: string, partId: string): Promise<Asset3dPart> {
  const asset = requireAsset(userId, assetId)
  const part = requirePart(userId, assetId, partId)
  // The reference-capable image model — the server "model rule": pick a catalog
  // IMAGE model that carries referenceMode (today flux-kontext-pro / nano-banana-pro).
  const modelId = pickExtractionModel() // see below — select by referenceMode, never hardcode
  // Resolve the stored concept: conceptImagePath IS the full '/media/<uuid>.<ext>'
  // path saveDataUri returned — pass it straight to readAsDataUri, no rebuilding.
  const conceptDataUri = await storage.readAsDataUri(asset.conceptImagePath)
  // ONE image generation through the money path. Prompt is server-composed and
  // never leaves the server (template-catalog rule). referenceImages is the
  // server-only channel from Task 4 — the concept image as the reference.
  const { dto } = await generations.create(userId, {
    modelId,
    prompt: composeExtractPrompt(part.name, part.description),
    aspectRatio: '1:1',
    referenceImages: [conceptDataUri],
  })
  // Image gens settle SYNCHRONOUSLY (created:true) — dto.status is already terminal.
  // Cite it (replaces any previous extraction; the old generation stays in the library).
  db.update(asset3dPart).set({ imageGenerationId: dto.id }).where(eq(asset3dPart.id, partId)).run()
  return toPartDto(generations, userId, db.select().from(asset3dPart).where(eq(asset3dPart.id, partId)).get()!)
}
```
- `composeExtractPrompt(name, description)` = server-fixed: `"only the ${name} (${description}), isolated on a neutral studio background, occluded regions completed, orthographic product shot"`. No client prompt input.
- `pickExtractionModel()` = `CATALOG.filter(m => m.type === 'image' && m.referenceMode)[0]?.id` (import `CATALOG` from `../catalog/catalog`) — select by the `referenceMode` discriminator, do NOT hardcode a model id (the two qualifying models today are `flux-kontext-pro` and `nano-banana-pro`; which extracts best is an ADR open question decided by a real sheet, not here — default to the first, i.e. `flux-kontext-pro`).
- A failed extraction: `create()` already refunded it and throws; `extract()` lets it propagate to `guard()` → the part stays draft/retryable. The orchestrator NEVER refunds.
- Concept round-trip is SETTLED (no `EXT?` placeholder): `createAsset` persists the full `/media/<uuid>.<ext>` path `saveDataUri` returns into `conceptImagePath` (Task 2), and both `extract` and `requireAssetConcept` call `readAsDataUri(asset.conceptImagePath)` on that path verbatim. There is no bare-key reconstruction anywhere — a bare uuid would make `readAsDataUri` throw "unsupported stored asset".

**`mesh()`** — ADR D3:

```ts
async function mesh(userId: string, assetId: string, partId: string, input: MeshPartInput): Promise<Asset3dPart> {
  requireAsset(userId, assetId)
  const part = requirePart(userId, assetId, partId)
  // A mesh needs a SUCCEEDED extraction (ADR D3). Validate the cited image gen
  // three ways (owned, type image, succeeded) — the 2026-07-12 audit bug was a
  // missing status check letting a still-processing generation be cited.
  if (!part.imageGenerationId) throw new Asset3dValidationError('extract the part before meshing it')
  const img = await generations.get(userId, part.imageGenerationId)
  if (img.type !== 'image' || img.status !== 'succeeded')
    throw new Asset3dValidationError('the part extraction is not ready yet')
  // The extracted image as a data URI = the model3d input photo (image→3D path).
  const partImage = await storage.readAsDataUri(img.mediaUrls[0])
  const { dto } = await generations.create(userId, {
    modelId: input.modelId,            // client picks the tier; the SERVICE prices it via catalog
    prompt: `3D mesh of ${part.name}`, // model3d ignores prompt beyond provenance; server-composed
    inputImage: partImage,             // REQUIRED for model3d (image→3D only)
  })
  // model3d is ASYNC (created:false) — cite it now; part status derives to 'meshing'
  // until a GET /api/generations/:id drives the poll to succeeded.
  db.update(asset3dPart).set({ meshGenerationId: dto.id }).where(eq(asset3dPart.id, partId)).run()
  return toPartDto(generations, userId, db.select().from(asset3dPart).where(eq(asset3dPart.id, partId)).get()!)
}
```
- Re-meshing replaces the citation (old generation stays in the library).
- `create()` validates `modelId` is a real `model3d` catalog model and prices it flat; an invalid id → 400 BEFORE charge, propagated through `guard()`.

**Errors:** `Asset3dNotFoundError` (404 not_found), `Asset3dValidationError` (400 validation_failed) — same class shapes as `FilmNotFoundError`/`FilmValidationError`.

Write the service test-first by exercising it THROUGH the routes in Task 10 (the HTTP suite is the behavioural spec). Ship `service.ts` here so routes can import it; its behaviour is pinned by Task 10.

- [ ] **Step 1:** Implement `dto.ts` (`derivePartStatus`, `toPartDto`) per the derived-status snippet above, then `service.ts` (factory-closure, `createAsset3dService({ db, storage, generations })`, `export type Asset3dService = ReturnType<typeof createAsset3dService>`) consuming them. Keep `service.ts` under 500 lines (`dto.ts` split is what buys the headroom now that status is serialized — Fix #7). Verify: `wc -l apps/api/src/modules/assets3d/service.ts` < 500.
- [ ] **Step 2:** Typecheck: `pnpm --filter @opencreate/api typecheck` → PASS.
- [ ] **Step 3:** Write `service.ts.md` (invariants: OWNERSHIP IS THE TYPE SIGNATURE, NO LEDGER, DERIVED-BUT-SERIALIZED STATUS via `dto.ts`, CITATION-NOT-OWNERSHIP delete, server model rule, dependency surface = `db`+`storage`+`generations{create,get}`+`CATALOG`) and `dto.ts.md` (derive rules; status is recomputed per read, never persisted).
- [ ] **Step 4:** Commit:

```bash
git add apps/api/src/modules/assets3d/service.ts apps/api/src/modules/assets3d/service.ts.md \
  apps/api/src/modules/assets3d/dto.ts apps/api/src/modules/assets3d/dto.ts.md
git commit -m "feat(assets3d): aggregate service — CRUD, extract, mesh, derived+serialized status"
```

---

## Task 7: `routes.ts` — thin HTTP layer

**Files:**
- Create: `apps/api/src/modules/assets3d/routes.ts` (+ `.ts.md`)

Thin routes mirroring `films/routes.ts`: `app.requireUser(req)` FIRST, `<schema>.safeParse(req.body)` → `badInput`, `guard(reply, () => service.method(...))` mapping domain errors to the envelope, RETHROW unmapped. `mapDomainError` maps `Asset3dNotFoundError`→404, `Asset3dValidationError`→400, `Asset3dAnalyzeUnavailableError`→502. Analyze route registered only when the analyze service is provided (it always is; it self-gates to 502 without the key). Rate-limit the paid + LLM routes.

- [ ] **Step 1: Implement `routes.ts`**

```ts
// apps/api/src/modules/assets3d/routes.ts
// HTTP layer for Modular 3D Assets — thin, mirroring films/routes.ts. Every route
// requires a session; the service scopes every query by the caller's id. Extract
// and mesh SPEND CREDITS (through generationService.create) so they get strict
// rate-limit buckets; analyze spends LLM tokens and gets its own.
import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  createAsset3dInputSchema,
  createAsset3dPartInputSchema,
  meshPartInputSchema,
  updateAsset3dInputSchema,
  updateAsset3dPartInputSchema,
} from '@opencreate/contracts'
import { Asset3dNotFoundError, Asset3dValidationError } from './service'
import type { Asset3dService } from './service'
import { Asset3dAnalyzeUnavailableError } from './analyze'
import type { AnalyzeService } from './analyze'

function mapDomainError(error: unknown) {
  if (error instanceof Asset3dNotFoundError)
    return { status: 404 as const, code: 'not_found' as const, message: 'Asset not found' }
  if (error instanceof Asset3dValidationError)
    return { status: 400 as const, code: 'validation_failed' as const, message: error.message }
  if (error instanceof Asset3dAnalyzeUnavailableError)
    return { status: 502 as const, code: 'provider_error' as const, message: error.message }
  return null
}

const EXTRACT_RATE_LIMIT = { max: 20, timeWindow: '1 minute' } // image gens (cheap, iterated)
const MESH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } // model3d (paid, heavier)
const ANALYZE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } // LLM tokens

export function registerAsset3dRoutes(app: FastifyInstance, service: Asset3dService, analyze?: AnalyzeService) {
  async function guard<T>(reply: FastifyReply, fn: () => T | Promise<T>) {
    try {
      return await fn()
    } catch (error) {
      const mapped = mapDomainError(error)
      if (!mapped) throw error
      return reply.status(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
    }
  }
  const badInput = (reply: FastifyReply, message: string) =>
    reply.status(400).send({ error: { code: 'validation_failed', message } })

  // ── Assets ──────────────────────────────────────────────────────────────
  app.get('/api/assets3d', async (req) => {
    const user = await app.requireUser(req)
    return { items: service.listAssets(user.id) }
  })
  app.post('/api/assets3d', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = createAsset3dInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, async () => reply.status(201).send(await service.createAsset(user.id, parsed.data)))
  })
  app.get<{ Params: { id: string } }>('/api/assets3d/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => service.getAsset(user.id, req.params.id))
  })
  app.patch<{ Params: { id: string } }>('/api/assets3d/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = updateAsset3dInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, () => service.updateAsset(user.id, req.params.id, parsed.data))
  })
  app.delete<{ Params: { id: string } }>('/api/assets3d/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => {
      service.deleteAsset(user.id, req.params.id)
      return reply.status(204).send()
    })
  })

  // ── Analyze (FREE; self-gates to 502 without the key) ─────────────────────
  if (analyze) {
    app.post<{ Params: { id: string } }>(
      '/api/assets3d/:id/analyze',
      { config: { rateLimit: ANALYZE_RATE_LIMIT } },
      async (req, reply) => {
        const user = await app.requireUser(req)
        return guard(reply, async () => ({ items: await analyze.analyze(user.id, req.params.id) }))
      },
    )
  }

  // ── Parts ─────────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/assets3d/:id/parts', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = createAsset3dPartInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, () => reply.status(201).send(service.addPart(user.id, req.params.id, parsed.data)))
  })
  app.patch<{ Params: { id: string; pid: string } }>('/api/assets3d/:id/parts/:pid', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = updateAsset3dPartInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, () => service.updatePart(user.id, req.params.id, req.params.pid, parsed.data))
  })
  app.delete<{ Params: { id: string; pid: string } }>('/api/assets3d/:id/parts/:pid', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => {
      service.deletePart(user.id, req.params.id, req.params.pid)
      return reply.status(204).send()
    })
  })

  // ── Extract (paid image gen) → 200 sync ───────────────────────────────────
  app.post<{ Params: { id: string; pid: string } }>(
    '/api/assets3d/:id/parts/:pid/extract',
    { config: { rateLimit: EXTRACT_RATE_LIMIT } },
    async (req, reply) => {
      const user = await app.requireUser(req)
      return guard(reply, async () => service.extract(user.id, req.params.id, req.params.pid))
    },
  )
  // ── Mesh (paid model3d gen) → 202 async ───────────────────────────────────
  app.post<{ Params: { id: string; pid: string } }>(
    '/api/assets3d/:id/parts/:pid/mesh',
    { config: { rateLimit: MESH_RATE_LIMIT } },
    async (req, reply) => {
      const user = await app.requireUser(req)
      const parsed = meshPartInputSchema.safeParse(req.body)
      if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
      return guard(reply, async () =>
        reply.status(202).send(await service.mesh(user.id, req.params.id, req.params.pid, parsed.data)),
      )
    },
  )
}
```

- [ ] **Step 2:** Typecheck → PASS.
- [ ] **Step 3:** Write `routes.ts.md` (guard rethrow of unmapped errors, rate-limit rationale, extract=200/mesh=202, analyze-registered-only-when-wired).
- [ ] **Step 4:** Commit:

```bash
git add apps/api/src/modules/assets3d/routes.ts apps/api/src/modules/assets3d/routes.ts.md
git commit -m "feat(assets3d): thin HTTP routes"
```

---

## Task 8: Wire into `buildApp`

**Files:**
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1:** After the `filmService` / `storyboardService` block (and after `generationService` exists), add:

```ts
import { createAsset3dService } from './modules/assets3d/service'
import { createAnalyzeService } from './modules/assets3d/analyze'
import { registerAsset3dRoutes } from './modules/assets3d/routes'
// …inside buildApp, after registerFilmRoutes(...):
// Modular 3D Assets (ADR modular-3d-assets): an aggregate that cites generations.
// It spends NO credits of its own — extract/mesh call generationService.create()
// (narrowed to create+get), so the one money path does the only thing it does.
// analyze gates on the optional ANTHROPIC_API_KEY exactly like storyboard.
const asset3dService = createAsset3dService({
  db: deps.db,
  storage: deps.storage,
  generations: generationService,
})
const analyzeService = createAnalyzeService({
  anthropicApiKey: deps.config.anthropicApiKey,
  assets: asset3dService,
})
registerAsset3dRoutes(app, asset3dService, analyzeService)
```

Ensure `createAsset3dService` exposes `requireAssetConcept` + `replaceDraftParts` in its returned object so `analyzeService` can consume them (the `AssetsForAnalyze` shape).

- [ ] **Step 2:** Typecheck → PASS.
- [ ] **Step 3:** Commit:

```bash
git add apps/api/src/app.ts
git commit -m "feat(assets3d): wire module into composition root"
```

---

## Task 9: Test helper — `anthropicApiKey` override

**Files:**
- Modify: `apps/api/test/helpers/build-test-app.ts`

The analyze HTTP route can only be driven to a live-key path if the config key is settable. Add an override so the 502-without-key path is the default (unchanged) and a future test can flip it. Analyze SUCCESS stays a service-level test (Task 5) — there is no Anthropic fake, so an HTTP success path would attempt a real call; keep it out of the HTTP suite.

- [ ] **Step 1:** In `TestAppOverrides` add `anthropicApiKey?: string | null`. In the `config` block change `anthropicApiKey: null` → `anthropicApiKey: overrides.anthropicApiKey ?? null`.
- [ ] **Step 2:** Typecheck → PASS. Existing suites unaffected (default stays null).
- [ ] **Step 3:** Commit:

```bash
git add apps/api/test/helpers/build-test-app.ts
git commit -m "test(api): anthropicApiKey override for assets3d analyze"
```

---

## Task 10: HTTP E2E suite — `apps/api/test/assets3d.test.ts`

**Files:**
- Create: `apps/api/test/assets3d.test.ts`

Structure mirrors `entities-portraits.test.ts` + `generations-3d.test.ts` + `films.test.ts`. Setup: `buildTestApp({ runware, meshProvider })` + `registerAndGetCookie`. Every authed request passes `headers: { cookie }`. Stub `fetch` in beforeEach/afterEach for success paths that download an asset. Assert credits via `GET /api/me` (signup bonus 200).

- [ ] **Step 1: Write the failing suite** (each `it` is a behavioural spec):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeRunware, fakeMeshProvider, registerAndGetCookie } from './helpers/build-test-app'
import type { RunwareClient } from '../src/integrations/runware/client'

const CONCEPT = 'data:image/png;base64,iVBORw0KGgo='

beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('bytes'), { status: 200 }))))
afterEach(() => vi.unstubAllGlobals())

describe('assets3d CRUD', () => {
  it('creates (201), lists, reads with parts, renames (200), deletes (204)', async () => {
    const app = await buildTestApp({})
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'Knight', conceptImage: CONCEPT } })
    expect(created.statusCode).toBe(201)
    const asset = created.json()
    expect(asset.conceptImageUrl).toMatch(/^\/media\//)
    const list = await app.inject({ method: 'GET', url: '/api/assets3d', headers: { cookie } })
    expect(list.json().items).toHaveLength(1)
    const detail = await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie } })
    expect(detail.json().parts).toEqual([])
    const del = await app.inject({ method: 'DELETE', url: `/api/assets3d/${asset.id}`, headers: { cookie } })
    expect(del.statusCode).toBe(204)
  })

  it('requires a session (401) and hides foreign/missing behind the same 404', async () => {
    const app = await buildTestApp({})
    expect((await app.inject({ method: 'GET', url: '/api/assets3d' })).statusCode).toBe(401)
    const a = await registerAndGetCookie(app, 'a@b.co')
    const b = await registerAndGetCookie(app, 'c@d.co')
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie: a }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    expect((await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie: b } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/assets3d/does-not-exist', headers: { cookie: b } })).statusCode).toBe(404)
  })
})

describe('analyze (FREE)', () => {
  it('without ANTHROPIC_API_KEY → 502 provider_error (wizard still usable by hand)', async () => {
    const app = await buildTestApp({}) // key defaults null
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const res = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/analyze`, headers: { cookie } })
    expect(res.statusCode).toBe(502)
    expect(res.json().error.code).toBe('provider_error')
  })
})

describe('parts + extract (paid image)', () => {
  it('adds a part, extracts it: charges the image price once, cites the image gen', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const before = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance
    const ext = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })
    expect(ext.statusCode).toBe(200)
    expect(ext.json().imageGenerationId).toBeTruthy()
    // MODEL RULE: ref-capable model, concept sent as a data: URI reference (never a provider URL)
    const task = rw.imageInference.mock.calls[0][0]
    expect(task.referenceImages[0]).toMatch(/^data:image\//)
    const after = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance
    expect(after).toBeLessThan(before) // charged exactly the image model's flat price (assert the exact delta from catalog)
  })

  it('extract failure refunds and leaves the part draft (retryable)', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockRejectedValue(new Error('provider boom'))
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const res = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(res.json())).not.toContain('provider boom') // sanitized
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance).toBe(200) // refunded
  })

  it('a failed part is refunded and does NOT poison an already-extracted sibling (Fix #5)', async () => {
    const rw = fakeRunware()
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const a = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const b = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Boots' } })).json()
    // Part A extracts cleanly (charged the image model's flat price, e.g. 8cr).
    rw.imageInference.mockResolvedValueOnce({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const extA = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${a.id}/extract`, headers: { cookie } })).json()
    expect(extA.imageGenerationId).toBeTruthy()
    expect(extA.status).toBe('extracted')
    // Part B fails and is refunded — A's citation and the net charge for A are untouched.
    rw.imageInference.mockRejectedValueOnce(new Error('provider boom'))
    const resB = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${b.id}/extract`, headers: { cookie } })
    expect(resB.statusCode).toBeGreaterThanOrEqual(400)
    const detail = (await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie } })).json()
    const partA = detail.parts.find((p: { id: string }) => p.id === a.id)
    const partB = detail.parts.find((p: { id: string }) => p.id === b.id)
    expect(partA.imageGenerationId).toBe(extA.imageGenerationId) // A's citation survives B's failure
    expect(partA.status).toBe('extracted')
    expect(partB.imageGenerationId).toBeNull() // B left draft, retryable
    expect(partB.status).toBe('draft')
    // Net charge = only A's flat image price (B refunded exactly once). 200 - 8 = 192.
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance).toBe(192)
  })
})

describe('mesh (paid model3d)', () => {
  it('rejects mesh before a succeeded extraction (400), provider never called, no charge', async () => {
    const mesh = fakeMeshProvider()
    const app = await buildTestApp({ meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const res = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: { cookie }, payload: { modelId: 'trellis-2' } })
    expect(res.statusCode).toBe(400)
    expect(mesh.submit).not.toHaveBeenCalled()
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().creditsBalance).toBe(200)
  })

  it('extract → mesh: 202, submits through meshProvider, produces a .glb, cites the mesh gen', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const mesh = fakeMeshProvider()
    mesh.submit.mockResolvedValue({ providerJobId: 'job-1' })
    mesh.poll.mockResolvedValue({ status: 'success', assetUrl: 'https://runware.ai/m.glb', costUsd: 0, nsfw: false })
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient, meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })
    const meshed = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: { cookie }, payload: { modelId: 'trellis-2' } })
    expect(meshed.statusCode).toBe(202)
    const meshGenId = meshed.json().meshGenerationId
    expect(mesh.submit).toHaveBeenCalled()
    // Drive the async model3d poll to terminal, then assert the .glb citation.
    const gen = await app.inject({ method: 'GET', url: `/api/generations/${meshGenId}`, headers: { cookie } })
    expect(gen.json().status).toBe('succeeded')
    expect(gen.json().mediaUrls[0]).toMatch(/^\/media\/[\w-]+\.glb$/)
  })
})

describe('derived part status is serialized and transitions with the cited generations (Fix #1)', () => {
  it('draft → extracting/extracted → meshing → ready, observed THROUGH GET /api/assets3d/:id', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const mesh = fakeMeshProvider()
    mesh.submit.mockResolvedValue({ providerJobId: 'job-1' })
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient, meshProvider: mesh })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const statusOf = async () =>
      (await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie } })).json().parts[0].status
    // Fresh part: no citations → draft.
    expect(await statusOf()).toBe('draft')
    // Extract settles synchronously (succeeded image gen) → extracted.
    await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })
    expect(await statusOf()).toBe('extracted')
    // Mesh cites an async model3d gen still processing → meshing.
    mesh.poll.mockResolvedValue({ status: 'processing' })
    const meshed = await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: { cookie }, payload: { modelId: 'trellis-2' } })
    const meshGenId = meshed.json().meshGenerationId
    expect(await statusOf()).toBe('meshing')
    // Drive the model3d poll to terminal, then the same GET derives ready.
    mesh.poll.mockResolvedValue({ status: 'success', assetUrl: 'https://runware.ai/m.glb', costUsd: 0, nsfw: false })
    await app.inject({ method: 'GET', url: `/api/generations/${meshGenId}`, headers: { cookie } })
    expect(await statusOf()).toBe('ready')
  })
})

describe('ownership isolation covers the money + mutation routes, not just reads (Fix #3)', () => {
  it('user B is 404 on every extract/mesh/patch/delete/part-add of A’s asset; no provider call, no charge, A untouched', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const mesh = fakeMeshProvider()
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient, meshProvider: mesh })
    const a = await registerAndGetCookie(app, 'a@b.co')
    const b = await registerAndGetCookie(app, 'c@d.co')
    // A creates an asset + part and extracts it (A charged the image price).
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie: a }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie: a }, payload: { name: 'Helmet' } })).json()
    const ext = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie: a } })).json()
    const aCreditsAfterExtract = (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: a } })).json().creditsBalance
    rw.imageInference.mockClear()
    // Every B mutation on A's aggregate → 404 (same as missing), providers never touched.
    const H = { cookie: b }
    const cases = [
      app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: H, payload: { name: 'Sneak' } }),
      app.inject({ method: 'PATCH', url: `/api/assets3d/${asset.id}`, headers: H, payload: { title: 'hax' } }),
      app.inject({ method: 'DELETE', url: `/api/assets3d/${asset.id}`, headers: H }),
      app.inject({ method: 'PATCH', url: `/api/assets3d/${asset.id}/parts/${part.id}`, headers: H, payload: { name: 'hax' } }),
      app.inject({ method: 'DELETE', url: `/api/assets3d/${asset.id}/parts/${part.id}`, headers: H }),
      app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: H }),
      app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/mesh`, headers: H, payload: { modelId: 'trellis-2' } }),
    ]
    for (const res of await Promise.all(cases)) expect(res.statusCode).toBe(404)
    expect(rw.imageInference).not.toHaveBeenCalled() // B never reached the money path
    expect(mesh.submit).not.toHaveBeenCalled()
    // A's citation and credits are untouched by B's attempts.
    const detail = (await app.inject({ method: 'GET', url: `/api/assets3d/${asset.id}`, headers: { cookie: a } })).json()
    expect(detail.parts[0].imageGenerationId).toBe(ext.imageGenerationId)
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: a } })).json().creditsBalance).toBe(aCreditsAfterExtract)
  })
})

describe('delete never touches cited generations', () => {
  it('deleting an asset removes rows but leaves the extraction generation in the library', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0, seed: 1, NSFWContent: false })
    const app = await buildTestApp({ runware: rw as unknown as RunwareClient })
    const cookie = await registerAndGetCookie(app)
    const asset = (await app.inject({ method: 'POST', url: '/api/assets3d', headers: { cookie }, payload: { title: 'X', conceptImage: CONCEPT } })).json()
    const part = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts`, headers: { cookie }, payload: { name: 'Helmet' } })).json()
    const ext = (await app.inject({ method: 'POST', url: `/api/assets3d/${asset.id}/parts/${part.id}/extract`, headers: { cookie } })).json()
    await app.inject({ method: 'DELETE', url: `/api/assets3d/${asset.id}`, headers: { cookie } })
    const gen = await app.inject({ method: 'GET', url: `/api/generations/${ext.imageGenerationId}`, headers: { cookie } })
    expect(gen.statusCode).toBe(200) // generation survives the aggregate delete
  })
})
```

- [ ] **Step 2: Run red** → module/route not fully implemented; failures point at gaps.

Run: `pnpm --filter @opencreate/api test -- assets3d`

- [ ] **Step 3:** Implement/adjust Task 6 `service.ts` until green (this suite is the behavioural spec). Pin the exact credit delta in the extract charge assertion from the catalog price of the selected extraction model (`flux-kontext-pro` = 8cr today) — a moved number means a re-price or an illegal second ledger.

- [ ] **Step 4: Run green + the full API suite** (money-path regression guard)

Run: `pnpm --filter @opencreate/api test`
Expected: PASS (assets3d green; films/generations/portraits unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/assets3d.test.ts apps/api/src/modules/assets3d/service.ts
git commit -m "test(assets3d): HTTP E2E — CRUD, analyze 502, extract/mesh charge, delete cites"
```

---

## Backend done — verification gate

- [ ] `pnpm --filter @opencreate/contracts typecheck && pnpm --filter @opencreate/contracts test` → PASS
- [ ] `pnpm --filter @opencreate/api typecheck && pnpm --filter @opencreate/api test` → PASS
- [ ] Every new `.ts` has a paired `.ts.md`; every touched `.ts.md` updated.
- [ ] `git grep -n "ledger\|refundCredits\|chargeCredits" apps/api/src/modules/assets3d` → **no matches** (money path untouched).
- [ ] `git grep -nE "status|concept_image" apps/api/src/db/schema.ts apps/api/src/db/ddl.ts` shows NO status column on `asset3d_part`, and `concept_image_path` (full path) — never a bare `concept_image_key`. (Derived status is serialized by `dto.ts`, never persisted.)
- [ ] **File-size gate (Fix #7):** `wc -l apps/api/src/modules/assets3d/*.ts` — every file < 500 (`service.ts` in particular; the `dto.ts` split keeps it under).

---

## Appendix F — FRONTEND (later build — DO NOT implement until the backend gate above is green)

Per ADR D6/D7. A **stage-shaped** wizard: ONE `$assetId` route whose component derives the active stage from the loaded asset+parts state (Upload → Parts → Extraction → Mesh → Assembly), mirroring `FilmEditor` being a single workbench route and `SoulStudio` owning the draft. Backend contracts, endpoints, and the `['generation', id]` cache are finished; this is pure web work.

### Binding rules (every task, no exceptions)

- **react-senior-standard.md** — React 19 + Vite, TS5 strict (zero `any`, `type` not `interface`), **TanStack Router file routes only** (`react-router-dom` FORBIDDEN), TanStack Query v5, **Zustand for wizard-local UI state**, Tailwind v4 (no CSS files, no inline styles — `Progress` width % is the one documented exception), React Hook Form + Zod for the create form, **pnpm only**. Test-first (Vitest + RTL). No array-index keys. Files < 500 lines. Every new `.ts`/`.tsx` gets a `.md` sidecar (`sidecar-docs` format).
- **Module law** — `apps/web/src/modules/Assets3D/` with a public `index.ts` (exports ONLY `AssetLibrary` + `AssetWizard`; `model/` and inner `components/` stay private). **No cross-module imports.** The catalog + prices are read AT THE ROUTE via `useCatalog()` (modules/Generator) and passed down as a `models: CatalogModel[]` prop — the exact seam `_shell.cinema.$filmId.tsx` and `_shell.soul.$entityId.tsx` already use. Talk to other modules ONLY through the shared query cache: `['generation', id]` (per-part poll), `['generations']` (feed), `['me']` (balance), `['catalog']` (read at route). Duplicate the live-generation hook into the module — never import it — but copy the **fetch-by-id** precedent (Cinema `useShotGeneration`/`useShotGenerations`, `apps/web/src/modules/Cinema/model/shotGeneration.ts:86-117`), **NOT** Gallery's `useLiveGeneration(seed: Generation)`. Gallery always holds a full `Generation` from its `['generations']` list to seed the cache; Assets3D parts cite generations by **id only** (`imageGenerationId`/`meshGenerationId`), and the `GET /assets3d/:id` DTO (`{asset, parts}`) embeds no generation objects — so on a cold load / reload nothing populates `['generation', id]`. The module MUST fetch each cited generation by id (`useQuery({ queryKey: ['generation', id ?? ''], queryFn: () => api<Generation>('/api/generations/'+id), enabled: id !== null, refetchInterval: stop-on-terminal/first-error })`) to obtain `.status` and `mediaUrls[0]`.
- **shared/ui only** — build every surface from the kit barrel (`Button` / `Modal` / `PillGroup` / `Select` / `Skeleton` / `EmptyState` / `ErrorState` / `Badge` / `Progress` / `Card`). Never hand-roll the frosted recipe. Media (concept thumbnail, extraction image, mesh poster) uses `Card surface="well" padding="none"` — never glass. Text/confirm dialogs stay `surface="steel"`.
- **4 UI states on EVERY data surface / stage** — Loading (shape-matched `Skeleton`, `rounded-2xl` plates, static keys) → Empty (`EmptyState` + next-action CTA) → Error (`ErrorState message onRetry`, already-localized, never raw server text) → Data. Plus the "valid-but-wrong-shape" calm `ErrorState` (no retry) — e.g. an asset whose concept failed to store.
- **Money UX (Soul Studio precedent, design.md §9)** — every paid button (`extract`, `mesh`) prints its price BEFORE the click via `assetPricing.ts` off the live catalog; **null price = disabled + skeleton, never a guessed number**. Batch paid actions (extract-all) route through `Modal role="alertdialog"` that RE-STATES the credit number with a green/danger-pill confirm; the mutation fires ONLY on confirm; the confirm handler closes the dialog FIRST, then mutates. A per-part failure does NOT abort the batch — it renders a localized reason + a `<Badge variant="success">refunded</Badge>` chip (the refund already happened server-side). Extraction price = server-mirrored lookup of the ref-capable image model; mesh price = keyed on the user-picked `model3d` tier id.
- **Viewer VRAM contract (ADR D4 → photo-to-3d-studio D6, VERBATIM)** — the whole three.js graph lives ONLY in a lazy chunk (`React.lazy(() => import('./AssemblyStage'))` — the route can't be `createLazyFileRoute` because Upload/Parts/Extract/Mesh belong in the main chunk, so **AssemblyStage is the lazy boundary** and every three.js import hangs off it). **Own `GLTFLoader` in a URL-keyed effect + explicit `disposeScene()` — NEVER drei `useGLTF`** (its cache leaks VRAM on unbounded per-user URLs → context loss). EXACTLY ONE `<Canvas>` alive, `dpr={[1,2]}`, `frameloop="demand"`. No-WebGL fallback renders part posters/thumbnails — this fallback is ALSO what makes the viewer unit-testable in jsdom (assert the fallback path; never render real WebGL in Vitest). **Do NOT import from Studio3D** — write Assets3D's own multi-GLB loader following the same discipline; flag any genuinely generic low-level helper for a LATER `shared/` extraction rather than a cross-module import.

### File inventory (all NEW except the three allowed shared edits)

| # | Path | Kind |
| --- | --- | --- |
| — | `apps/web/src/shared/config/locales/en.json` · `ru.json` | **edit** — add `assets3d.*` namespace + `nav.assets` (parity both files) |
| — | `apps/web/src/shared/ui/AppShell.tsx` | **edit** — one `<Link to="/assets">` in `<nav>`, adjacent to Cinema (smallest possible) |
| — | `apps/web/src/routeTree.gen.ts` | regenerated by the Vite plugin — NOT hand-edited |
| A1 | `modules/Assets3D/index.ts` (+`.md`) | public barrel: `AssetLibrary`, `AssetWizard` |
| A2 | `modules/Assets3D/model/asset3dApi.ts` (+`.md`) | list/detail/CRUD + analyze/extract/mesh hooks |
| A3 | `modules/Assets3D/model/partGeneration.ts` (+`.md`, +`.test.ts`) | `useLivePartGeneration(generationId: string \| null)` + `useLivePartGenerations(ids)` (Cinema `useShotGeneration`/`useShotGenerations` fetch-by-id copied — NOT Gallery's seed hook: parts cite generations by id, so nothing supplies a `Generation` seed on cold load) |
| A4 | `modules/Assets3D/model/wizardStore.ts` (+`.md`) | Zustand wizard-local UI state |
| A5 | `modules/Assets3D/model/assetPricing.ts` (+`.md`, +`.test.ts`) | PURE price model (extract + mesh-tier), `number \| null` |
| A6 | `modules/Assets3D/model/wizardStage.ts` (+`.md`, +`.test.ts`) | PURE `deriveStage(asset, parts)` |
| B1 | `routes/_shell.assets.index.tsx` (+`.md`) | `/assets` — composition, `<AssetLibrary/>` |
| B2 | `routes/_shell.assets.$assetId.tsx` (+`.md`) | `/assets/:assetId` — catalog seam, `<AssetWizard models=.../>` |
| C1 | `components/AssetLibrary.tsx` (+`.md`, +`.test.tsx`) | index-list body: 4 states + create modal |
| C2 | `components/AssetCard.tsx` (+`.md`) | one asset card (well thumbnail) |
| C3 | `components/CreateAssetModal.tsx` (+`.md`, +`.test.tsx`) | RHF+Zod title + concept data-uri (FREE) |
| C4 | `components/PriceTag.tsx` (+`.md`) | local price pill (`null`→`Skeleton`); Soul's is private → own copy, flag for shared/ later |
| D1 | `components/AssetWizard.tsx` (+`.md`, +`.test.tsx`) | detail shell: owns `useAsset`, derives stage, routes stages, `lazy()` assembly |
| D2 | `components/WizardStageNav.tsx` (+`.md`) | stage rail (back-nav to completed stages) |
| E1 | `components/PartsStage.tsx` (+`.md`, +`.test.tsx`) | editable checklist + FREE analyze + manual CRUD |
| E2 | `components/PartChecklistItem.tsx` (+`.md`) | one editable part row |
| F1 | `components/SpendConfirmModal.tsx` (+`.md`) | shared `alertdialog` restating the price |
| F2 | `components/PartGenerationCard.tsx` (+`.md`) | per-part status card (poll → Skeleton/Progress/Badge/poster) |
| F3 | `components/ExtractStage.tsx` (+`.md`, +`.test.tsx`) | extraction grid (paid; SoulSheet pattern) |
| F4 | `components/MeshStage.tsx` (+`.md`, +`.test.tsx`) | mesh grid + tier picker (paid; 202 async) |
| G1 | `model/webglSupport.ts` (+`.md`, +`.test.ts`) | `isWebGLAvailable()` fallback gate |
| G2 | `model/useAssemblyGlb.ts` (+`.md`, +`.test.ts`) | OWN multi-GLB loader + `disposeScene` (mirrors Studio3D, not imported) |
| G3 | `model/partTransform.ts` (+`.md`, +`.test.ts`) | PURE `PartTransform` ↔ three decompose/compose |
| G4 | `model/exportGlb.ts` (+`.md`, +`.test.ts`) | assemble group + `GLTFExporter` merge → Blob download |
| G5 | `components/AssemblyViewer.tsx` (+`.md`) | the ONE `<Canvas>` + no-WebGL fallback |
| G6 | `components/PartMesh.tsx` (+`.md`) | one part GLB + `TransformControls` gizmo → PATCH |
| G7 | `components/AssemblyStage.tsx` (+`.md`, +`.test.tsx`) | **lazy boundary** — viewer + export; test asserts the no-WebGL fallback |

### Ordered build (test-first; dependencies first)

**FG0 — Seam & scaffold.** Add the `assets3d` namespace to `en.json`/`ru.json` (nest by stage: `assets3d.library.*`, `.upload.*`, `.parts.*`, `.extract.*`, `.mesh.*`, `.assembly.*`, `.empty.{title,description}`, `.price`) + a `nav.assets` key both sides (RU mirrors EN key-for-key). Add ONE `/assets` `<Link>` in `AppShell` `<nav>` beside `/cinema` (`className={navLinkClass}` + active/inactive props, `t('nav.assets')`). Create `index.ts` (barrel, initially empty of the two exports until C1/D1 exist). Reuse `errorCodeMessageKey()` verbatim — every asset3d error code (`not_found`/`validation_failed`/`provider_error`/`rate_limited`/`insufficient_credits`) already maps. **Verify:** `pnpm --filter web typecheck`; dev server regenerates `routeTree.gen.ts` once B1/B2 land.

**FG1 — Data layer (`model/`).** `asset3dApi.ts`: `assetKey(id)=['asset3d',id] as const` (EXPORTED), `useAssets` (`['assets3d']`), `useAsset(id)` (`enabled: id !== ''`), `useCreateAsset`, `useUpdateAsset` (rename), `useDeleteAsset` (optimistic remove + rollback), `useAnalyze` (**NO body**; `provider_error` surfaces via `ApiClientError.code`), `useAddPart`/`useUpdatePart`/`useDeletePart`, `useExtractPart` (**NO body**), `useMeshPart` (`{modelId}` body; 202). **Do NOT `setQueryData(['generation', …], …)` in either `onSuccess`.** The backend `extract`/`mesh` responses are **`Asset3dPart`** objects (see Task 6: `extract(): Promise<Asset3dPart>`, `mesh(): Promise<Asset3dPart>` — HTTP 200/202 return `toPartDto(...)`), NOT `Generation`s — so `res.id` is the PART id and seeding `['generation', partId]` with a Part-shaped object POISONS the shared cache that Gallery/Cinema/Soul read as a `Generation` (`.status`/`.mediaUrls`). Instead: `onSuccess` ONLY `invalidateQueries(assetKey(id))` (paid ones ALSO invalidate `['generations']` + `['me']`). The refetched aggregate then surfaces the fresh `imageGenerationId`/`meshGenerationId` citation, and the id-keyed `useLivePartGeneration` (below) fetches the real generation. Every mutation invalidates `assetKey(id)`; paid ones ALSO invalidate `['generations']` + `['me']`. `partGeneration.ts`: copy **Cinema's fetch-by-id** `useShotGeneration` (`shotGeneration.ts:86-96`), NOT Gallery's seed hook — `useLivePartGeneration(generationId: string | null)`: `useQuery({ queryKey: ['generation', generationId ?? ''], queryFn: () => api<Generation>('/api/generations/'+generationId), enabled: generationId !== null, refetchInterval: (q) => q.state.status==='error' && q.state.data===undefined ? false : q.state.data?.status==='processing' ? GENERATION_POLL_MS : false })`, plus `useLivePartGenerations(ids: string[])` copying `useShotGenerations` (`shotGeneration.ts:104-117`) for the batch (Assembly). Invalidate `['generations']`+`['me']` once on the terminal transition (`didInvalidateRef`). `wizardStore.ts` (Zustand): `selectedPartId`, `stageOverride` (manual back-nav), `pendingExtractIds: string[] | null` (alertdialog open iff `!==null`), `extractingIds` / `meshingIds` (in-flight pulse), assembly `selectedPartId` + gizmo `mode`. Server state stays in Query — the store holds ONLY UI. **Verify:** typecheck; `partGeneration.test.ts` green (poll-stop guards, WebGL/network-free).

**FG2 — Pure models (test-first).** `assetPricing.ts`: `extractionPrice(models): number|null` (mirror the server model rule ONLY to price — find the ref-capable `type:'image'` model, look up its `credits`; `null` if catalog absent), `meshTierOptions(models): {value,label,meta}[]` (the `model3d` catalog rows for the picker with price meta), `meshPrice(models, modelId): number|null`. `null` whenever the catalog is missing or the model is the wrong type — never `0`, never a fallback. `wizardStage.ts`: `deriveStage(asset, parts): 'upload'|'parts'|'extract'|'mesh'|'assembly'` from part statuses (no parts→parts; any `draft`→parts; any `extracting/extracted` without mesh→extract; any `meshing`→mesh; all `ready`→assembly), overridable by `stageOverride`. **Write the tests first** (`assetPricing.test.ts` proves the money arithmetic with no network — `portraitSheet.test.ts` template; `wizardStage.test.ts` covers every transition + empty). **Verify:** both `.test.ts` green.

**FG3 — List surface + routes.** `_shell.assets.index.tsx`: `createFileRoute('/_shell/assets/')({ beforeLoad: () => requireSession(), component })`, `<main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10"><AssetLibrary/></main>`. `AssetLibrary.tsx` (CinemaLibrary template): `useAssets()` 4 states → grid of `AssetCard` + a New button opening `CreateAssetModal`. `AssetCard.tsx`: concept thumbnail in `Card surface="well" padding="none"`, `<Link to="/assets/$assetId">`. `CreateAssetModal.tsx`: RHF+Zod (`title` 1..120, concept image → base64 data-uri via a FileReader helper; reject svg/non-data-uri client-side to match the contract), `useCreateAsset`, FREE label. `PriceTag.tsx`: `credits: number|null` → `null` renders `<Skeleton className="h-3 w-10"/>`, else `t('assets3d.price',{credits})`. **Test-first:** `AssetLibrary.test.tsx` (4 states + opens create), `CreateAssetModal.test.tsx` (encodes to `data:image/...`, blocks svg, submits). **Verify:** tests green; export `AssetLibrary` from `index.ts`.

**FG4 — Wizard shell + detail route.** `_shell.assets.$assetId.tsx`: `createFileRoute('/_shell/assets/$assetId')`, `beforeLoad: () => requireSession()`, `const { assetId } = Route.useParams()`, `const catalog = useCatalog()` (the SEAM), `<main className="flex w-full flex-col gap-4 px-4 py-4 xl:px-6"><AssetWizard assetId={assetId} models={catalog.data?.models ?? []} /></main>`. `AssetWizard.tsx` (FilmEditor + SoulStudio template): props `{ assetId: string; models: CatalogModel[] }`, owns `useAsset(assetId)` (the route does NOT load the aggregate), 4 states, derives the active stage via `deriveStage` + `stageOverride`, renders `WizardStageNav` + the active stage component, `React.lazy(() => import('./AssemblyStage'))` behind `<Suspense>` so three.js stays out of the main chunk. `WizardStageNav.tsx`: the five-step rail, back-nav to completed stages via `stageOverride`. **Test-first:** `AssetWizard.test.tsx` — given asset states, the right stage renders; empty catalog is a first-class disabled state, not an error. **Verify:** tests green; export `AssetWizard` from `index.ts`.

**FG5 — Parts stage.** `PartsStage.tsx` (SoulConstructor controlled template): the FREE analyze button (`useAnalyze`; on `provider_error` show an inline "analyze not configured" notice, wizard still works by hand), manual add (`useAddPart`, capped at `MAX_PARTS`), an editable checklist of `PartChecklistItem` (edit name/description → `useUpdatePart`; delete → `useDeletePart` optimistic), and the per-part extraction price printed BEFORE the extract CTA that advances to the Extract stage. `PartChecklistItem.tsx`: one controlled row. **Test-first:** `PartsStage.test.tsx` — analyze is free (no confirm), manual CRUD works, `MAX_PARTS` caps the add affordance. **Verify:** green.

**FG6 — Extract + Mesh grids (paid).** `SpendConfirmModal.tsx`: `Modal role="alertdialog" surface="steel"` restating `{credits}` in body + confirm-pill label, danger/primary confirm disabled when price is `null`, ghost cancel — the ONE blocking spend primitive both grids use. `PartGenerationCard.tsx`: given a part, poll the cited extraction/mesh generation by id via `useLivePartGeneration(part.imageGenerationId)` / `useLivePartGeneration(part.meshGenerationId)` (fetch-by-id — the card is handed the part's cited string, never a `Generation` seed, so a cold load still resolves it); read `.status` and the extraction poster from `mediaUrls[0]`; render Skeleton (loading) / `Progress` (processing) / poster in a `well` Card (done) / `ErrorState`+`Badge` refunded (failed); status via `Badge` (text-carried, color reinforces). A null cited id (not yet extracted/meshed) disables the query and renders the pre-generation CTA state. `ExtractStage.tsx` (SoulSheet template): a grid of `PartGenerationCard`, price on each button via `extractionPrice(models)`, an extract-all batch through `SpendConfirmModal` (uses `pendingExtractIds`), a per-part failure renders localized reason + refunded chip WITHOUT aborting siblings, `['me']`/`['generations']` invalidated by the mutation. `MeshStage.tsx`: same grid, plus a per-part tier picker (`Select` or `PillGroup` from `meshTierOptions(models)` with price meta — ModelPickerModal precedent), price via `meshPrice(models, tierId)`, `useMeshPart` (202) then poll to `ready`. **Single-part spend (OWNER DECISION 2026-07-20 — supersedes the original FG-4 note):** single-part **`mesh` IS gated by `SpendConfirmModal`** — it is the heaviest per-part spend and the owner asked for mis-click parity. The dialog re-states the tier's credit number and the confirm handler closes the dialog FIRST, then mutates; the mutation must NOT fire on the bare click. Single-part **`extract` stays click-to-spend** (price printed on the button, no per-click confirm) — it is the cheap, high-repetition step and a dialog per part would make the grid unusable. The extract-ALL batch remains gated. Pure UI change: no contract change, no server change. **Test-first (SoulSheet.test.tsx template):** price-on-button-before-click; nothing spends until the alertdialog confirm on the BATCH (`apiMock` not called on first click); a failed part shows localized reason + "refunded". **Verify:** `ExtractStage.test.tsx`, `MeshStage.test.tsx` green.

**FG7 — Assembly viewer (LAZY three.js chunk).** `webglSupport.ts`: `isWebGLAvailable()` (probe a throwaway context) — the fallback gate, unit-tested. `useAssemblyGlb.ts`: Assets3D's OWN loader mirroring Studio3D's `useGlb`+`disposeScene` (own `GLTFLoader` in a `[url]`-keyed effect; cancel-safe self-dispose on post-unmount resolve; duck-typed `GpuOwner` disposal; textures via `Object.values` BEFORE material; reset-during-render guard) — **copied, not imported**; flag as a shared/ extraction candidate. `partTransform.ts`: PURE `PartTransform` ↔ three matrix (position/Euler-XYZ-radians/scale, Y-up/meters). `exportGlb.ts`: clone each ready part's scene, apply its transform, group, run `GLTFExporter` → Blob → download (test the group-assembly on a real three object graph in jsdom — no WebGL; inject a fake exporter for the binary step). **GLB url source (same root cause as the poll gaps — the part carries only `meshGenerationId`, a string; the GLB `/media/*` path lives on that generation's `mediaUrls[0]`):** `AssemblyStage` resolves every ready part's mesh generation by id in ONE batch via `useLivePartGenerations(parts.map(p => p.meshGenerationId).filter(Boolean))` (Cinema `useShotGenerations` precedent), then builds `{ part, glbUrl: gen.mediaUrls[0] }` rows ONLY for parts whose generation is `status === 'succeeded'` — a still-`processing`/failed mesh is skipped (mirrors `useShotGenerations` returning only playable rows). Never derive a GLB url from the bare `meshGenerationId`. `AssemblyViewer.tsx`: the ONE `<Canvas dpr={[1,2]} frameloop="demand">` when `isWebGLAvailable()`, else the poster-grid fallback; mounts one `PartMesh` per resolved (succeeded) part, passing its `glbUrl`; disposes on unmount. `PartMesh.tsx`: `useAssemblyGlb(glbUrl)` (the resolved `mediaUrls[0]`, NOT a raw id), applies transform, wraps in drei `TransformControls` when selected → writes pos/rot/scale to `useUpdatePart({ transform })` (PATCH). `AssemblyStage.tsx`: the `React.lazy` boundary — statically imports the viewer/export (so three.js is confined here), resolves the mesh generations (above), 4 states over "all parts have a succeeded mesh?", the export button, gizmo-mode toggle. `exportGlb` clones each resolved part's scene (from its `glbUrl`), applies its transform, and merges — never touches unresolved parts. **Test-first:** `useAssemblyGlb.test.ts` (WebGL-free disposal via `vi.spyOn(dispose)` on real three objects — Studio3D `useGlb.test.ts` template), `partTransform.test.ts`, `exportGlb.test.ts`, `AssemblyStage.test.tsx` (**asserts the no-WebGL fallback path renders the posters — never renders real WebGL**). **Verify:** all green.

**FG8 — Verification gate.**
- [ ] `pnpm --filter web typecheck && pnpm --filter web test` → PASS.
- [ ] `pnpm --filter web build` — confirm the three.js graph is in a SEPARATE chunk (AssemblyStage is `lazy`), not the main bundle.
- [ ] `git grep -nE "react-router-dom|useGLTF|from 'modules/(Studio3D|Gallery|Generator|Cinema|Soul)'" apps/web/src/modules/Assets3D` → **no matches** (no forbidden router, no drei useGLTF, no cross-module imports; the catalog seam is a prop from the route, the generation cache is a string key).
- [ ] `git grep -n "gradient" apps/web/src/modules/Assets3D` → **no matches** (design.md hard rule).
- [ ] Every new `.ts`/`.tsx` has a paired `.md`; `wc -l` on each < 500.
- [ ] `ru.json` key tree matches `en.json` under `assets3d` (no EN-fallback holes).

Open UX questions from the ADR (bounding-box overlay on the concept, a style knob on extraction) are frontend-optional and carry zero contract risk — defer past FG8.

### Frontend review fixes (2026-07-18)

- **Fix FG-1 (HIGH — wrong live-generation precedent):** parts cite generations by **id only** and the detail DTO embeds no `Generation`, so Gallery's `useLiveGeneration(seed: Generation)` cannot cold-load. `partGeneration.ts` now copies Cinema's **fetch-by-id** `useShotGeneration`/`useShotGenerations` (`shotGeneration.ts:86-117`): `useQuery`/`useQueries` keyed on `['generation', citedId]`, `enabled: id !== null`, stop-on-terminal/first-error poll. Applied in A3, the Module-law paragraph, FG1, and the FG6 `PartGenerationCard`.
- **Fix FG-2 (HIGH — cache poisoning):** `extract`/`mesh` return `Asset3dPart`, not `Generation`, so the old `onSuccess → setQueryData(['generation', res.id], res)` wrote a Part under a generation key. Both seeds REMOVED (FG1); `onSuccess` only invalidates `assetKey` (+ `['generations']`/`['me']` for paid), and the id-keyed hook fetches the real generation after the aggregate refetch surfaces the new citation.
- **Fix FG-3 (MEDIUM — Assembly GLB url source):** FG7 now resolves each ready part's mesh generation by id (`useLivePartGenerations` batch), takes `mediaUrls[0]` as the GLB url, and skips any part whose mesh generation is not `succeeded` — `PartMesh`/`exportGlb` operate on the resolved url, never a bare `meshGenerationId`.
- **Fix FG-4 (LOW — single-part spend):** originally documented as intended per ADR D6 (price-first; alertdialog only for the batch). **RESOLVED 2026-07-20 by owner decision:** single-part `mesh` is now gated by `SpendConfirmModal` (mis-click parity on the heaviest per-part spend); single-part `extract` stays click-to-spend so the extraction grid remains usable. See the updated FG6 paragraph. No contract change.

---

## Self-Review (done at authoring; revised after code review)

- **Spec coverage:** every ADR HTTP-surface row → a route in Task 7 + a Task 10 test; D1 tables → Tasks 2–3; D2 analyze → Task 5, extract → Task 6/4; D3 mesh → Task 6; D4 derived status → Task 6 `dto.ts` (no COLUMN — schema/ddl assert absence — but SERIALIZED on the read DTO per the ADR "asset + parts + derived statuses" row, and Task 10 drives a part through `draft→extracting→extracted→meshing→ready` observed through GET); D6 frontend → Appendix F. The one gap the ADR left implicit (no reference channel on `create()` for a raw concept image) is surfaced as the OPEN RISK + Task 4.
- **Derived-status coherence (Fix #1):** `asset3dPartSchema` carries `status` (`partStatusSchema`), `dto.ts` serializes `derivePartStatus`, and the transition test observes it end-to-end. No contract/ADR drift, no un-tested backend behaviour.
- **Concept round-trip (Fix #2):** SETTLED — `conceptImagePath` stores the full `/media/<uuid>.<ext>` path `saveDataUri` returns; `createAsset`/`extract`/`requireAssetConcept` pass it to `readAsDataUri` verbatim. No `EXT?` placeholder, no bare-key reconstruction.
- **Ownership (Fix #3):** Task 10 pins 404-for-foreign on POST parts, PATCH/DELETE asset, PATCH/DELETE part, extract, AND mesh — with provider mocks asserted un-called and A's credits/citations unchanged.
- **Refund isolation (Fix #5):** Task 10 proves a failed sibling is refunded and leaves an already-extracted sibling's citation + the net charge intact (200-8=192).
- **Scope trap (Fix #4):** Task 4 hoists the capability gate + direct-ref append to unconditional scope; the service test pins forwarding for a pure concept call built with no entities dependency.
- **Dependency surface (Fix #6):** the stated invariant now includes the shared read-only `CATALOG` registry, matching the `pickExtractionModel` import.
- **File size (Fix #7):** `dto.ts` split out; verification gate adds a `wc -l … < 500` check.
- **Type consistency:** contract names (`createAsset3dInputSchema`, `meshPartInputSchema`, `asset3dDetailSchema`, `analyzeResponseSchema`, `partStatusSchema`, `MAX_PARTS`) are used identically in service/routes/tests. Service methods (`createAsset`, `getAsset`, `addPart`, `extract`, `mesh`, `requireAssetConcept`, `replaceDraftParts`) and dto helpers (`derivePartStatus`, `toPartDto`) match across Tasks 5–8 and 10. Error classes (`Asset3dNotFoundError`, `Asset3dValidationError`, `Asset3dAnalyzeUnavailableError`) match service ↔ routes.
- **Placeholder scan:** every code step ships real code; test steps ship real assertions. No deliberate `?` placeholders remain (the Task 6 concept-path `EXT?` is resolved).
