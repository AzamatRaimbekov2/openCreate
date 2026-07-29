# Canvas Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/canvas` node-graph generation canvas (Flora-style chains: prompt→image→video/upscale with Soul characters) per the accepted ADR `docs/wiki/decisions/canvas-mode.md` and spec `docs/superpowers/specs/2026-07-29-canvas-mode-design.md`.

**Architecture:** The canvas is a first-class aggregate that CITES generations (like films): `canvas`/`canvas_node`/`canvas_edge` tables + full-document PATCH autosave; node runs are ordinary `POST /api/generations`. Two point changes outside the new modules: `inputGenerationId` on the generation contract (server resolves its own stored media — kills the base64 roundtrip), and two catalog pseudo-models (`upscale-4x`, `remove-bg`) mapped to Runware task types. Frontend is a new `modules/Canvas` on `@xyflow/react`; nodes are DOM and embed the existing composer pieces.

**Tech Stack:** Fastify + drizzle/SQLite (API), zod contracts, React 19 + TanStack Router/Query + Zustand + `@xyflow/react` (web), Vitest/RTL, TDD throughout.

**Scope of THIS plan (ADR phases 1–2):**
1. Contracts + canvas CRUD + `inputGenerationId` + upload endpoint (Tasks 1–5)
2. Editor: image/video/upload/note nodes, wires, autosave — usable product (Tasks 6–12)

ADR phases 3 (character node + run-branch) and 4 (upscale/remove-bg pseudo-models +
operation nodes) get their own follow-up plans after this lands — each plan must
produce working software on its own. `EntityNode`/`OperationNode`/`RunBranchDialog`/
`useRunBranch` in the file map below belong to those follow-ups; edge rules and
schemas are phase-3/4-ready NOW so later phases add behavior, not shape.

---

## File Structure

```
packages/contracts/src/
  canvas.ts                      (NEW: canvas/node/edge schemas + CRUD inputs)
  canvas.test.ts                 (NEW)
  generation.ts                  (MODIFY: + inputGenerationId, superRefine exclusivity)
  generation.test.ts             (MODIFY: exclusivity cases)
  index.ts                       (MODIFY: export * from './canvas')

apps/api/src/
  db/ddl.ts                      (MODIFY: + CANVAS_DDL)
  db/client.ts                   (MODIFY: exec CANVAS_DDL)
  db/schema.ts                   (MODIFY: + canvas, canvasNode, canvasEdge)
  modules/canvas/routes.ts       (NEW: CRUD, mirrors films/routes.ts)
  modules/canvas/service.ts      (NEW: ownership + full-doc replace, mirrors films/service.ts)
  modules/generations/service.ts (MODIFY: resolve inputGenerationId → provider reference)
  modules/catalog/catalog.ts     (MODIFY: + upscale-4x, remove-bg pseudo-models)
  app.ts                         (MODIFY: registerCanvasRoutes)

apps/api/test/
  canvas.test.ts                 (NEW: CRUD + ownership HTTP tests)
  generations-input-generation.test.ts (NEW: inputGenerationId path)
  generations-operations.test.ts (NEW: pseudo-model pricing/tasks)

apps/web/src/modules/Canvas/
  components/CanvasEditor.tsx    (React Flow shell: palette, minimap, marquee)
  components/NodePalette.tsx     (7 node kinds, drag + dblclick quick-add)
  components/NodeShell.tsx       (shared block chrome: header, status border, ports)
  components/ImageNode.tsx       (mini-composer, i2i via input edge)
  components/VideoNode.tsx       (mini-composer, i2v)
  components/UploadNode.tsx      (client upload → media URL)
  components/EntityNode.tsx      (Soul character card, output only)
  components/OperationNode.tsx   (upscale-4x / remove-bg)
  components/NoteNode.tsx        (sticky, no ports)
  components/VersionStrip.tsx    (⟳ vN · history)
  components/RunBranchDialog.tsx (itemized confirm)
  model/types.ts                 (node config unions, RF node data)
  model/edgeRules.ts             (port/type/cycle validation — pure)
  model/canvasStore.ts           (Zustand: doc state, selection, dirty)
  model/useCanvasDoc.ts          (load + debounced autosave PATCH)
  model/useRunBranch.ts          (toposort + sequential queue)
  model/api.ts                   (typed /api/canvases calls)
  index.ts
apps/web/src/routes/
  _shell.canvas.index.tsx        (canvas list — film-list pattern)
  canvas.$canvasId.tsx           (full-viewport editor — cinema.$filmId pattern)
```

Node ↔ wire payload rules (edgeRules, from spec §3–4):

| Edge source output | May connect to |
|---|---|
| media (image/video/upload/operation) | Image.media (≤1) · Video.media (≤1) · Operation.media (=1) |
| entity (character) | Image.character (≤1) · Video.character (≤1) |
| note | nothing (no ports) |

Cycles rejected at drag time. Video output may NOT feed Image/Operation (they need an image); enforce source kind ∈ {image, upload, operation} for media inputs of Image/Operation, and ∈ {image, upload, operation} for Video too (i2v takes an image frame).

---

## Task 1: Canvas contracts

**Files:**
- Create: `packages/contracts/src/canvas.ts`
- Create: `packages/contracts/src/canvas.test.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing contract tests**

Create `packages/contracts/src/canvas.test.ts`:

```typescript
// Contract tests for Canvas Mode wire schemas: pin the node-kind union, the
// full-document update shape, and the bounds that keep a hostile PATCH from
// storing megabytes of junk in config/title.
import { describe, expect, it } from 'vitest'
import {
  canvasDetailSchema,
  canvasNodeSchema,
  createCanvasInputSchema,
  updateCanvasInputSchema,
} from './canvas'

const NODE = {
  id: 'n1',
  kind: 'image' as const,
  position: { x: 100, y: -40 },
  config: { prompt: 'a fox', modelId: 'flux-dev', aspectRatio: '1:1' as const },
  generationIds: ['g1', 'g2'],
}

describe('canvasNodeSchema', () => {
  it('accepts an image node with config and history', () => {
    expect(canvasNodeSchema.safeParse(NODE).success).toBe(true)
  })
  it('accepts every MVP kind', () => {
    for (const kind of ['image', 'video', 'upload', 'character', 'upscale', 'remove-bg', 'note']) {
      expect(canvasNodeSchema.safeParse({ ...NODE, kind, config: {} }).success).toBe(true)
    }
  })
  it('rejects an unknown kind', () => {
    expect(canvasNodeSchema.safeParse({ ...NODE, kind: 'shader' }).success).toBe(false)
  })
  it('rejects a config that is not an object', () => {
    expect(canvasNodeSchema.safeParse({ ...NODE, config: 'huge string' }).success).toBe(false)
  })
})

describe('createCanvasInputSchema', () => {
  it('accepts a bare title', () => {
    expect(createCanvasInputSchema.safeParse({ title: 'My canvas' }).success).toBe(true)
  })
  it('rejects an empty title', () => {
    expect(createCanvasInputSchema.safeParse({ title: '' }).success).toBe(false)
  })
})

describe('updateCanvasInputSchema (full-document PATCH)', () => {
  const DOC = {
    title: 'Fox chain',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [NODE],
    edges: [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' }],
  }
  it('accepts a full document', () => {
    expect(updateCanvasInputSchema.safeParse(DOC).success).toBe(true)
  })
  it('accepts partial (title-only rename)', () => {
    expect(updateCanvasInputSchema.safeParse({ title: 'Renamed' }).success).toBe(true)
  })
  it('caps nodes at 200 (autosave carries the whole doc — bound it)', () => {
    const nodes = Array.from({ length: 201 }, (_, i) => ({ ...NODE, id: `n${i}` }))
    expect(updateCanvasInputSchema.safeParse({ ...DOC, nodes }).success).toBe(false)
  })
})

describe('canvasDetailSchema', () => {
  it('parses the GET /api/canvases/:id shape', () => {
    const detail = {
      id: 'c1',
      title: 'Fox chain',
      viewport: { x: 10, y: 20, zoom: 0.8 },
      nodes: [NODE],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    expect(canvasDetailSchema.safeParse(detail).success).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/contracts && pnpm vitest run src/canvas.test.ts`
Expected: FAIL — `Cannot find module './canvas'`

- [ ] **Step 3: Write the schemas**

Create `packages/contracts/src/canvas.ts`:

```typescript
// Canvas Mode wire contracts (ADR: canvas-mode). The canvas is an aggregate
// that CITES generations (like film.ts): nodes hold config + an append-only
// generationIds history; money and media stay in the generation system.
// PATCH carries the FULL document (debounced autosave, last-write-wins,
// single-owner) — so every collection here is bounded to keep one hostile
// PATCH from persisting megabytes.
import { z } from 'zod'

// The 7 MVP node kinds (owner-locked in the 2026-07-29 brainstorm).
export const canvasNodeKindSchema = z.enum([
  'image',
  'video',
  'upload',
  'character',
  'upscale',
  'remove-bg',
  'note',
])
export type CanvasNodeKind = z.infer<typeof canvasNodeKindSchema>

export const canvasViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  // React Flow's own zoom bounds; clamped here so a corrupt save can't zero it.
  zoom: z.number().min(0.05).max(4),
})
export type CanvasViewport = z.infer<typeof canvasViewportSchema>

// Per-kind config travels as ONE loose-but-bounded object rather than a
// discriminated union on purpose: the editor evolves node fields quickly, and
// the server never interprets config (it only stores it — node runs go through
// POST /api/generations, which does its own strict validation). The bounds are
// the contract: strings capped, unknown keys dropped by the shape below.
export const canvasNodeConfigSchema = z
  .object({
    prompt: z.string().max(2000).optional(),
    modelId: z.string().max(80).optional(),
    aspectRatio: z.enum(['16:9', '1:1', '9:16']).optional(),
    duration: z.number().int().min(1).max(15).optional(),
    // character node: which Soul entity this card supplies downstream.
    entityId: z.string().max(80).optional(),
    // note node: the sticky's text.
    text: z.string().max(2000).optional(),
  })
  .strip()
export type CanvasNodeConfig = z.infer<typeof canvasNodeConfigSchema>

export const canvasNodeSchema = z.object({
  // Client-minted (nanoid/uuid) — the doc is replaced whole, ids only need to
  // be unique within the canvas; the server never joins on them.
  id: z.string().min(1).max(40),
  kind: canvasNodeKindSchema,
  position: z.object({ x: z.number(), y: z.number() }),
  config: canvasNodeConfigSchema,
  // Append-only run history; latest succeeded id = the node's output. Bounded:
  // 50 versions is far beyond real use and keeps the doc small.
  generationIds: z.array(z.string().max(60)).max(50).default([]),
  // Upload nodes only: the stored '/media/…' path (server-minted by the upload
  // route, never an arbitrary URL — enforced by the prefix check).
  uploadUrl: z.string().max(300).startsWith('/media/').optional(),
})
export type CanvasNode = z.infer<typeof canvasNodeSchema>

export const canvasEdgeSchema = z.object({
  id: z.string().min(1).max(40),
  sourceNodeId: z.string().min(1).max(40),
  targetNodeId: z.string().min(1).max(40),
})
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>

// List row (GET /api/canvases) — no nodes/edges, the list stays light.
export const canvasSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Canvas = z.infer<typeof canvasSchema>

// Full document (GET /api/canvases/:id).
export const canvasDetailSchema = canvasSchema.extend({
  viewport: canvasViewportSchema,
  nodes: z.array(canvasNodeSchema),
  edges: z.array(canvasEdgeSchema),
})
export type CanvasDetail = z.infer<typeof canvasDetailSchema>

export const createCanvasInputSchema = z.object({
  title: z.string().min(1).max(120),
})
export type CreateCanvasInput = z.infer<typeof createCanvasInputSchema>

// Autosave PATCH: the full node/edge document, all fields optional so a
// title-only rename stays a one-key body. Bounds: 200 nodes / 400 edges —
// full-document autosave is O(doc), and the ADR consciously accepts that for
// MVP-scale canvases (revisit with op-based patches beyond that).
export const updateCanvasInputSchema = z
  .object({
    title: z.string().min(1).max(120),
    viewport: canvasViewportSchema,
    nodes: z.array(canvasNodeSchema).max(200),
    edges: z.array(canvasEdgeSchema).max(400),
  })
  .partial()
export type UpdateCanvasInput = z.infer<typeof updateCanvasInputSchema>

export const canvasListSchema = z.object({ items: z.array(canvasSchema) })
export type CanvasList = z.infer<typeof canvasListSchema>

// Upload-node bytes → POST /api/canvases/:id/uploads. Same data-URI-only rule
// as addShotReferenceInputSchema (never a URL — SSRF), same 14MB-ish cap as
// generation.inputImage. Response: { uploadUrl: '/media/<uuid>.<ext>' }.
export const canvasUploadInputSchema = z.object({
  dataUri: z.string().startsWith('data:image/').max(14_000_000),
})
export type CanvasUploadInput = z.infer<typeof canvasUploadInputSchema>

export const canvasUploadResultSchema = z.object({
  uploadUrl: z.string().startsWith('/media/'),
})
export type CanvasUploadResult = z.infer<typeof canvasUploadResultSchema>
```

- [ ] **Step 4: Export from the barrel**

In `packages/contracts/src/index.ts`, append after the `./compare` export:

```typescript
// Canvas Mode (ADR canvas-mode) — the node-graph aggregate that cites
// generations. No dependencies on the above; ordering is immaterial.
export * from './canvas'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/contracts && pnpm vitest run src/canvas.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Fill the sidecar + commit**

Fill `packages/contracts/src/canvas.ts.md` (the PostToolUse hook scaffolds it) per the sidecar-docs skill, then:

```bash
rtk git add packages/contracts/src/canvas.ts packages/contracts/src/canvas.ts.md packages/contracts/src/canvas.test.ts packages/contracts/src/index.ts packages/contracts/src/index.ts.md
rtk git commit -m "feat(canvas): wire contracts for the node-graph aggregate"
```

---

## Task 2: `inputGenerationId` on the generation contract

**Files:**
- Modify: `packages/contracts/src/generation.ts` (createGenerationInputSchema)
- Modify: `packages/contracts/src/generation.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/contracts/src/generation.test.ts`:

```typescript
describe('inputGenerationId (canvas chain edge)', () => {
  const BASE = { modelId: 'flux-dev', prompt: 'a fox', aspectRatio: '1:1' as const }
  it('accepts inputGenerationId alone', () => {
    expect(
      createGenerationInputSchema.safeParse({ ...BASE, inputGenerationId: 'g1' }).success,
    ).toBe(true)
  })
  it('rejects inputGenerationId together with inputImage (mutually exclusive)', () => {
    const result = createGenerationInputSchema.safeParse({
      ...BASE,
      inputGenerationId: 'g1',
      inputImage: 'data:image/png;base64,AAAA',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify the second case fails**

Run: `cd packages/contracts && pnpm vitest run src/generation.test.ts`
Expected: FAIL — `inputGenerationId` unknown key passes today only because the object is not strict; the exclusivity test fails (parse succeeds). If BOTH pass, the schema silently drops unknown keys — the implementation below makes the field real.

- [ ] **Step 3: Add the field + exclusivity refinement**

In `packages/contracts/src/generation.ts`, extend `createGenerationInputSchema`: add after the `inputImage` field

```typescript
  // Canvas chain edge (ADR canvas-mode D2): cite an OWN succeeded image
  // generation as the i2i/i2v input instead of round-tripping its bytes as a
  // 14MB data URI. Mutually exclusive with inputImage (refined below); the
  // SERVICE additionally verifies ownership + succeeded + image output before
  // resolving its own stored media — nothing user-addressable is fetched.
  inputGenerationId: z.string().min(1).max(60).optional(),
```

and wrap the object with the exclusivity refinement — change

```typescript
export const createGenerationInputSchema = z.object({
```

to

```typescript
const createGenerationInputBaseSchema = z.object({
```

and after the closing `})` of the base object add:

```typescript
export const createGenerationInputSchema = createGenerationInputBaseSchema.superRefine(
  (input, ctx) => {
    // One input channel per request: a data URI AND a cited generation is a
    // contradiction (which one wins?) — refuse instead of guessing.
    if (input.inputImage !== undefined && input.inputGenerationId !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'inputImage and inputGenerationId are mutually exclusive',
        path: ['inputGenerationId'],
      })
    }
  },
)
```

**Check before finishing:** `film.ts` does `createGenerationInputSchema.extend(...)` (generateShotClipInputSchema). `.extend` does not exist on a ZodEffects (superRefine wrapper) — point film.ts at the BASE object:

In `packages/contracts/src/film.ts` change

```typescript
export const generateShotClipInputSchema = createGenerationInputSchema.extend({
```

to import and extend the base:

```typescript
export const generateShotClipInputSchema = createGenerationInputBaseSchema.extend({
```

(and export `createGenerationInputBaseSchema` from generation.ts; the shot-clip path never carries inputGenerationId, so it needs no refinement).

- [ ] **Step 4: Run the full contracts suite**

Run: `cd packages/contracts && pnpm vitest run`
Expected: PASS (including film.ts consumers — if generateShotClipInputSchema tests fail, the base-schema split above was missed)

- [ ] **Step 5: Commit**

```bash
rtk git add packages/contracts/src/generation.ts packages/contracts/src/generation.ts.md packages/contracts/src/generation.test.ts packages/contracts/src/film.ts packages/contracts/src/film.ts.md
rtk git commit -m "feat(generation): inputGenerationId — canvas chain edge, exclusive with inputImage"
```

---

## Task 3: Canvas DB tables

**Files:**
- Modify: `apps/api/src/db/ddl.ts` (append CANVAS_DDL)
- Modify: `apps/api/src/db/client.ts` (exec it)
- Modify: `apps/api/src/db/schema.ts` (drizzle tables)

- [ ] **Step 1: Append the DDL constant**

In `apps/api/src/db/ddl.ts`, after `ASSET3D_DDL`:

```sql
-- via: export const CANVAS_DDL = ` ... `
```

```typescript
// Canvas Mode tables (ADR: canvas-mode). Exec'd with the main DDL — all
// CREATE ... IF NOT EXISTS, so re-running on every boot is a no-op. The
// composition layer OVER generations, exactly like film: a canvas owns nodes
// and edges; a node CITES generations (JSON id history, no FK — deleting a
// generation from the gallery leaves an empty version, it never cascades the
// canvas away). No table here touches the credit ledger.
export const CANVAS_DDL = `
CREATE TABLE IF NOT EXISTS canvas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  -- Last saved camera: {x, y, zoom} JSON. On the canvas, not per-client —
  -- single-owner docs reopen where the owner left them.
  viewport_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canvas_user_updated ON canvas(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS canvas_node (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvas(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  position_json TEXT NOT NULL,
  -- Per-kind editor config (prompt/modelId/aspect/duration/entityId/text).
  -- Opaque to the server: node RUNS go through POST /api/generations, which
  -- re-validates everything strictly; this is just the saved editor state.
  config_json TEXT NOT NULL DEFAULT '{}',
  -- Append-only run history; latest succeeded = the node's output. JSON ids,
  -- no FK — same "cite, never own" rule as shot.generation_id.
  generation_ids_json TEXT NOT NULL DEFAULT '[]',
  -- Upload nodes only: the stored '/media/<uuid>.<ext>' path.
  upload_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_canvas_node_canvas ON canvas_node(canvas_id);

CREATE TABLE IF NOT EXISTS canvas_edge (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvas(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canvas_edge_canvas ON canvas_edge(canvas_id);
`
```

- [ ] **Step 2: Exec it in the client bootstrap**

In `apps/api/src/db/client.ts`: add `CANVAS_DDL` to the import from `./ddl`, and after `sqlite.exec(ASSET3D_DDL)`:

```typescript
  // Canvas Mode (ADR canvas-mode): three brand-new tables, so only the
  // idempotent CREATE IF NOT EXISTS exec is needed — no micro-migration guard.
  sqlite.exec(CANVAS_DDL)
```

- [ ] **Step 3: Add the drizzle tables**

In `apps/api/src/db/schema.ts`, after `asset3dPart`:

```typescript
// Canvas Mode (ADR canvas-mode): the node-graph aggregate. Same discipline as
// film/shot — the canvas owns nodes/edges (FK cascade), a node CITES
// generations via a JSON id list with NO reference (a gallery delete must
// leave an empty version, never cascade the canvas away).
export const canvas = sqliteTable('canvas', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  // {x, y, zoom} JSON — the owner's last camera, restored on open.
  viewportJson: text('viewport_json').notNull().default('{"x":0,"y":0,"zoom":1}'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const canvasNode = sqliteTable('canvas_node', {
  id: text('id').primaryKey(),
  canvasId: text('canvas_id')
    .notNull()
    .references(() => canvas.id, { onDelete: 'cascade' }),
  kind: text('kind', {
    enum: ['image', 'video', 'upload', 'character', 'upscale', 'remove-bg', 'note'],
  }).notNull(),
  positionJson: text('position_json').notNull(),
  // Saved editor state, opaque to the server (runs re-validate at /generations).
  configJson: text('config_json').notNull().default('{}'),
  // Append-only version history (JSON string[]), latest succeeded = output.
  generationIdsJson: text('generation_ids_json').notNull().default('[]'),
  // Upload nodes only: server-minted '/media/…' path.
  uploadUrl: text('upload_url'),
})

export const canvasEdge = sqliteTable('canvas_edge', {
  id: text('id').primaryKey(),
  canvasId: text('canvas_id')
    .notNull()
    .references(() => canvas.id, { onDelete: 'cascade' }),
  sourceNodeId: text('source_node_id').notNull(),
  targetNodeId: text('target_node_id').notNull(),
})
```

- [ ] **Step 4: Boot check**

Run: `cd apps/api && pnpm vitest run test/db-ddl.test.ts test/db.test.ts`
Expected: PASS (bootstrap execs the new DDL without error)

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/db/ddl.ts apps/api/src/db/ddl.ts.md apps/api/src/db/client.ts apps/api/src/db/client.ts.md apps/api/src/db/schema.ts apps/api/src/db/schema.ts.md
rtk git commit -m "feat(canvas): canvas/canvas_node/canvas_edge tables"
```

---

## Task 4: Canvas module — service + routes + registration

**Files:**
- Create: `apps/api/src/modules/canvas/service.ts`
- Create: `apps/api/src/modules/canvas/routes.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/canvas.test.ts`

- [ ] **Step 1: Write the failing HTTP tests**

Create `apps/api/test/canvas.test.ts`:

```typescript
// HTTP tests for the canvas aggregate: CRUD, ownership scoping, full-document
// PATCH semantics (replace, not merge), and the bounds. Mirrors films.test.ts.
import { describe, expect, it } from 'vitest'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'

const NODE = {
  id: 'n1',
  kind: 'image',
  position: { x: 10, y: 20 },
  config: { prompt: 'a fox', modelId: 'flux-dev', aspectRatio: '1:1' },
  generationIds: [],
}

describe('canvas CRUD', () => {
  it('requires a session on every route', async () => {
    const app = await buildTestApp()
    for (const [method, url] of [
      ['GET', '/api/canvases'],
      ['POST', '/api/canvases'],
      ['GET', '/api/canvases/c1'],
      ['PATCH', '/api/canvases/c1'],
      ['DELETE', '/api/canvases/c1'],
    ] as const) {
      const res = await app.inject({ method, url, ...(method === 'POST' || method === 'PATCH' ? { payload: {} } : {}) })
      expect(res.statusCode, `${method} ${url}`).toBe(401)
    }
  })

  it('creates, lists, reads, patches (full replace) and deletes a canvas', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    const created = await app.inject({
      method: 'POST', url: '/api/canvases', headers: { cookie },
      payload: { title: 'Fox chain' },
    })
    expect(created.statusCode).toBe(201)
    const { id } = created.json() as { id: string }

    const list = await app.inject({ method: 'GET', url: '/api/canvases', headers: { cookie } })
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1)

    // PATCH the full doc: nodes + edges + viewport land
    const patched = await app.inject({
      method: 'PATCH', url: `/api/canvases/${id}`, headers: { cookie },
      payload: {
        viewport: { x: 5, y: 6, zoom: 1.5 },
        nodes: [NODE, { id: 'n2', kind: 'note', position: { x: 0, y: 0 }, config: { text: 'todo' }, generationIds: [] }],
        edges: [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' }],
      },
    })
    expect(patched.statusCode).toBe(200)

    const detail = await app.inject({ method: 'GET', url: `/api/canvases/${id}`, headers: { cookie } })
    const doc = detail.json() as { nodes: unknown[]; edges: unknown[]; viewport: { zoom: number } }
    expect(doc.nodes).toHaveLength(2)
    expect(doc.edges).toHaveLength(1)
    expect(doc.viewport.zoom).toBe(1.5)

    // Second PATCH REPLACES the collections (fewer nodes → fewer stored)
    await app.inject({
      method: 'PATCH', url: `/api/canvases/${id}`, headers: { cookie },
      payload: { nodes: [NODE], edges: [] },
    })
    const after = (await app.inject({ method: 'GET', url: `/api/canvases/${id}`, headers: { cookie } })).json() as {
      nodes: unknown[]; edges: unknown[]
    }
    expect(after.nodes).toHaveLength(1)
    expect(after.edges).toHaveLength(0)

    const del = await app.inject({ method: 'DELETE', url: `/api/canvases/${id}`, headers: { cookie } })
    expect(del.statusCode).toBe(204)
    const gone = await app.inject({ method: 'GET', url: `/api/canvases/${id}`, headers: { cookie } })
    expect(gone.statusCode).toBe(404)
  })

  it('scopes by owner: a foreign canvas 404s on read, patch and delete', async () => {
    const app = await buildTestApp()
    const owner = await registerAndGetCookie(app, 'owner@x.co')
    const stranger = await registerAndGetCookie(app, 'stranger@x.co')
    const { id } = (
      await app.inject({ method: 'POST', url: '/api/canvases', headers: { cookie: owner }, payload: { title: 'Mine' } })
    ).json() as { id: string }

    for (const [method, url] of [
      ['GET', `/api/canvases/${id}`],
      ['PATCH', `/api/canvases/${id}`],
      ['DELETE', `/api/canvases/${id}`],
    ] as const) {
      const res = await app.inject({
        method, url, headers: { cookie: stranger },
        ...(method === 'PATCH' ? { payload: { title: 'Stolen' } } : {}),
      })
      expect(res.statusCode, `${method}`).toBe(404)
    }
  })

  it('rejects an invalid document with the validation envelope', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const { id } = (
      await app.inject({ method: 'POST', url: '/api/canvases', headers: { cookie }, payload: { title: 'X' } })
    ).json() as { id: string }
    const res = await app.inject({
      method: 'PATCH', url: `/api/canvases/${id}`, headers: { cookie },
      payload: { nodes: [{ id: 'n1', kind: 'shader', position: { x: 0, y: 0 }, config: {}, generationIds: [] }] },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: { code: string } }).error.code).toBe('validation_failed')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && pnpm vitest run test/canvas.test.ts`
Expected: FAIL — 404s everywhere (routes not registered)

- [ ] **Step 3: Write the service**

Create `apps/api/src/modules/canvas/service.ts`:

```typescript
// Canvas aggregate service (ADR canvas-mode D1) — mirrors films/service.ts:
// every method takes userId first and scopes through requireCanvas; a foreign
// id is indistinguishable from a missing one. The PATCH is a FULL-DOCUMENT
// replace (delete + reinsert nodes/edges in one transaction): last-write-wins
// is the chosen autosave semantic for single-owner docs, and replace is the
// only merge-free way to honor it.
import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type {
  Canvas,
  CanvasDetail,
  CanvasEdge,
  CanvasNode,
  CreateCanvasInput,
  UpdateCanvasInput,
} from '@opencreate/contracts'
import type { Db } from '../../db/client'
import { canvas, canvasEdge, canvasNode } from '../../db/schema'

export class CanvasNotFoundError extends Error {
  constructor() {
    super('Canvas not found')
    this.name = 'CanvasNotFoundError'
  }
}

type Deps = { db: Db }

export type CanvasService = ReturnType<typeof createCanvasService>

export function createCanvasService({ db }: Deps) {
  function toDto(row: typeof canvas.$inferSelect): Canvas {
    return {
      id: row.id,
      title: row.title,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }
  }
  function toNodeDto(row: typeof canvasNode.$inferSelect): CanvasNode {
    return {
      id: row.id,
      kind: row.kind,
      position: JSON.parse(row.positionJson) as CanvasNode['position'],
      config: JSON.parse(row.configJson) as CanvasNode['config'],
      generationIds: JSON.parse(row.generationIdsJson) as string[],
      ...(row.uploadUrl !== null ? { uploadUrl: row.uploadUrl } : {}),
    }
  }
  function toEdgeDto(row: typeof canvasEdge.$inferSelect): CanvasEdge {
    return { id: row.id, sourceNodeId: row.sourceNodeId, targetNodeId: row.targetNodeId }
  }

  // Ownership gate — same error for foreign and missing (films precedent).
  function requireCanvas(userId: string, canvasId: string) {
    const row = db
      .select()
      .from(canvas)
      .where(and(eq(canvas.id, canvasId), eq(canvas.userId, userId)))
      .get()
    if (!row) throw new CanvasNotFoundError()
    return row
  }

  function createCanvas(userId: string, input: CreateCanvasInput): Canvas {
    const id = randomUUID()
    const now = new Date()
    db.insert(canvas)
      .values({ id, userId, title: input.title.trim(), createdAt: now, updatedAt: now })
      .run()
    return toDto(db.select().from(canvas).where(eq(canvas.id, id)).get()!)
  }

  function listCanvases(userId: string): Canvas[] {
    return db
      .select()
      .from(canvas)
      .where(eq(canvas.userId, userId))
      .orderBy(desc(canvas.updatedAt))
      .all()
      .map(toDto)
  }

  function getCanvas(userId: string, canvasId: string): CanvasDetail {
    const row = requireCanvas(userId, canvasId)
    const nodes = db.select().from(canvasNode).where(eq(canvasNode.canvasId, canvasId)).all()
    const edges = db.select().from(canvasEdge).where(eq(canvasEdge.canvasId, canvasId)).all()
    return {
      ...toDto(row),
      viewport: JSON.parse(row.viewportJson) as CanvasDetail['viewport'],
      nodes: nodes.map(toNodeDto),
      edges: edges.map(toEdgeDto),
    }
  }

  // FULL-DOCUMENT autosave. Replace, not merge: the client owns the truth
  // between saves (single owner), so the stored doc must become exactly what
  // was sent. One transaction so a crash can never leave nodes without edges.
  function updateCanvas(userId: string, canvasId: string, input: UpdateCanvasInput): CanvasDetail {
    requireCanvas(userId, canvasId)
    db.transaction((tx) => {
      tx.update(canvas)
        .set({
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.viewport !== undefined ? { viewportJson: JSON.stringify(input.viewport) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(canvas.id, canvasId))
        .run()
      if (input.nodes !== undefined) {
        tx.delete(canvasNode).where(eq(canvasNode.canvasId, canvasId)).run()
        for (const node of input.nodes) {
          tx.insert(canvasNode)
            .values({
              id: node.id,
              canvasId,
              kind: node.kind,
              positionJson: JSON.stringify(node.position),
              configJson: JSON.stringify(node.config),
              generationIdsJson: JSON.stringify(node.generationIds),
              uploadUrl: node.uploadUrl ?? null,
            })
            .run()
        }
      }
      if (input.edges !== undefined) {
        tx.delete(canvasEdge).where(eq(canvasEdge.canvasId, canvasId)).run()
        for (const edge of input.edges) {
          tx.insert(canvasEdge)
            .values({
              id: edge.id,
              canvasId,
              sourceNodeId: edge.sourceNodeId,
              targetNodeId: edge.targetNodeId,
            })
            .run()
        }
      }
    })
    return getCanvas(userId, canvasId)
  }

  function deleteCanvas(userId: string, canvasId: string): void {
    requireCanvas(userId, canvasId)
    // FK cascade removes nodes and edges with the canvas row.
    db.delete(canvas).where(eq(canvas.id, canvasId)).run()
  }

  return { createCanvas, listCanvases, getCanvas, updateCanvas, deleteCanvas }
}
```

- [ ] **Step 4: Write the routes**

Create `apps/api/src/modules/canvas/routes.ts`:

```typescript
// HTTP layer for the canvas aggregate — thin, mirroring films/routes.ts:
// require a session, parse with the SHARED contracts schema, delegate,
// map CanvasNotFoundError → 404. Node RUNS are not here: they are ordinary
// POST /api/generations calls made by the SPA (ADR D1 — zero new money code).
import type { FastifyInstance, FastifyReply } from 'fastify'
import { createCanvasInputSchema, updateCanvasInputSchema } from '@opencreate/contracts'
import { CanvasNotFoundError } from './service'
import type { CanvasService } from './service'

export function registerCanvasRoutes(app: FastifyInstance, service: CanvasService) {
  async function guard<T>(reply: FastifyReply, fn: () => T | Promise<T>) {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof CanvasNotFoundError) {
        return reply.status(404).send({ error: { code: 'not_found', message: 'Canvas not found' } })
      }
      throw error
    }
  }
  function badInput(reply: FastifyReply, message: string) {
    return reply.status(400).send({ error: { code: 'validation_failed', message } })
  }

  app.get('/api/canvases', async (req) => {
    const user = await app.requireUser(req)
    return { items: service.listCanvases(user.id) }
  })

  app.post('/api/canvases', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = createCanvasInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return reply.status(201).send(service.createCanvas(user.id, parsed.data))
  })

  app.get<{ Params: { id: string } }>('/api/canvases/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => service.getCanvas(user.id, req.params.id))
  })

  app.patch<{ Params: { id: string } }>('/api/canvases/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = updateCanvasInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, () => service.updateCanvas(user.id, req.params.id, parsed.data))
  })

  app.delete<{ Params: { id: string } }>('/api/canvases/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => {
      service.deleteCanvas(user.id, req.params.id)
      return reply.status(204).send()
    })
  })

  // Upload-node bytes. The service saves through storage.saveDataUri (raster
  // only, no svg stored-XSS, decoded-byte cap) and answers the stored
  // '/media/…' path; the CLIENT then writes it into the node's uploadUrl and
  // autosaves. Ownership first — a stranger cannot fill your storage.
  app.post<{ Params: { id: string } }>('/api/canvases/:id/uploads', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = canvasUploadInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, async () =>
      reply.status(201).send(await service.saveUpload(user.id, req.params.id, parsed.data.dataUri)),
    )
  })
}
```

(add `canvasUploadInputSchema` to the imports from `@opencreate/contracts` in this file)

**Service addition** — in `apps/api/src/modules/canvas/service.ts` add to Deps `storage: LocalStorage` (import type from `../../storage/local`, matching films/service.ts's storage dep) and a method; wire `storage: deps.storage` at the app.ts registration:

```typescript
  // Upload-node bytes → own storage → public '/media/…' path. A rejected
  // payload (svg, oversize, not raster) is the client's fault: map the storage
  // error to a validation envelope like shot-references does.
  async function saveUpload(
    userId: string,
    canvasId: string,
    dataUri: string,
  ): Promise<{ uploadUrl: string }> {
    requireCanvas(userId, canvasId)
    try {
      const uploadUrl = await storage.saveDataUri(dataUri, randomUUID())
      return { uploadUrl }
    } catch (err) {
      if (err instanceof InvalidImageDataUriError) throw new CanvasValidationError(err.message)
      throw err
    }
  }
```

with the matching error class + route mapping (mirror FilmValidationError → 400):

```typescript
export class CanvasValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanvasValidationError'
  }
}
```

and in routes.ts guard():

```typescript
      if (error instanceof CanvasValidationError) {
        return reply.status(400).send({ error: { code: 'validation_failed', message: error.message } })
      }
```

**Extra test** (append to `apps/api/test/canvas.test.ts`):

```typescript
  it('stores an upload and returns its /media path; rejects svg', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const { id } = (
      await app.inject({ method: 'POST', url: '/api/canvases', headers: { cookie }, payload: { title: 'U' } })
    ).json() as { id: string }
    // 1x1 png
    const PNG =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const ok = await app.inject({
      method: 'POST', url: `/api/canvases/${id}/uploads`, headers: { cookie },
      payload: { dataUri: PNG },
    })
    expect(ok.statusCode).toBe(201)
    expect((ok.json() as { uploadUrl: string }).uploadUrl).toMatch(/^\/media\//)

    const svg = await app.inject({
      method: 'POST', url: `/api/canvases/${id}/uploads`, headers: { cookie },
      payload: { dataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
    })
    expect(svg.statusCode).toBe(400)
  })
```

- [ ] **Step 5: Register in app.ts**

In `apps/api/src/app.ts`: add imports

```typescript
import { createCanvasService } from './modules/canvas/service'
import { registerCanvasRoutes } from './modules/canvas/routes'
```

and after `registerCompareRoutes(...)`:

```typescript
  // Canvas Mode (ADR canvas-mode): the node-graph aggregate that CITES
  // generations — CRUD only, zero money code; node runs arrive as ordinary
  // POST /api/generations from the SPA.
  registerCanvasRoutes(app, createCanvasService({ db: deps.db }))
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/api && pnpm vitest run test/canvas.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Fill sidecars + commit**

```bash
rtk git add apps/api/src/modules/canvas apps/api/src/app.ts apps/api/src/app.ts.md apps/api/test/canvas.test.ts
rtk git commit -m "feat(canvas): aggregate CRUD — service, routes, ownership"
```

---

## Task 5: `inputGenerationId` resolution in the generation service

**Context (verified 2026-07-30 against service.ts):** image models have NO
`supportsImageInput` — they condition through the server-only `referenceImages`
channel (`CreateGenerationServiceInput`, service.ts:33) gated by
`referenceMode`/`maxReferenceImages`; `inputImage` is honored only by video
(seed frame) and model3d. So the chain edge resolves as:
- **image model** → merge the resolved data URI into `input.referenceImages`
  (BEFORE the ref-capability/count gate at ~service.ts:357-365, so it counts)
- **video model** → pass as the provider seed frame (the `inputImage` slot)
Resolution follows the `copyGeneratedAsset` precedent
(entities/service.ts:159-179): direct row read, four default-deny checks, ONE
shared error message so nothing about foreign rows leaks.

**Files:**
- Modify: `apps/api/src/modules/generations/service.ts`
- Create: `apps/api/test/generations-input-generation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/generations-input-generation.test.ts`:

```typescript
// inputGenerationId (canvas chain edge, ADR canvas-mode D2): the server
// resolves an OWN succeeded image generation's stored media as the provider
// reference — image models receive it via referenceImages, video models as the
// seed frame. Every refusal must land BEFORE the charge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeRunware, fakeVideoProvider, registerAndGetCookie } from './helpers/build-test-app'

// Success paths download the produced asset via global fetch (saveFromUrl).
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

// Seed one succeeded image generation and return its id.
async function seedImage(app: Awaited<ReturnType<typeof buildTestApp>>, cookie: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/generations',
    headers: { cookie },
    payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
  })
  expect(res.statusCode).toBe(201)
  return (res.json() as { id: string }).id
}

describe('inputGenerationId', () => {
  it('image chain: resolves own succeeded image into referenceImages (data URI)', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({
      imageURL: 'https://im.runware.ai/a.webp',
      cost: 0.002,
      seed: 1,
      NSFWContent: false,
    })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const parentId = await seedImage(app, cookie)

    // flux-kontext-pro has referenceMode 'both' — the chain-capable image model
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-kontext-pro',
        prompt: 'same fox, snowy forest',
        aspectRatio: '1:1',
        inputGenerationId: parentId,
      },
    })
    expect(res.statusCode).toBe(201)
    // Second imageInference call (first was the seed) carries the resolved
    // stored asset as a DATA URI — never a URL (providers can't reach /media).
    const call = rw.imageInference.mock.calls[1]![0] as { referenceImages?: string[] }
    expect(call.referenceImages).toHaveLength(1)
    expect(call.referenceImages![0]).toMatch(/^data:image\/webp;base64,/)
    // The chain is an image-conditioned run — recorded as mode 'image'
    expect((res.json() as { mode: string }).mode).toBe('image')
  })

  it('video chain: resolves the citation into the provider seed frame', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({
      imageURL: 'https://im.runware.ai/a.webp',
      cost: 0.002,
      seed: 1,
      NSFWContent: false,
    })
    const video = fakeVideoProvider()
    video.submit.mockResolvedValue({ providerJobId: 'job-1' })
    const app = await buildTestApp({ runware: rw, videoProviders: { runware: video } })
    const cookie = await registerAndGetCookie(app)
    const parentId = await seedImage(app, cookie)

    // pixverse-v6 is a runware video model with supportsImageInput
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'pixverse-v6',
        prompt: 'the fox walks away',
        aspectRatio: '16:9',
        duration: 5,
        inputGenerationId: parentId,
      },
    })
    expect(res.statusCode).toBe(202)
    const submitted = video.submit.mock.calls[0]![0] as { inputImage?: string }
    expect(submitted.inputImage).toMatch(/^data:image\/webp;base64,/)
  })

  it("refuses a stranger's generation with one default-deny message, charging nothing", async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({
      imageURL: 'https://im.runware.ai/a.webp',
      cost: 0.002,
      seed: 1,
      NSFWContent: false,
    })
    const app = await buildTestApp({ runware: rw })
    const owner = await registerAndGetCookie(app, 'owner@x.co')
    const thief = await registerAndGetCookie(app, 'thief@x.co')
    const parentId = await seedImage(app, owner)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie: thief },
      payload: {
        modelId: 'flux-kontext-pro',
        prompt: 'steal the fox',
        aspectRatio: '1:1',
        inputGenerationId: parentId,
      },
    })
    expect(res.statusCode).toBe(400)
    const balance = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: thief } })
    expect((balance.json() as { creditsBalance: number }).creditsBalance).toBe(200)
  })

  it('refuses an unknown generation id with the same message (no existence leak)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-kontext-pro',
        prompt: 'x y',
        aspectRatio: '1:1',
        inputGenerationId: 'no-such-id',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('refuses a chain into an image model with no referenceMode (flux-schnell), charging nothing', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({
      imageURL: 'https://im.runware.ai/a.webp',
      cost: 0.002,
      seed: 1,
      NSFWContent: false,
    })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const parentId = await seedImage(app, cookie)

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'flux-schnell',
        prompt: 'remix',
        aspectRatio: '1:1',
        inputGenerationId: parentId,
      },
    })
    expect(res.statusCode).toBe(400)
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    // 200 signup − 1 for the seed, nothing for the refused chain
    expect((me.json() as { creditsBalance: number }).creditsBalance).toBe(199)
  })

  it('rejects inputGenerationId together with inputImage (contract exclusivity)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: { cookie },
      payload: {
        modelId: 'pixverse-v6',
        prompt: 'x y',
        aspectRatio: '16:9',
        duration: 5,
        inputImage: 'data:image/png;base64,AAAA',
        inputGenerationId: 'g1',
      },
    })
    expect(res.statusCode).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && pnpm vitest run test/generations-input-generation.test.ts`
Expected: FAIL — chain calls today 400 nothing / referenceImages never carries the citation

- [ ] **Step 3: Implement in service.create()**

In `apps/api/src/modules/generations/service.ts`, three edits:

**(a) Capability gates** — immediately after the existing
`if (input.inputImage && !model.supportsImageInput) throw ...` /
`model3d requires a photo` block (~line 312-320), add:

```typescript
    // Canvas chain edge (ADR canvas-mode D2). Capability first, resolution
    // second — a citation the model cannot honour must cost nothing and fail
    // with the reason, not with a confusing reference-count error.
    if (input.inputGenerationId) {
      if (model.type === 'image' && !model.referenceMode)
        throw new ValidationError(`${model.id} cannot condition on a reference image`)
      if (model.type === 'video' && !model.supportsImageInput)
        throw new ValidationError(`${model.id} does not support image input`)
      if (model.type !== 'image' && model.type !== 'video')
        throw new ValidationError(`${model.id} cannot take a generation as input`)
    }
```

**(b) Resolution** — directly after the gates in (a), still before every
charge/reference gate (the "everything here runs BEFORE the charge" block):

```typescript
    // Resolve the citation to the caller's OWN stored media. Four default-deny
    // checks share ONE error (copyGeneratedAsset precedent): a foreign id, a
    // missing id, a failed run and a video source must all be
    // indistinguishable — nothing about other users' rows may leak.
    let chainImage: string | undefined
    if (input.inputGenerationId) {
      const cited = db
        .select()
        .from(generation)
        .where(eq(generation.id, input.inputGenerationId))
        .get()
      const mediaUrl =
        cited && cited.userId === userId && cited.status === 'succeeded' && cited.type === 'image'
          ? ((JSON.parse(cited.mediaJson) as string[])[0] ?? null)
          : null
      if (!mediaUrl)
        throw new ValidationError(
          'inputGenerationId must cite your own succeeded image generation',
        )
      // readAsDataUri re-guards the disk read (raster-only MIME table) and
      // hands the provider a data URI — /media is not reachable from outside.
      chainImage = await storage.readAsDataUri(mediaUrl)
      if (model.type === 'image') {
        // Into the SAME server-only channel entity photos and shot references
        // use — so the referenceMode/maxReferenceImages gates below count it,
        // and the provider call needs no new plumbing at all.
        input = { ...input, referenceImages: [...(input.referenceImages ?? []), chainImage] }
      }
    }
```

**(c) Two point fixes:**

- The `mode` line (~461): a chain run is image-conditioned —

```typescript
    const mode = input.inputImage || input.inputGenerationId ? 'image' : 'text'
```

- The video submit spread (~668): the seed frame is the explicit data URI OR
  the resolved citation —

```typescript
          ...(input.inputImage
            ? { inputImage: input.inputImage }
            : chainImage
              ? { inputImage: chainImage }
              : {}),
```

- [ ] **Step 4: Run the new tests + the full generations suite**

Run: `cd apps/api && pnpm vitest run test/generations-input-generation.test.ts && pnpm vitest run test/generations.test.ts test/generations-entity-refs.test.ts test/generations-money-atomicity.test.ts`
Expected: ALL PASS (the money-path suites prove the charge/refund discipline survived)

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/modules/generations/service.ts apps/api/src/modules/generations/service.ts.md apps/api/test/generations-input-generation.test.ts
rtk git commit -m "feat(generation): resolve inputGenerationId server-side — canvas chain edge"
```

---

## Phase 2 — module boundaries (read first)

Locked by the codebase's own rules (verified 2026-07-30):

- **Canvas imports NOTHING from modules/Generator or modules/Cinema.** Their
  composer pieces are private exports. The catalog flows through the ROUTE seam
  exactly like `cinema.$filmId.tsx` does: the route reads `useCatalog()` from
  `modules/Generator` (routes may) and passes `models` down as props/node data.
- **Per-document state** = singleton Zustand store + explicit `reset()`/`init()`
  on route param change (the `useWizardStore` precedent) — no store factories.
- **Polling**: Canvas writes its OWN `useNodeGeneration` hook but keys it
  `['generation', id]` / 4000ms exactly like Cinema's `useShotGeneration`, so
  all pollers share one cache.
- **Status colors**: processing `glow-amber` · succeeded `glow-green` · failed
  `glow-red`; never color-only (a word carries the meaning). Surfaces: steel
  cards on the void; `STEEL_SURFACE`/`WELL_SURFACE` strings from shared/ui.
- `@xyflow/react` is a NEW dependency (verified absent). Its stylesheet import
  (`@xyflow/react/dist/style.css`) is vendor CSS, permitted like theme.css.
  The build has an SSR/prerender pass — the editor never renders on the server
  (prerender only touches `/`), but the import graph must stay SSR-safe: no
  top-level `window` access in module scope (React Flow itself is fine).

---

## Task 6: `@xyflow/react` + types + edgeRules (pure)

**Files:**
- Modify: `apps/web/package.json` (dependency)
- Create: `apps/web/src/modules/Canvas/model/types.ts`
- Create: `apps/web/src/modules/Canvas/model/edgeRules.ts`
- Create: `apps/web/src/modules/Canvas/model/edgeRules.test.ts`

- [ ] **Step 1: Add the dependency**

Run: `cd apps/web && pnpm add @xyflow/react`
Expected: `@xyflow/react` lands in dependencies (~45KB gz, MIT)

- [ ] **Step 2: Write the types**

Create `apps/web/src/modules/Canvas/model/types.ts`:

```typescript
// apps/web/src/modules/Canvas/model/types.ts
// Editor-side types over the wire contracts. The STORE holds contract shapes
// (CanvasNode/CanvasEdge) as the single source of truth; React Flow objects
// are DERIVED per render in CanvasEditor — never stored.
import type { CanvasNodeKind } from '@opencreate/contracts'

// What a node's latest run is doing — drives the status border.
export type NodeRunStatus = 'idle' | 'processing' | 'succeeded' | 'failed'

// The subset of catalog data a node composer needs (flows via the ROUTE seam —
// Canvas may not import modules/Generator).
export type CanvasModelOption = {
  id: string
  name: string
  providerLabel: string
  type: 'image' | 'video'
  credits: number
  aspectRatios: string[]
  durationOptions?: number[]
}

// Media-producing kinds — the only legal sources of a media wire. Video is
// TERMINAL in MVP: its output feeds nothing (image/operation inputs need an
// image; chaining video→video is out of scope).
export const MEDIA_SOURCE_KINDS: readonly CanvasNodeKind[] = [
  'image',
  'upload',
  'upscale',
  'remove-bg',
]

// Kinds that accept a media input at all (≤1 for image/video, =1 for ops).
export const MEDIA_TARGET_KINDS: readonly CanvasNodeKind[] = [
  'image',
  'video',
  'upscale',
  'remove-bg',
]
```

- [ ] **Step 3: Write the failing edgeRules tests**

Create `apps/web/src/modules/Canvas/model/edgeRules.test.ts`:

```typescript
// Every illegal connection the spec names, plus cycles. Pure function — no DOM.
import { describe, expect, it } from 'vitest'
import { canConnect } from './edgeRules'
import type { CanvasEdge } from '@opencreate/contracts'

const nodes = [
  { id: 'img1', kind: 'image' as const },
  { id: 'img2', kind: 'image' as const },
  { id: 'vid', kind: 'video' as const },
  { id: 'up', kind: 'upload' as const },
  { id: 'char', kind: 'character' as const },
  { id: 'scale', kind: 'upscale' as const },
  { id: 'note', kind: 'note' as const },
]
const edge = (id: string, s: string, t: string): CanvasEdge => ({
  id,
  sourceNodeId: s,
  targetNodeId: t,
})

describe('canConnect', () => {
  it('allows image → image (remix), image → video, upload → image, image → upscale', () => {
    for (const [s, t] of [
      ['img1', 'img2'],
      ['img1', 'vid'],
      ['up', 'img1'],
      ['img1', 'scale'],
    ] as const) {
      expect(canConnect(s, t, nodes, []).ok, `${s}→${t}`).toBe(true)
    }
  })
  it('allows character → image and character → video', () => {
    expect(canConnect('char', 'img1', nodes, []).ok).toBe(true)
    expect(canConnect('char', 'vid', nodes, []).ok).toBe(true)
  })
  it('refuses video as a source (terminal in MVP)', () => {
    expect(canConnect('vid', 'img1', nodes, []).ok).toBe(false)
  })
  it('refuses note in any role and character as a target', () => {
    expect(canConnect('note', 'img1', nodes, []).ok).toBe(false)
    expect(canConnect('img1', 'note', nodes, []).ok).toBe(false)
    expect(canConnect('img1', 'char', nodes, []).ok).toBe(false)
  })
  it('refuses character → upscale (operations take media only)', () => {
    expect(canConnect('char', 'scale', nodes, []).ok).toBe(false)
  })
  it('refuses a second media input on the same target', () => {
    const existing = [edge('e1', 'up', 'img1')]
    expect(canConnect('img2', 'img1', nodes, existing).ok).toBe(false)
  })
  it('allows media + character on the same target (separate slots)', () => {
    const existing = [edge('e1', 'up', 'img1')]
    expect(canConnect('char', 'img1', nodes, existing).ok).toBe(true)
  })
  it('refuses a second character on the same target', () => {
    const existing = [edge('e1', 'char', 'img1')]
    expect(canConnect('char', 'img1', nodes, existing).ok).toBe(false)
  })
  it('refuses self-connection and duplicates', () => {
    expect(canConnect('img1', 'img1', nodes, []).ok).toBe(false)
    const existing = [edge('e1', 'img1', 'img2')]
    expect(canConnect('img1', 'img2', nodes, existing).ok).toBe(false)
  })
  it('refuses a cycle (img1 → img2 → img1)', () => {
    const existing = [edge('e1', 'img1', 'img2')]
    expect(canConnect('img2', 'img1', nodes, existing).ok).toBe(false)
  })
  it('refuses a transitive cycle (a→b, b→c, then c→a)', () => {
    const existing = [edge('e1', 'img1', 'img2'), edge('e2', 'img2', 'scale')]
    expect(canConnect('scale', 'img1', nodes, existing).ok).toBe(false)
  })
})
```

- [ ] **Step 4: Implement edgeRules**

Create `apps/web/src/modules/Canvas/model/edgeRules.ts`:

```typescript
// apps/web/src/modules/Canvas/model/edgeRules.ts
// Pure connection law for the canvas graph (spec §3-4). Called during drag
// (isValidConnection) AND on connect — the graph can never contain an edge
// this file would refuse, so downstream code (run submission, toposort) can
// trust the shape instead of re-validating it.
import type { CanvasEdge, CanvasNodeKind } from '@opencreate/contracts'
import { MEDIA_SOURCE_KINDS } from './types'

type NodeLite = { id: string; kind: CanvasNodeKind }
type Verdict = { ok: true } | { ok: false; reason: string }

const refuse = (reason: string): Verdict => ({ ok: false, reason })

// Which input slots a target kind exposes, and their capacity.
const MEDIA_INPUT_CAP: Partial<Record<CanvasNodeKind, number>> = {
  image: 1,
  video: 1,
  upscale: 1,
  'remove-bg': 1,
}
const CHARACTER_INPUT_CAP: Partial<Record<CanvasNodeKind, number>> = {
  image: 1,
  video: 1,
}

export function canConnect(
  sourceId: string,
  targetId: string,
  nodes: readonly NodeLite[],
  edges: readonly CanvasEdge[],
): Verdict {
  if (sourceId === targetId) return refuse('a node cannot feed itself')
  const source = nodes.find((n) => n.id === sourceId)
  const target = nodes.find((n) => n.id === targetId)
  if (!source || !target) return refuse('unknown node')

  // Slot by SOURCE kind: characters travel the entity wire, media kinds the
  // media wire, everything else (note, video — terminal) has no output.
  const slot: 'media' | 'character' | null =
    source.kind === 'character'
      ? 'character'
      : MEDIA_SOURCE_KINDS.includes(source.kind)
        ? 'media'
        : null
  if (slot === null) return refuse(`${source.kind} has no output`)

  const cap = (slot === 'media' ? MEDIA_INPUT_CAP : CHARACTER_INPUT_CAP)[target.kind]
  if (cap === undefined) return refuse(`${target.kind} does not take a ${slot} input`)

  if (edges.some((e) => e.sourceNodeId === sourceId && e.targetNodeId === targetId))
    return refuse('already connected')

  // Capacity: count existing edges of the SAME slot into the target.
  const sameSlot = edges.filter((e) => {
    if (e.targetNodeId !== targetId) return false
    const s = nodes.find((n) => n.id === e.sourceNodeId)
    if (!s) return false
    const eSlot = s.kind === 'character' ? 'character' : 'media'
    return eSlot === slot
  })
  if (sameSlot.length >= cap) return refuse(`only ${cap} ${slot} input allowed`)

  // Cycle check: if target already reaches source, this edge closes a loop.
  const out = new Map<string, string[]>()
  for (const e of edges) {
    const list = out.get(e.sourceNodeId) ?? []
    list.push(e.targetNodeId)
    out.set(e.sourceNodeId, list)
  }
  const seen = new Set<string>()
  const stack = [targetId]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === sourceId) return refuse('this connection would create a cycle')
    if (seen.has(current)) continue
    seen.add(current)
    for (const next of out.get(current) ?? []) stack.push(next)
  }

  return { ok: true }
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/web && pnpm vitest run src/modules/Canvas/model/edgeRules.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/package.json pnpm-lock.yaml apps/web/src/modules/Canvas/model/types.ts apps/web/src/modules/Canvas/model/edgeRules.ts apps/web/src/modules/Canvas/model/edgeRules.test.ts
rtk git commit -m "feat(canvas-web): @xyflow/react + pure edge rules"
```

---

## Task 7: API layer + canvasStore (per-document singleton)

**Files:**
- Create: `apps/web/src/modules/Canvas/model/api.ts`
- Create: `apps/web/src/modules/Canvas/model/canvasStore.ts`
- Create: `apps/web/src/modules/Canvas/model/canvasStore.test.ts`

- [ ] **Step 1: Write the API layer**

Create `apps/web/src/modules/Canvas/model/api.ts`:

```typescript
// apps/web/src/modules/Canvas/model/api.ts
// Typed /api/canvases calls + TanStack Query hooks. Query keys: ['canvases']
// (list) and ['canvas', id] (document). The document is loaded ONCE into the
// store (init) and autosaved back — the query cache is not the editing truth,
// so no invalidation churn while dragging nodes.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Canvas,
  CanvasDetail,
  CanvasList,
  CanvasUploadResult,
  UpdateCanvasInput,
} from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

export function useCanvases() {
  return useQuery({
    queryKey: ['canvases'],
    queryFn: () => api<CanvasList>('/api/canvases'),
  })
}

export function useCanvasDetail(canvasId: string) {
  return useQuery({
    queryKey: ['canvas', canvasId],
    queryFn: () => api<CanvasDetail>(`/api/canvases/${canvasId}`),
    // The store owns edits after load; a background refetch overwriting the
    // working doc would eat keystrokes.
    staleTime: Infinity,
  })
}

export function useCreateCanvas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (title: string) =>
      api<Canvas>('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['canvases'] }),
  })
}

export function useDeleteCanvas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (canvasId: string) =>
      api<undefined>(`/api/canvases/${canvasId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['canvases'] }),
  })
}

// Raw save used by the autosave loop (not a hook — called from the store side).
export function saveCanvas(canvasId: string, doc: UpdateCanvasInput) {
  return api<CanvasDetail>(`/api/canvases/${canvasId}`, {
    method: 'PATCH',
    body: JSON.stringify(doc),
  })
}

export function uploadCanvasImage(canvasId: string, dataUri: string) {
  return api<CanvasUploadResult>(`/api/canvases/${canvasId}/uploads`, {
    method: 'POST',
    body: JSON.stringify({ dataUri }),
  })
}
```

- [ ] **Step 2: Write the failing store tests**

Create `apps/web/src/modules/Canvas/model/canvasStore.test.ts`:

```typescript
// The store is the editing truth: init from a loaded doc, node/edge edits mark
// it dirty, reset clears everything (wizardStore per-document discipline).
import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from './canvasStore'

const DOC = {
  id: 'c1',
  title: 'Fox chain',
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    {
      id: 'n1',
      kind: 'image' as const,
      position: { x: 0, y: 0 },
      config: { prompt: 'a fox', modelId: 'flux-dev', aspectRatio: '1:1' as const },
      generationIds: [],
    },
  ],
  edges: [],
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
}

beforeEach(() => useCanvasStore.getState().reset())

describe('useCanvasStore', () => {
  it('init loads the document and reads as saved', () => {
    useCanvasStore.getState().init(DOC)
    const s = useCanvasStore.getState()
    expect(s.canvasId).toBe('c1')
    expect(s.nodes).toHaveLength(1)
    expect(s.saveState).toBe('saved')
  })

  it('addNode / updateNodeConfig / moveNode / removeNode mark dirty', () => {
    useCanvasStore.getState().init(DOC)
    const s = () => useCanvasStore.getState()
    s().addNode('note', { x: 50, y: 60 })
    expect(s().nodes).toHaveLength(2)
    expect(s().saveState).toBe('dirty')

    s().markSaved()
    s().updateNodeConfig('n1', { prompt: 'a red fox' })
    expect(s().nodes[0]?.config.prompt).toBe('a red fox')
    expect(s().saveState).toBe('dirty')

    s().markSaved()
    s().moveNode('n1', { x: 99, y: 1 })
    expect(s().nodes[0]?.position).toEqual({ x: 99, y: 1 })
    expect(s().saveState).toBe('dirty')

    s().markSaved()
    s().removeNode('n1')
    expect(s().nodes.find((n) => n.id === 'n1')).toBeUndefined()
    expect(s().saveState).toBe('dirty')
  })

  it('removing a node removes its edges; children keep their generations', () => {
    useCanvasStore.getState().init({
      ...DOC,
      nodes: [
        ...DOC.nodes,
        {
          id: 'n2',
          kind: 'video' as const,
          position: { x: 200, y: 0 },
          config: {},
          generationIds: ['gv1'],
        },
      ],
      edges: [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' }],
    })
    useCanvasStore.getState().removeNode('n1')
    const s = useCanvasStore.getState()
    expect(s.edges).toHaveLength(0)
    expect(s.nodes.find((n) => n.id === 'n2')?.generationIds).toEqual(['gv1'])
  })

  it('addEdge appends; appendGeneration grows the version history', () => {
    useCanvasStore.getState().init(DOC)
    useCanvasStore.getState().addNode('video', { x: 300, y: 0 })
    const videoId = useCanvasStore.getState().nodes[1]!.id
    useCanvasStore.getState().addEdge('n1', videoId)
    expect(useCanvasStore.getState().edges).toHaveLength(1)

    useCanvasStore.getState().appendGeneration('n1', 'g-new')
    expect(useCanvasStore.getState().nodes[0]?.generationIds).toEqual(['g-new'])
  })

  it('reset returns to the empty state', () => {
    useCanvasStore.getState().init(DOC)
    useCanvasStore.getState().reset()
    const s = useCanvasStore.getState()
    expect(s.canvasId).toBeNull()
    expect(s.nodes).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Implement the store**

Create `apps/web/src/modules/Canvas/model/canvasStore.ts`:

```typescript
// apps/web/src/modules/Canvas/model/canvasStore.ts
// Editing truth for ONE open canvas. Singleton + init()/reset() on route
// change (the wizardStore per-document discipline — no store factories).
// Server truth lives in TanStack Query; this store holds what the server has
// no opinion about between saves: the working document + save status.
// Every mutating action flips saveState to 'dirty'; the autosave loop
// (useCanvasDoc) watches that flag, debounces, PATCHes and calls markSaved.
import { create } from 'zustand'
import type {
  CanvasDetail,
  CanvasEdge,
  CanvasNode,
  CanvasNodeConfig,
  CanvasNodeKind,
  CanvasViewport,
} from '@opencreate/contracts'

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

type CanvasStore = {
  canvasId: string | null
  title: string
  viewport: CanvasViewport
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  saveState: SaveState
  init: (doc: CanvasDetail) => void
  reset: () => void
  setTitle: (title: string) => void
  setViewport: (viewport: CanvasViewport) => void
  addNode: (kind: CanvasNodeKind, position: { x: number; y: number }) => void
  moveNode: (id: string, position: { x: number; y: number }) => void
  updateNodeConfig: (id: string, patch: Partial<CanvasNodeConfig>) => void
  setUploadUrl: (id: string, uploadUrl: string) => void
  appendGeneration: (id: string, generationId: string) => void
  removeNode: (id: string) => void
  addEdge: (sourceNodeId: string, targetNodeId: string) => void
  removeEdge: (id: string) => void
  markSaving: () => void
  markSaved: () => void
  markSaveError: () => void
}

const INITIAL = {
  canvasId: null,
  title: '',
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [] as CanvasNode[],
  edges: [] as CanvasEdge[],
  saveState: 'saved' as SaveState,
}

// crypto.randomUUID is available in every target browser and jsdom.
const mintId = () => crypto.randomUUID().slice(0, 8)

export const useCanvasStore = create<CanvasStore>((set) => ({
  ...INITIAL,

  init: (doc) =>
    set({
      canvasId: doc.id,
      title: doc.title,
      viewport: doc.viewport,
      nodes: doc.nodes,
      edges: doc.edges,
      saveState: 'saved',
    }),
  reset: () => set({ ...INITIAL }),

  setTitle: (title) => set({ title, saveState: 'dirty' }),
  setViewport: (viewport) => set({ viewport, saveState: 'dirty' }),

  addNode: (kind, position) =>
    set((s) => ({
      nodes: [...s.nodes, { id: mintId(), kind, position, config: {}, generationIds: [] }],
      saveState: 'dirty',
    })),
  moveNode: (id, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
      saveState: 'dirty',
    })),
  updateNodeConfig: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, config: { ...n.config, ...patch } } : n)),
      saveState: 'dirty',
    })),
  setUploadUrl: (id, uploadUrl) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, uploadUrl } : n)),
      saveState: 'dirty',
    })),
  appendGeneration: (id, generationId) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, generationIds: [...n.generationIds, generationId] } : n,
      ),
      saveState: 'dirty',
    })),
  // Deleting a parent removes its EDGES only — children keep citing their own
  // generations (spec §5: they cite generation ids, not the parent).
  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id),
      saveState: 'dirty',
    })),

  addEdge: (sourceNodeId, targetNodeId) =>
    set((s) => ({
      edges: [...s.edges, { id: mintId(), sourceNodeId, targetNodeId }],
      saveState: 'dirty',
    })),
  removeEdge: (id) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id), saveState: 'dirty' })),

  markSaving: () => set({ saveState: 'saving' }),
  // I3 fix-wave correction: guard on 'saving' ONLY. The first version of this
  // also matched 'dirty', so an edit made WHILE a PATCH was in flight (which
  // flips saveState 'saving' -> 'dirty') got falsely stomped back to 'saved'
  // by that PATCH's own markSaved() — the edit was never actually sent, and
  // the autosave subscriber (armed only on the TRANSITION into dirty) never
  // re-fired for it.
  markSaved: () => set((s) => (s.saveState === 'saving' ? { saveState: 'saved' } : {})),
  markSaveError: () => set({ saveState: 'error' }),
}))
```

- [ ] **Step 4: Run tests**

Run: `cd apps/web && pnpm vitest run src/modules/Canvas/model/canvasStore.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/src/modules/Canvas/model/api.ts apps/web/src/modules/Canvas/model/canvasStore.ts apps/web/src/modules/Canvas/model/canvasStore.test.ts
rtk git commit -m "feat(canvas-web): api layer + per-document editor store"
```

---

## Task 8: Debounced autosave — `useCanvasDoc`

**Files:**
- Create: `apps/web/src/modules/Canvas/model/useCanvasDoc.ts`
- Create: `apps/web/src/modules/Canvas/model/useCanvasDoc.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/modules/Canvas/model/useCanvasDoc.test.ts`:

```typescript
// The autosave loop: dirty → (1.5s quiet) → PATCH → saved; a failed PATCH →
// 'error' + retry keeps local state; unmount flushes a pending save.
// saveCanvas is mocked — the loop's behavior is the unit under test.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from './canvasStore'
import { useCanvasAutosave, AUTOSAVE_DEBOUNCE_MS } from './useCanvasDoc'
import { saveCanvas } from './api'

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>()
  return { ...original, saveCanvas: vi.fn() }
})
const mockSave = vi.mocked(saveCanvas)

const DOC = {
  id: 'c1',
  title: 'T',
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [],
  edges: [],
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
}

beforeEach(() => {
  vi.useFakeTimers()
  useCanvasStore.getState().reset()
  useCanvasStore.getState().init(DOC)
  mockSave.mockResolvedValue(DOC)
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useCanvasAutosave', () => {
  it('debounces: one PATCH after 1.5s of quiet, carrying the full document', async () => {
    const { unmount } = renderHook(() => useCanvasAutosave())
    act(() => {
      useCanvasStore.getState().addNode('note', { x: 1, y: 2 })
      useCanvasStore.getState().addNode('image', { x: 3, y: 4 })
    })
    expect(mockSave).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 10)
      await Promise.resolve()
    })
    expect(mockSave).toHaveBeenCalledTimes(1)
    const [canvasId, doc] = mockSave.mock.calls[0]!
    expect(canvasId).toBe('c1')
    expect(doc.nodes).toHaveLength(2)
    expect(useCanvasStore.getState().saveState).toBe('saved')
    unmount()
  })

  it('a failed PATCH flips to error and keeps the local doc', async () => {
    mockSave.mockRejectedValue(new Error('offline'))
    const { unmount } = renderHook(() => useCanvasAutosave())
    act(() => useCanvasStore.getState().addNode('note', { x: 1, y: 2 }))
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 10)
      await Promise.resolve()
    })
    expect(useCanvasStore.getState().saveState).toBe('error')
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
    unmount()
  })

  it('unmount flushes a pending save immediately', () => {
    const { unmount } = renderHook(() => useCanvasAutosave())
    act(() => useCanvasStore.getState().addNode('note', { x: 1, y: 2 }))
    expect(mockSave).not.toHaveBeenCalled()
    unmount()
    expect(mockSave).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/web && pnpm vitest run src/modules/Canvas/model/useCanvasDoc.test.ts`
Expected: FAIL — useCanvasDoc.ts does not exist

- [ ] **Step 3: Implement**

Create `apps/web/src/modules/Canvas/model/useCanvasDoc.ts`:

```typescript
// apps/web/src/modules/Canvas/model/useCanvasDoc.ts
// The autosave loop (spec §3: "saved 12s ago" / amber "not saved" + retry).
// First debounced autosave in the codebase — every prior save is an explicit
// button (ShotInspector) — because a node editor mutates on every drag and a
// button per drag is absurd. The loop watches the store's dirty flag via
// subscribe (no re-render per keystroke), waits for quiet, PATCHes the FULL
// document (last-write-wins, single owner), and flushes on unmount so closing
// the tab mid-edit loses at most the debounce window.
import { useEffect } from 'react'
import { useCanvasStore } from './canvasStore'
import { saveCanvas } from './api'

export const AUTOSAVE_DEBOUNCE_MS = 1500

// Snapshot the current doc as the PATCH body.
function currentDoc() {
  const s = useCanvasStore.getState()
  return {
    title: s.title,
    viewport: s.viewport,
    nodes: s.nodes,
    edges: s.edges,
  }
}

async function flush() {
  const s = useCanvasStore.getState()
  if (!s.canvasId || (s.saveState !== 'dirty' && s.saveState !== 'error')) return
  useCanvasStore.getState().markSaving()
  try {
    await saveCanvas(s.canvasId, currentDoc())
    useCanvasStore.getState().markSaved()
  } catch {
    // Local state stays; the header shows amber "not saved" with a retry that
    // calls retrySave() below. No toast storm — autosave fails quietly.
    useCanvasStore.getState().markSaveError()
  }
}

// Manual retry for the header's "not saved · retry" affordance.
export function retrySave() {
  void flush()
}

export function useCanvasAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = useCanvasStore.subscribe((state, prev) => {
      if (state.saveState !== 'dirty' || prev.saveState === 'dirty') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void flush()
      }, AUTOSAVE_DEBOUNCE_MS)
    })
    return () => {
      unsubscribe()
      if (timer) {
        clearTimeout(timer)
        // Fire-and-forget: the tab may be closing; a lost response is fine,
        // the next open re-loads whatever the server accepted.
        void flush()
      }
    }
  }, [])
}
```

**Debounce subtlety the test pins:** the subscriber re-arms the timer only on
the saved/… → dirty TRANSITION; edits while already dirty ride the armed
timer. Two rapid edits = one PATCH.

- [ ] **Step 4: Run tests**

Run: `cd apps/web && pnpm vitest run src/modules/Canvas/model/useCanvasDoc.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/src/modules/Canvas/model/useCanvasDoc.ts apps/web/src/modules/Canvas/model/useCanvasDoc.test.ts
rtk git commit -m "feat(canvas-web): debounced full-document autosave"
```

---

## Task 9: Node runs — `useNodeGeneration`

**Files:**
- Create: `apps/web/src/modules/Canvas/model/useNodeGeneration.ts`
- Create: `apps/web/src/modules/Canvas/model/useNodeGeneration.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/modules/Canvas/model/useNodeGeneration.test.ts`:

```typescript
// A node run is an ordinary POST /api/generations built from the node's config
// + its incoming wires: media edge → inputGenerationId (or uploadUrl is NOT
// sendable — uploads become inputImage data URIs? NO: uploads were stored
// server-side, their /media path cannot travel as inputGenerationId — see
// buildRunInput: upload sources are refused for MVP chain (the node itself
// still previews). Character edge → entityRefs (phase 3 — out of scope here).
import { describe, expect, it } from 'vitest'
import { buildRunInput } from './useNodeGeneration'
import type { CanvasEdge, CanvasNode } from '@opencreate/contracts'

const imageNode = (id: string, generationIds: string[] = []): CanvasNode => ({
  id,
  kind: 'image',
  position: { x: 0, y: 0 },
  config: { prompt: 'a fox', modelId: 'flux-dev', aspectRatio: '1:1' },
  generationIds,
})

describe('buildRunInput', () => {
  it('builds a plain t2i input from config', () => {
    const node = imageNode('n1')
    const input = buildRunInput(node, [], [])
    expect(input).toEqual({ modelId: 'flux-dev', prompt: 'a fox', aspectRatio: '1:1' })
  })

  it('wires the parent image node output as inputGenerationId', () => {
    const parent = imageNode('p', ['g-old', 'g-latest'])
    const node: CanvasNode = {
      ...imageNode('n1'),
      config: { prompt: 'remix', modelId: 'flux-kontext-pro', aspectRatio: '1:1' },
    }
    const edges: CanvasEdge[] = [{ id: 'e1', sourceNodeId: 'p', targetNodeId: 'n1' }]
    const input = buildRunInput(node, [parent, node], edges)
    // Latest history entry is the node's output
    expect(input?.inputGenerationId).toBe('g-latest')
  })

  it('adds duration for video nodes', () => {
    const node: CanvasNode = {
      id: 'v1',
      kind: 'video',
      position: { x: 0, y: 0 },
      config: { prompt: 'walks away', modelId: 'pixverse-v6', aspectRatio: '16:9', duration: 5 },
      generationIds: [],
    }
    const input = buildRunInput(node, [node], [])
    expect(input?.duration).toBe(5)
  })

  it('returns null when required config is missing (no prompt / no model)', () => {
    const node: CanvasNode = { ...imageNode('n1'), config: { prompt: '', modelId: 'flux-dev' } }
    expect(buildRunInput(node, [node], [])).toBeNull()
  })

  it('returns null when the media parent has no succeeded output yet', () => {
    const parent = imageNode('p', [])
    const node = imageNode('n1')
    const edges: CanvasEdge[] = [{ id: 'e1', sourceNodeId: 'p', targetNodeId: 'n1' }]
    // Parent connected but never ran — the node must not submit a broken chain
    expect(buildRunInput(node, [parent, node], edges)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail, then implement**

Run: `cd apps/web && pnpm vitest run src/modules/Canvas/model/useNodeGeneration.test.ts`
Expected: FAIL — module missing

Create `apps/web/src/modules/Canvas/model/useNodeGeneration.ts`:

```typescript
// apps/web/src/modules/Canvas/model/useNodeGeneration.ts
// One node's run + poll. Submit mirrors Cinema's useGenerateShotClip
// discipline (retry allowlist on submit only); polling mirrors
// useShotGeneration: query key ['generation', id] @ 4s, shared with every
// other poller in the app. On success the id is APPENDED to the node's
// version history (never overwrites — spec: "⟳ v3 · history").
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import type {
  CanvasEdge,
  CanvasNode,
  CreateGenerationInput,
  Generation,
  GenerationList,
} from '@opencreate/contracts'
import { api, ApiClientError } from 'shared/libs/apiClient'
import { useCanvasStore } from './canvasStore'
import { MEDIA_SOURCE_KINDS } from './types'

const POLL_INTERVAL_MS = 4000

// Pure: node + graph → the POST body, or null when the node isn't runnable
// yet (missing prompt/model, or a media parent with no SUCCEEDED output).
// The Generate button disables on null — a click can never submit a broken
// chain. C2 fix-wave correction: the FIRST version of this function took
// generationIds[length-1] with NO status check, so a child could cite a
// still-processing or failed parent. `generationStatus` is a snapshot the
// caller reads out of the shared TanStack Query cache (['generation', id]).
export function buildRunInput(
  node: CanvasNode,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  generationStatus: Readonly<Record<string, Generation['status'] | undefined>> = {},
): CreateGenerationInput | null {
  const prompt = node.config.prompt?.trim()
  const modelId = node.config.modelId
  if (!prompt || prompt.length < 2 || !modelId) return null

  const input: CreateGenerationInput = {
    modelId,
    prompt,
    ...(node.config.aspectRatio ? { aspectRatio: node.config.aspectRatio } : {}),
    ...(node.kind === 'video' && node.config.duration !== undefined
      ? { duration: node.config.duration }
      : {}),
  }

  // Media wire: the parent's NEWEST SUCCEEDED generation id becomes
  // inputGenerationId — never merely the last history entry (that can be
  // processing or failed). F4 fix-wave correction: the FIRST version of this
  // lookup excluded 'upload' from the match entirely, so a node wired to an
  // upload got mediaParent === undefined — the SAME result as no wire at
  // all — and silently fell through to a plain t2i/t2v, charging the user for
  // a run that ignored a wire they could see on the board. The lookup now
  // matches uploads like any other media-kind source; the explicit
  // `mediaParent.kind === 'upload'` check below is what disables Generate
  // (an upload has no `generationIds` history — a stored file, not a
  // generation — so there is nothing to cite until phase 4's operation nodes
  // give it one). The wire itself stays legal (edgeRules is unchanged).
  const mediaParent = edges
    .filter((e) => e.targetNodeId === node.id)
    .map((e) => nodes.find((n) => n.id === e.sourceNodeId))
    .find((n) => n !== undefined && MEDIA_SOURCE_KINDS.includes(n.kind))
  if (mediaParent) {
    if (mediaParent.kind === 'upload') return null
    const succeeded = [...mediaParent.generationIds]
      .reverse()
      .find((gid) => generationStatus[gid] === 'succeeded')
    if (!succeeded) return null
    input.inputGenerationId = succeeded
  }

  return input
}

// Submit-only retries (Cinema's allowlist): a 5xx/429 on submit is safe to
// retry — the server hasn't charged; anything else (validation, credits) is
// final. Never retry the poll — it's already a loop.
function shouldRetrySubmit(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false
  if (!(error instanceof ApiClientError)) return false
  return (
    error.status >= 500 ||
    error.code === 'rate_limited' ||
    error.code === 'provider_error' ||
    error.code === 'internal_error'
  )
}

export function useRunNode(nodeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    retry: shouldRetrySubmit,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    mutationFn: (input: CreateGenerationInput) =>
      api<Generation>('/api/generations', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (generation) => {
      // Version history is append-only; the poller below takes over from here.
      useCanvasStore.getState().appendGeneration(nodeId, generation.id)
      queryClient.setQueryData(['generation', generation.id], generation)
      // The Library shows canvas runs like any other (same cache seams as the
      // Generator: prepend + refresh the balance chip).
      queryClient.setQueryData<InfiniteData<GenerationList>>(['generations'], (old) =>
        old && old.pages.length > 0
          ? {
              ...old,
              pages: old.pages.map((page, index) =>
                index === 0 ? { ...page, items: [generation, ...page.items] } : page,
              ),
            }
          : old,
      )
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

// Poll the node's LATEST generation while it processes (shared cache key).
export function useNodeGeneration(generationId: string | null) {
  return useQuery({
    queryKey: ['generation', generationId],
    enabled: generationId !== null,
    queryFn: () => api<Generation>(`/api/generations/${generationId}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'processing' ? POLL_INTERVAL_MS : false
    },
  })
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/web && pnpm vitest run src/modules/Canvas/model/useNodeGeneration.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/src/modules/Canvas/model/useNodeGeneration.ts apps/web/src/modules/Canvas/model/useNodeGeneration.test.ts
rtk git commit -m "feat(canvas-web): node run submit + shared-cache polling"
```

---

## Task 10: Node components (shell, image, video, upload, note, version strip)

**Files:**
- Create: `apps/web/src/modules/Canvas/components/NodeShell.tsx`
- Create: `apps/web/src/modules/Canvas/components/VersionStrip.tsx`
- Create: `apps/web/src/modules/Canvas/components/ImageNode.tsx`
- Create: `apps/web/src/modules/Canvas/components/VideoNode.tsx`
- Create: `apps/web/src/modules/Canvas/components/UploadNode.tsx`
- Create: `apps/web/src/modules/Canvas/components/NoteNode.tsx`
- Create: `apps/web/src/modules/Canvas/components/ImageNode.test.tsx`

All generation nodes share the composer anatomy from the spec: header (kind +
status word), preview (4 states), prompt textarea, chips (model select · aspect ·
cost `glow-green`), Generate pill. Status border: idle `border-white/10` →
processing `border-glow-amber` → succeeded `border-glow-green` → failed
`border-glow-red` — always with the status WORD in the header (never color-only).

- [ ] **Step 1: NodeShell + VersionStrip**

Create `apps/web/src/modules/Canvas/components/NodeShell.tsx`:

```tsx
// apps/web/src/modules/Canvas/components/NodeShell.tsx
// Shared chrome for every canvas node: steel card, status border + status
// word, optional left (input) / right (output) React Flow handles. Nodes are
// ordinary DOM (ADR D4) — this is just a styled wrapper.
import type { ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeRunStatus } from '../model/types'

const STATUS_BORDER: Record<NodeRunStatus, string> = {
  idle: 'border-white/10',
  processing: 'border-glow-amber',
  succeeded: 'border-glow-green',
  failed: 'border-glow-red',
}
const STATUS_TEXT: Record<NodeRunStatus, string> = {
  idle: 'text-mist-dim',
  processing: 'text-glow-amber',
  succeeded: 'text-glow-green',
  failed: 'text-glow-red',
}
const STATUS_LABEL: Record<NodeRunStatus, string> = {
  idle: 'idle',
  processing: 'processing',
  succeeded: 'done',
  failed: 'failed',
}

export type NodeShellProps = {
  title: string
  status: NodeRunStatus
  hasInput: boolean
  hasOutput: boolean
  children: ReactNode
}

export function NodeShell({ title, status, hasInput, hasOutput, children }: NodeShellProps) {
  return (
    <div
      className={`w-72 rounded-lg border bg-steel p-3 shadow-glass ${STATUS_BORDER[status]}`}
    >
      {hasInput ? (
        <Handle type="target" position={Position.Left} className="!bg-portal" />
      ) : null}
      <header className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-white">{title}</span>
        {/* The WORD carries the status; the border repeats it for glanceability */}
        <span className={`text-[10px] ${STATUS_TEXT[status]}`}>{STATUS_LABEL[status]}</span>
      </header>
      {children}
      {hasOutput ? (
        <Handle type="source" position={Position.Right} className="!bg-glow-green" />
      ) : null}
    </div>
  )
}
```

Create `apps/web/src/modules/Canvas/components/VersionStrip.tsx`:

```tsx
// apps/web/src/modules/Canvas/components/VersionStrip.tsx
// "⟳ v3 · history": regeneration APPENDS to the node's generationIds; this
// strip steps through them. Controlled: the parent owns which version shows.
export type VersionStripProps = {
  count: number
  // 0-based index of the shown version
  index: number
  onStep: (nextIndex: number) => void
}

export function VersionStrip({ count, index, onStep }: VersionStripProps) {
  if (count < 2) return null
  return (
    <div className="flex items-center gap-1 text-[10px] text-mist-dim">
      <button
        type="button"
        aria-label="Previous version"
        disabled={index === 0}
        onClick={() => onStep(index - 1)}
        className="px-1 disabled:opacity-40"
      >
        ‹
      </button>
      <span>
        v{index + 1} / {count}
      </span>
      <button
        type="button"
        aria-label="Next version"
        disabled={index === count - 1}
        onClick={() => onStep(index + 1)}
        className="px-1 disabled:opacity-40"
      >
        ›
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Failing ImageNode test**

Create `apps/web/src/modules/Canvas/components/ImageNode.test.tsx`:

```tsx
// The image node's 4 preview states + the Generate gate (disabled without a
// runnable input). Hooks are mocked; React Flow needs its provider for Handle.
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Generation } from '@opencreate/contracts'
import { useCanvasStore } from '../model/canvasStore'
import { useNodeGeneration, useRunNode } from '../model/useNodeGeneration'
import { ImageNode } from './ImageNode'

vi.mock('../model/useNodeGeneration', async (importOriginal) => {
  const original = await importOriginal<typeof import('../model/useNodeGeneration')>()
  return { ...original, useRunNode: vi.fn(), useNodeGeneration: vi.fn() }
})
const mockRun = vi.mocked(useRunNode)
const mockPoll = vi.mocked(useNodeGeneration)

const DOC = {
  id: 'c1',
  title: 'T',
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    {
      id: 'n1',
      kind: 'image' as const,
      position: { x: 0, y: 0 },
      config: { prompt: 'a fox', modelId: 'flux-dev', aspectRatio: '1:1' as const },
      generationIds: [] as string[],
    },
  ],
  edges: [],
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
}

const MODELS = [
  {
    id: 'flux-dev',
    name: 'Studio',
    providerLabel: 'FLUX dev',
    type: 'image' as const,
    credits: 2,
    aspectRatios: ['16:9', '1:1', '9:16'],
  },
]

function renderNode() {
  return render(
    <ReactFlowProvider>
      <ImageNode id="n1" data={{ models: MODELS }} />
    </ReactFlowProvider>,
  )
}

const gen = (status: Generation['status'], over: Partial<Generation> = {}): Generation =>
  ({
    id: 'g1',
    type: 'image',
    mode: 'text',
    status,
    prompt: 'a fox',
    modelId: 'flux-dev',
    params: { aspectRatio: '1:1' },
    costCredits: 2,
    mediaUrls: status === 'succeeded' ? ['/media/g1.webp'] : [],
    errorMessage: status === 'failed' ? 'provider down' : null,
    createdAt: '2026-07-30T00:00:00.000Z',
    completedAt: null,
  }) as Generation

beforeEach(() => {
  vi.clearAllMocks()
  useCanvasStore.getState().reset()
  useCanvasStore.getState().init(DOC)
  mockRun.mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  mockPoll.mockReturnValue({ data: undefined } as never)
})

describe('ImageNode', () => {
  it('idle: shows the prompt, the cost chip and an enabled Generate', () => {
    renderNode()
    expect(screen.getByDisplayValue('a fox')).toBeInTheDocument()
    expect(screen.getByText('2 cr')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate/i })).toBeEnabled()
  })

  it('processing: skeleton + amber word', () => {
    useCanvasStore.getState().appendGeneration('n1', 'g1')
    mockPoll.mockReturnValue({ data: gen('processing') } as never)
    renderNode()
    expect(screen.getByText('processing')).toBeInTheDocument()
  })

  it('succeeded: renders the media preview', () => {
    useCanvasStore.getState().appendGeneration('n1', 'g1')
    mockPoll.mockReturnValue({ data: gen('succeeded') } as never)
    renderNode()
    expect(screen.getByRole('img')).toHaveAttribute('src', '/media/g1.webp')
  })

  it('failed: shows the error and a retry that resubmits', () => {
    useCanvasStore.getState().appendGeneration('n1', 'g1')
    mockPoll.mockReturnValue({ data: gen('failed') } as never)
    const mutate = vi.fn()
    mockRun.mockReturnValue({ mutate, isPending: false } as never)
    renderNode()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    screen.getByRole('button', { name: /retry/i }).click()
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('disables Generate when the prompt is empty', () => {
    useCanvasStore.getState().updateNodeConfig('n1', { prompt: '' })
    renderNode()
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
  })
})
```

- [ ] **Step 3: Implement ImageNode (VideoNode mirrors it)**

Create `apps/web/src/modules/Canvas/components/ImageNode.tsx`:

```tsx
// apps/web/src/modules/Canvas/components/ImageNode.tsx
// The image mini-composer node. Reads ITS node from the store by id (React
// Flow passes only id/data), renders the 4 preview states off the latest
// version's poll, submits through useRunNode. Catalog models arrive via node
// data from the ROUTE seam — this module never imports Generator.
import { Skeleton } from 'shared/ui'
import type { CanvasModelOption } from '../model/types'
import { useCanvasStore } from '../model/canvasStore'
import { buildRunInput, useNodeGeneration, useRunNode } from '../model/useNodeGeneration'
import { NodeShell } from './NodeShell'
import { VersionStrip } from './VersionStrip'
import { useState } from 'react'

export type GenerationNodeData = { models: CanvasModelOption[] }

export function ImageNode({ id, data }: { id: string; data: GenerationNodeData }) {
  return <GenerationNode id={id} data={data} kind="image" title="Image" />
}

// Shared body for image/video — exported for VideoNode, not from the module.
export function GenerationNode({
  id,
  data,
  kind,
  title,
}: {
  id: string
  data: GenerationNodeData
  kind: 'image' | 'video'
  title: string
}) {
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === id))
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig)
  const run = useRunNode(id)

  // Which version shows: default = latest; the strip steps back through history.
  const [versionIndex, setVersionIndex] = useState<number | null>(null)
  const history = node?.generationIds ?? []
  const shownIndex = versionIndex ?? history.length - 1
  const shownId = history[shownIndex] ?? null
  const poll = useNodeGeneration(shownId)
  const generation = poll.data

  if (!node) return null
  const models = data.models.filter((m) => m.type === kind)
  const model = models.find((m) => m.id === node.config.modelId)
  const runInput = buildRunInput(node, nodes, edges)

  const status =
    generation?.status === 'processing'
      ? 'processing'
      : generation?.status === 'succeeded'
        ? 'succeeded'
        : generation?.status === 'failed'
          ? 'failed'
          : 'idle'

  return (
    <NodeShell title={title} status={status} hasInput hasOutput={kind === 'image'}>
      {/* Preview: the 4 states. Idle keeps the media silhouette so wires
          don't jump when the first render lands. */}
      {status === 'processing' ? (
        <Skeleton className="mb-2 aspect-square w-full" />
      ) : status === 'failed' ? (
        <div role="alert" className="mb-2 rounded border border-glow-red/40 p-2 text-[11px] text-mist">
          {generation?.errorMessage ?? 'Generation failed'}
          <button
            type="button"
            onClick={() => runInput && run.mutate(runInput)}
            className="ml-2 text-lumen-red underline"
          >
            Retry
          </button>
        </div>
      ) : status === 'succeeded' && generation?.mediaUrls[0] ? (
        kind === 'video' ? (
          <video src={generation.mediaUrls[0]} controls muted className="mb-2 w-full rounded" />
        ) : (
          <img src={generation.mediaUrls[0]} alt={node.config.prompt ?? 'result'} className="mb-2 w-full rounded" />
        )
      ) : (
        <div className="mb-2 flex aspect-square w-full items-center justify-center rounded border border-white/10 text-[11px] text-mist-dim">
          not generated yet
        </div>
      )}

      <VersionStrip count={history.length} index={shownIndex} onStep={setVersionIndex} />

      {/* nodrag: React Flow must not start a canvas drag from form fields */}
      <textarea
        value={node.config.prompt ?? ''}
        onChange={(e) => updateNodeConfig(id, { prompt: e.target.value })}
        placeholder="Describe…"
        rows={2}
        className="nodrag mb-2 w-full resize-none rounded border border-white/10 bg-transparent p-2 text-xs text-white placeholder:text-mist-dim focus:border-white/30 focus:outline-none"
      />
      <div className="mb-2 flex items-center gap-2">
        <select
          value={node.config.modelId ?? ''}
          onChange={(e) => updateNodeConfig(id, { modelId: e.target.value })}
          aria-label="Model"
          className="nodrag min-w-0 flex-1 rounded border border-white/10 bg-steel p-1 text-[11px] text-white"
        >
          <option value="" disabled>
            model…
          </option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.providerLabel}
            </option>
          ))}
        </select>
        {kind === 'video' ? (
          <select
            value={node.config.duration ?? 5}
            onChange={(e) => updateNodeConfig(id, { duration: Number(e.target.value) })}
            aria-label="Duration"
            className="nodrag rounded border border-white/10 bg-steel p-1 text-[11px] text-white"
          >
            {(model?.durationOptions ?? [5]).map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
        ) : null}
        {model ? <span className="text-[11px] text-glow-green">{model.credits} cr</span> : null}
      </div>
      <button
        type="button"
        onClick={() => runInput && run.mutate(runInput)}
        disabled={!runInput || run.isPending || status === 'processing'}
        className="nodrag w-full rounded-full border border-white/10 bg-specimen-green/20 py-1.5 text-xs font-medium text-glow-green hover:bg-specimen-green/35 disabled:opacity-40"
      >
        {status === 'processing' ? 'Generating…' : 'Generate'}
      </button>
    </NodeShell>
  )
}
```

Create `apps/web/src/modules/Canvas/components/VideoNode.tsx`:

```tsx
// apps/web/src/modules/Canvas/components/VideoNode.tsx
// The video mini-composer: same body as ImageNode with kind='video' —
// terminal node (no output handle), duration chip, i2v via its media wire.
import { GenerationNode, type GenerationNodeData } from './ImageNode'

export function VideoNode({ id, data }: { id: string; data: GenerationNodeData }) {
  return <GenerationNode id={id} data={data} kind="video" title="Video" />
}
```

- [ ] **Step 4: UploadNode + NoteNode**

Create `apps/web/src/modules/Canvas/components/UploadNode.tsx`:

```tsx
// apps/web/src/modules/Canvas/components/UploadNode.tsx
// Client upload → POST /api/canvases/:id/uploads → stored /media path on the
// node (no generation, no charge). File → data URI via FileReader; the server
// re-guards raster/size. In THIS phase an upload node previews and anchors
// the graph visually; citing it as a chain input arrives with operations
// (phase 4) — buildRunInput refuses it explicitly until then.
import { useRef, useState } from 'react'
import { useCanvasStore } from '../model/canvasStore'
import { uploadCanvasImage } from '../model/api'
import { NodeShell } from './NodeShell'

export function UploadNode({ id }: { id: string }) {
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === id))
  const canvasId = useCanvasStore((s) => s.canvasId)
  const setUploadUrl = useCanvasStore((s) => s.setUploadUrl)
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'uploading' | 'error'>('idle')

  if (!node) return null

  const handleFile = (file: File) => {
    if (!canvasId) return
    setState('uploading')
    const reader = new FileReader()
    reader.onload = () => {
      void uploadCanvasImage(canvasId, reader.result as string)
        .then(({ uploadUrl }) => {
          setUploadUrl(id, uploadUrl)
          setState('idle')
        })
        .catch(() => setState('error'))
    }
    reader.onerror = () => setState('error')
    reader.readAsDataURL(file)
  }

  return (
    <NodeShell title="Upload" status={node.uploadUrl ? 'succeeded' : 'idle'} hasInput={false} hasOutput>
      {node.uploadUrl ? (
        <img src={node.uploadUrl} alt="uploaded" className="mb-2 w-full rounded" />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={state === 'uploading'}
          className="nodrag mb-2 flex aspect-square w-full items-center justify-center rounded border border-dashed border-white/20 text-[11px] text-mist-dim hover:border-white/40 disabled:opacity-40"
        >
          {state === 'uploading' ? 'Uploading…' : 'Click to upload an image'}
        </button>
      )}
      {state === 'error' ? (
        <p role="alert" className="text-[11px] text-glow-red">
          Upload failed — try a smaller raster image
        </p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </NodeShell>
  )
}
```

Create `apps/web/src/modules/Canvas/components/NoteNode.tsx`:

```tsx
// apps/web/src/modules/Canvas/components/NoteNode.tsx
// Sticky note: free text, no ports, never runs (spec §3). Amber-tinted so it
// reads as annotation, not as a generator block.
import { useCanvasStore } from '../model/canvasStore'

export function NoteNode({ id }: { id: string }) {
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === id))
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig)
  if (!node) return null
  return (
    <div className="w-56 rounded-lg border border-specimen-amber/40 bg-specimen-amber/20 p-3">
      <textarea
        value={node.config.text ?? ''}
        onChange={(e) => updateNodeConfig(id, { text: e.target.value })}
        placeholder="Note…"
        rows={3}
        aria-label="Note"
        className="nodrag w-full resize-none bg-transparent text-xs text-lumen-amber placeholder:text-lumen-amber/50 focus:outline-none"
      />
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/web && pnpm vitest run src/modules/Canvas/components/ImageNode.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/src/modules/Canvas/components
rtk git commit -m "feat(canvas-web): node components — image/video/upload/note, version strip"
```

---

## Task 11: CanvasEditor + NodePalette + routes + module index

**Files:**
- Create: `apps/web/src/modules/Canvas/components/NodePalette.tsx`
- Create: `apps/web/src/modules/Canvas/components/CanvasEditor.tsx`
- Create: `apps/web/src/modules/Canvas/components/CanvasLibrary.tsx`
- Create: `apps/web/src/modules/Canvas/index.ts`
- Create: `apps/web/src/routes/_shell.canvas.index.tsx`
- Create: `apps/web/src/routes/canvas.$canvasId.tsx`

- [ ] **Step 1: NodePalette**

Create `apps/web/src/modules/Canvas/components/NodePalette.tsx`:

```tsx
// apps/web/src/modules/Canvas/components/NodePalette.tsx
// Left rail: the phase-1/2 node kinds. Drag onto the canvas (dataTransfer
// carries the kind; CanvasEditor's onDrop converts to flow coords) or click
// to add at the viewport center. Character/operations arrive in phases 3-4.
import type { DragEvent } from 'react'
import type { CanvasNodeKind } from '@opencreate/contracts'

export const NODE_KIND_MIME = 'application/x-opencreate-node-kind'

const PALETTE: { kind: CanvasNodeKind; label: string; glyph: string }[] = [
  { kind: 'image', label: 'Image', glyph: '▣' },
  { kind: 'video', label: 'Video', glyph: '▶' },
  { kind: 'upload', label: 'Upload', glyph: '⇧' },
  { kind: 'note', label: 'Note', glyph: '✎' },
]

export function NodePalette({ onAdd }: { onAdd: (kind: CanvasNodeKind) => void }) {
  const handleDragStart = (event: DragEvent, kind: CanvasNodeKind) => {
    event.dataTransfer.setData(NODE_KIND_MIME, kind)
    event.dataTransfer.effectAllowed = 'move'
  }
  return (
    <aside aria-label="Node palette" className="flex w-24 flex-col gap-2 border-r border-white/10 p-2">
      {PALETTE.map(({ kind, label, glyph }) => (
        <button
          key={kind}
          type="button"
          draggable
          onDragStart={(e) => handleDragStart(e, kind)}
          onClick={() => onAdd(kind)}
          className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-steel py-3 text-mist hover:border-white/30"
        >
          <span aria-hidden="true" className="text-base">
            {glyph}
          </span>
          <span className="text-[10px]">{label}</span>
        </button>
      ))}
    </aside>
  )
}
```

- [ ] **Step 2: CanvasEditor**

Create `apps/web/src/modules/Canvas/components/CanvasEditor.tsx`:

```tsx
// apps/web/src/modules/Canvas/components/CanvasEditor.tsx
// The React Flow shell (ADR D4). The STORE is the document truth; RF nodes/
// edges are DERIVED each render, and RF change events write back:
// position → moveNode, remove → removeNode/removeEdge, connect → edgeRules →
// addEdge. Wires refuse illegal connections DURING drag (isValidConnection).
import { useCallback, useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { CanvasNodeKind } from '@opencreate/contracts'
import type { CanvasModelOption } from '../model/types'
import { canConnect } from '../model/edgeRules'
import { useCanvasStore } from '../model/canvasStore'
import { ImageNode } from './ImageNode'
import { VideoNode } from './VideoNode'
import { UploadNode } from './UploadNode'
import { NoteNode } from './NoteNode'
import { NODE_KIND_MIME, NodePalette } from './NodePalette'

const nodeTypes: NodeTypes = {
  image: ImageNode as never,
  video: VideoNode as never,
  upload: UploadNode as never,
  note: NoteNode as never,
}

function EditorInner({ models }: { models: CanvasModelOption[] }) {
  const storeNodes = useCanvasStore((s) => s.nodes)
  const storeEdges = useCanvasStore((s) => s.edges)
  const moveNode = useCanvasStore((s) => s.moveNode)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const addNode = useCanvasStore((s) => s.addNode)
  const addEdge = useCanvasStore((s) => s.addEdge)
  const removeEdge = useCanvasStore((s) => s.removeEdge)
  const setViewport = useCanvasStore((s) => s.setViewport)
  const { screenToFlowPosition } = useReactFlow()

  // Derived RF objects. data is the same object per render pass — RF handles
  // memoization internally; the store array identity changes only on edits.
  const rfNodes: Node[] = useMemo(
    () =>
      storeNodes.map((n) => ({
        id: n.id,
        type: n.kind,
        position: n.position,
        data: { models },
      })),
    [storeNodes, models],
  )
  const rfEdges: Edge[] = useMemo(
    () => storeEdges.map((e) => ({ id: e.id, source: e.sourceNodeId, target: e.targetNodeId })),
    [storeEdges],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        // Write positions on drag END only — one store write (and one autosave
        // debounce arm) per gesture instead of sixty per second.
        if (change.type === 'position' && change.dragging === false && change.position) {
          moveNode(change.id, change.position)
        }
        if (change.type === 'remove') removeNode(change.id)
      }
    },
    [moveNode, removeNode],
  )
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'remove') removeEdge(change.id)
      }
    },
    [removeEdge],
  )
  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      connection.source !== null &&
      connection.target !== null &&
      canConnect(connection.source, connection.target, storeNodes, storeEdges).ok,
    [storeNodes, storeEdges],
  )
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      if (!canConnect(connection.source, connection.target, storeNodes, storeEdges).ok) return
      addEdge(connection.source, connection.target)
    },
    [storeNodes, storeEdges, addEdge],
  )

  return (
    <div className="flex min-h-0 flex-1">
      <NodePalette
        onAdd={(kind) =>
          addNode(kind, screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))
        }
      />
      <div
        className="min-w-0 flex-1"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(NODE_KIND_MIME)) e.preventDefault()
        }}
        onDrop={(e) => {
          const kind = e.dataTransfer.getData(NODE_KIND_MIME) as CanvasNodeKind | ''
          if (!kind) return
          e.preventDefault()
          addNode(kind, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
        }}
      >
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onMoveEnd={(_e, viewport) => setViewport(viewport)}
          defaultViewport={useCanvasStore.getState().viewport}
          selectionOnDrag
          panOnScroll
          proOptions={{ hideAttribution: true }}
          className="bg-void"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#314062" />
          <MiniMap position="bottom-right" pannable zoomable className="!bg-abyss" />
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}

export function CanvasEditor({ models }: { models: CanvasModelOption[] }) {
  return (
    <ReactFlowProvider>
      <EditorInner models={models} />
    </ReactFlowProvider>
  )
}
```

- [ ] **Step 3: CanvasLibrary (list) + module index**

Create `apps/web/src/modules/Canvas/components/CanvasLibrary.tsx`:

```tsx
// apps/web/src/modules/Canvas/components/CanvasLibrary.tsx
// The /canvas list — CinemaLibrary pattern: 4 states, card grid, create CTA.
import { Link, useNavigate } from '@tanstack/react-router'
import { Button, EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useCanvases, useCreateCanvas } from '../model/api'

const SKELETON_KEYS = ['s1', 's2', 's3']

export function CanvasLibrary() {
  const canvases = useCanvases()
  const create = useCreateCanvas()
  const navigate = useNavigate()

  const handleCreate = () => {
    create.mutate('Untitled canvas', {
      onSuccess: (created) => void navigate({ to: '/canvas/$canvasId', params: { canvasId: created.id } }),
    })
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-normal text-white">Canvases</h1>
        <Button onClick={handleCreate} isLoading={create.isPending}>
          New canvas
        </Button>
      </header>
      {canvases.isPending ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-28 w-full" />
          ))}
        </div>
      ) : canvases.isError ? (
        <ErrorState message="Could not load your canvases" onRetry={() => void canvases.refetch()} />
      ) : canvases.data.items.length === 0 ? (
        <EmptyState
          title="No canvases yet"
          description="Create one and drag your first node onto the board."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {canvases.data.items.map((item) => (
            <Link
              key={item.id}
              to="/canvas/$canvasId"
              params={{ canvasId: item.id }}
              className="rounded-lg border border-white/10 bg-steel p-4 hover:border-white/30"
            >
              <span className="block text-sm font-medium text-white">{item.title}</span>
              <span className="block text-xs text-mist-dim">
                {new Date(item.updatedAt).toLocaleString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
```

Create `apps/web/src/modules/Canvas/index.ts`:

```typescript
// apps/web/src/modules/Canvas/index.ts
// Public API of the Canvas module. Routes compose ONLY through these exports.
// The store/hooks stay private — the editor owns its document lifecycle.
export { CanvasEditor } from './components/CanvasEditor'
export { CanvasLibrary } from './components/CanvasLibrary'
export { useCanvasStore } from './model/canvasStore'
export { useCanvasDetail } from './model/api'
export { useCanvasAutosave, retrySave } from './model/useCanvasDoc'
export type { CanvasModelOption } from './model/types'
```

- [ ] **Step 4: Routes**

Create `apps/web/src/routes/_shell.canvas.index.tsx`:

```tsx
// apps/web/src/routes/_shell.canvas.index.tsx
// Canvas list ('/canvas', inside the AppShell) — the cinema list pattern.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { CanvasLibrary } from 'modules/Canvas'

export const Route = createFileRoute('/_shell/canvas/')({
  beforeLoad: () => requireSession(),
  component: CanvasIndexPage,
})

function CanvasIndexPage() {
  return (
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <CanvasLibrary />
    </main>
  )
}
```

(**Check first**: confirm the exact `requireSession` import in
`routes/cinema.$filmId.tsx` and `_shell.cinema.index.tsx` and copy it verbatim
— if the guard lives elsewhere, mirror what those files do.)

Create `apps/web/src/routes/canvas.$canvasId.tsx`:

```tsx
// apps/web/src/routes/canvas.$canvasId.tsx
// Full-viewport canvas editor — the cinema.$filmId pattern: OUTSIDE _shell
// (flat filename = no AppShell), so this route assembles its own chrome and
// owns the cross-module seams (Canvas may not import Generator; the catalog
// is read HERE and passed down as node data).
import { useEffect } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { BalanceChip } from 'modules/Credits'
import { useCatalog } from 'modules/Generator'
import {
  CanvasEditor,
  retrySave,
  useCanvasAutosave,
  useCanvasDetail,
  useCanvasStore,
  type CanvasModelOption,
} from 'modules/Canvas'
import { ErrorState, Skeleton } from 'shared/ui'

export const Route = createFileRoute('/canvas/$canvasId')({
  beforeLoad: () => requireSession(),
  component: CanvasEditorPage,
})

function CanvasEditorPage() {
  const { canvasId } = Route.useParams()
  const doc = useCanvasDetail(canvasId)
  const catalog = useCatalog()
  const title = useCanvasStore((s) => s.title)
  const saveState = useCanvasStore((s) => s.saveState)
  const setTitle = useCanvasStore((s) => s.setTitle)

  // Per-document lifecycle (wizardStore discipline): load → init; leave → reset.
  useEffect(() => {
    if (doc.data) useCanvasStore.getState().init(doc.data)
    return () => useCanvasStore.getState().reset()
  }, [doc.data])
  useCanvasAutosave()

  // Catalog → the node-data shape (image/video models only)
  const models: CanvasModelOption[] = (catalog.data?.models ?? []).flatMap((m) =>
    m.type === 'image' || m.type === 'video'
      ? [
          {
            id: m.id,
            name: m.name,
            providerLabel: m.providerLabel,
            type: m.type,
            credits:
              m.type === 'image' ? m.credits : (Object.values(m.creditsByDuration)[0] ?? 0),
            aspectRatios: m.aspectRatios,
            ...(m.type === 'video' ? { durationOptions: m.durationOptions } : {}),
          },
        ]
      : [],
  )

  return (
    <div className="flex min-h-svh flex-col bg-void">
      <header className="flex h-11 items-center gap-3 border-b border-white/10 px-4">
        <Link to="/canvas" className="text-xs text-mist-dim hover:text-white">
          ← Canvases
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Canvas title"
          className="min-w-0 flex-1 bg-transparent text-sm text-white focus:outline-none"
        />
        {/* Autosave indicator: quiet when saved, amber + retry when not */}
        {saveState === 'saved' ? (
          <span className="text-[11px] text-mist-dim">saved</span>
        ) : saveState === 'saving' ? (
          <span className="text-[11px] text-mist-dim">saving…</span>
        ) : (
          <button type="button" onClick={retrySave} className="text-[11px] text-glow-amber underline">
            not saved · retry
          </button>
        )}
        <BalanceChip />
      </header>

      {doc.isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Skeleton className="h-64 w-96" />
        </div>
      ) : doc.isError ? (
        <div className="flex flex-1 items-center justify-center">
          <ErrorState message="Could not load this canvas" onRetry={() => void doc.refetch()} />
        </div>
      ) : (
        <CanvasEditor models={models} />
      )}
    </div>
  )
}
```

(**Check first**, same as the list route: `requireSession` import path, the
exact `BalanceChip` export, and `useCatalog`'s data shape — all three are used
this way by `cinema.$filmId.tsx` today; mirror that file if anything differs.)

- [ ] **Step 5: Verify the routes compile and tests still pass**

Run: `cd apps/web && pnpm typecheck && pnpm vitest run src/modules/Canvas`
Expected: zero TS errors; all Canvas tests PASS

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/src/modules/Canvas apps/web/src/routes/_shell.canvas.index.tsx apps/web/src/routes/canvas.\$canvasId.tsx apps/web/src/routeTree.gen.ts
rtk git commit -m "feat(canvas-web): editor shell, palette, library, routes"
```

---

## Task 12: Gate + docs

- [ ] **Step 1: Full verification gate**

```bash
cd packages/contracts && pnpm vitest run
cd ../../apps/api && pnpm vitest run && pnpm run typecheck
cd ../web && pnpm lint && pnpm typecheck && pnpm vitest run && pnpm run build
```
Expected: everything green. Fix regressions before proceeding — the
`frontend-lint.sh` hook has been enforcing per-edit, so surprises here should
be rare.

- [ ] **Step 2: Live check**

Run: `bash .claude/skills/run/assets/run-dev.sh --no-open`, open
`http://localhost:5173/canvas`: create a canvas → drag an Image node → prompt →
Generate (spends 1-2 credits) → wire into a Video node → its Generate submits
with `inputGenerationId` (Network tab) → reload restores the document
(autosave). Delete the image node → the video node keeps its clip.

- [ ] **Step 3: Docs**

- `apps/web/FEATURE.md`: add a "## Canvas (`/canvas`)" section (route, aggregate-
  cites-generations, autosave semantics, phase 3-4 pointers).
- `docs/wiki/log.md`: dated entry — what shipped, test counts, the
  image-models-have-no-inputImage discovery and where the chain resolves
  (referenceImages vs seed frame).
- Fill every new file's `.md` sidecar; stamp commit hashes.

- [ ] **Step 4: Commit docs**

```bash
rtk git add apps/web/FEATURE.md docs/wiki/log.md
rtk git commit -m "docs(canvas): feature docs + wiki log for phases 1-2"
```

---

## Appendix: Phase 3-4 design notes (for the follow-up plans)

Captured now so the discoveries aren't lost:

- **Phase 3 (character + run branch):** `EntityNode` supplies `entityId` via
  its wire; `buildRunInput` adds `entityRefs: [{ placeholder, entityId }]` +
  prompt placeholder handling (see how ShotCastField composes `[[eN]]`).
  `useRunBranch`: toposort ancestors of the clicked node (the edges are
  guaranteed acyclic by edgeRules), skip nodes whose latest generation
  succeeded, run sequentially, stop on first failure; `RunBranchDialog`
  itemizes credits via the same catalog data the nodes hold.
- **Phase 4 (operations):** Runware client has NO imageUpscale /
  imageBackgroundRemoval today — add two sync task methods next to
  `imageInference` (the `post`/`firstOrThrow` plumbing is reusable as-is;
  both tasks answer `imageURL`, so even `getResponse` would work unchanged).
  **Do NOT fake an image-model `air`** for pseudo-models: image entries carry
  no `provider` field and service.ts:466 hardcodes image→runware, while
  `model.air` travels verbatim to Runware. Cleaner: a capability field on the
  image variant (e.g. `operation: 'upscale' | 'remove-bg'`) that the image
  branch in service.create() dispatches on BEFORE the imageInference call.
  Pricing precedent: Runware upscale/bg-removal are cheap — price at 1-2
  credits with the usual ~2× margin, document the wholesale number in the
  catalog comment.
