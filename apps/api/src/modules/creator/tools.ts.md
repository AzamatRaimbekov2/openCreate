# tools.ts — openCreator's hands (and the budget gate)

> AI-facing sidecar for `tools.ts`. Created 2026-07-30. Keep this in sync with the code on every change.

## Purpose

The agent's tool registry (ADR `docs/wiki/decisions/opencreator-agent.md` D1/D2):
thin wrappers over the services the product already has — entities, canvas,
generations, catalog — called **in-process with the caller's `userId`**. Not HTTP
self-calls, not `packages/mcp` (that stays the external interface for Claude
Code). Every ownership rule, capability check, price and refund path therefore
stays where it already lives, and this feature adds **zero money code**.

**This file is also where the budget gate is enforced.**

## What it does (for an AI reader)

- Responsibilities: declare each tool's JSON Schema (what the model sees) + its
  zod schema (what we trust), map neutral tool input onto a service call, and turn
  every outcome — success or failure — into a compact JSON string for the model.
- Public API:
  - `ToolContext` — `{ userId, isConfirmed(), log }`.
  - `ToolExecutor` — `(ctx, input) => Promise<string>` (JSON string).
  - `CreatorTool` — `{ spec: BrainToolSpec; execute: ToolExecutor }`.
  - `buildCreatorTools({ entities, canvas, generations, configuredProviders })` →
    `CreatorTool[]`.
- The phase-1 tool set (7):
  | tool | calls | answers |
  | --- | --- | --- |
  | `list_models` | `CATALOG` (filtered) | `{ models: [{ id, name, type, credits\|creditsByDuration, aspectRatios, referenceMode?, supportsImageInput? }] }` |
  | `create_entity` | `entities.create` (kind fixed to `character`) | `{ entityId }` |
  | `attach_entity_portrait` | `entities.addImage` (`source:'generated'`, `view:'front'`) | `{ entityId, primaryImageId }` |
  | `create_canvas` | `canvas.createCanvas` | `{ canvasId }` |
  | `add_canvas_nodes` | `canvas.getCanvas` + `canvas.updateCanvas` | `{ canvasId, nodes: [{ ref, nodeId }] }` |
  | `start_generation` | **gate** → `generations.create` (+ optional node link) | `{ generationId, status, costCredits }` |
  | `check_generation` | `generations.get` | `{ status, mediaUrl?, errorMessage? }` |
- Inputs → Outputs: `(ToolContext, unknown)` → a JSON string. Never a thrown error.
- Side effects: whatever the wrapped service does — DB writes, provider calls,
  and (only through `start_generation`) a credit charge on the ordinary money path.

## Dependencies

- Imports: `node:crypto` (node id minting), `zod`, `@opencreate/contracts`
  (`canvasNodeSchema` / `canvasEdgeSchema` — one definition of a canvas node),
  `../catalog/catalog` (`CATALOG`), and the three service types (narrowed).
- Used by: `apps/api/src/modules/creator/service.ts` (the loop executes these),
  `apps/api/src/app.ts` (builds the registry from the EXISTING service instances).

## Diagram

```mermaid
flowchart TD
  LOOP["creator/service.ts loop"] -- "tool call (name + input)" --> EX[executor: zod parse]
  EX -- "invalid" --> DATA["{\"error\":\"invalid input: …\"}"]
  EX --> SG{start_generation?}
  SG -- "yes" --> GATE{"ctx.isConfirmed()?"}
  GATE -- "false" --> REFUSE["{\"error\":\"budget_not_confirmed …\"}<br/>NO service call, NO charge"]
  GATE -- "true" --> GEN["generations.create<br/>(charge-at-submit, refund path untouched)"]
  GEN -. "best effort" .-> CNV["canvas.updateCanvas<br/>append generationId to node history"]
  SG -- "no" --> FREE["entities.create / addImage<br/>canvas.createCanvas / updateCanvas<br/>generations.get / CATALOG read"]
  GEN --> DATA2["JSON result string"]
  FREE --> DATA2
  GEN -- "throws" --> SAN["toolError(): domain message,<br/>else 'tool failed'"]
  FREE -- "throws" --> SAN
```

## Key decisions / gotchas

- **THE BUDGET GATE (ADR D2) lives in `start_generation`, before the service
  call.** While `ctx.isConfirmed()` is false the tool returns
  `{"error":"budget_not_confirmed — …"}` and touches nothing. A prompt can be
  argued with; this cannot. Pinned by the first test in `creator-tools.test.ts`
  (no service call) and again at the HTTP level in `creator.test.ts` (no runware
  call, balance unchanged).
- **`isConfirmed` is a CALLBACK, not a boolean.** A turn executes several tools
  and the flag can flip under it (the user confirms mid-turn) or be revoked (the
  agent proposes a new plan → `confirmed` back to 0). A captured boolean would let
  a stale `true` spend after a re-plan.
- **An executor NEVER throws.** Bad input, a missing entity, no credits, an
  exploding service — all come back as `{"error": …}` so the model can react
  ("that model can't do 9:16 — trying another"). A throw would kill the whole
  agent turn and leave the user with a dead chat.
- **Two-tier error sanitization.** A message is passed through when the error
  carries an `apiCode` (written for clients: "Not enough credits") or is one of
  our named domain errors; anything else becomes `'tool failed'`. This channel
  reaches the model AND then the user's step card, so an unexpected error's text
  (paths, connection strings, provider bodies) must not travel — the same rule
  `app.ts` applies to 5xx.
- **Node ids are minted HERE, and the edges are rewired onto them.**
  `canvas_node.id` is a GLOBAL primary key (the I1 fix-wave lesson), and an LLM
  will emit `n1` for every canvas it ever builds — accepting its ids verbatim
  would eventually raise a cross-canvas UNIQUE violation, i.e. an unmapped SQLite
  500 inside the loop. The answer maps the model's own labels back to the real
  ids (`{ ref, nodeId }`) so the next step can target the right node. An edge
  endpoint that is not in the map is treated as an existing node and passes
  through.
- **`add_canvas_nodes` APPENDS.** The canvas PATCH is a full-document replace, so
  the stored nodes/edges are re-sent alongside the new ones; forgetting that would
  make the agent's first add wipe the user's board.
- **`entityId` → `entityRefs` + `[[e1]]` is our job, not the model's.** The tool
  prepends the placeholder only when the prompt does not already contain it —
  the same rule the canvas run path (`useNodeGeneration` buildRunInput) applies.
- **The canvas link on `start_generation` is BEST EFFORT, after the charge.** The
  money has already moved; a failed board write must not be reported as a failed
  generation, or the model retries and the user pays twice. It logs
  `creator.canvas_link_failed` and still returns the `generationId`.
- **`list_models` hides models whose backend is unconfigured** (the catalog
  route's rule, reusing `configuredProviders`). A model whose backend is off is
  worse than a missing one: the agent would plan it, charge for it, and collect a
  refunded failure. It also projects a COMPACT shape — the model pays for every
  token it reads — and omits audio/3D, which this phase has no tool to start.
- **Services are narrowed with `Pick`** (`create`/`addImage`,
  `createCanvas`/`getCanvas`/`updateCanvas`, `create`/`get`). Least privilege
  stated in the type: the agent structurally cannot delete a canvas, remove an
  entity, or reach the refund path. This is a deliberate deviation from the plan's
  full-service types.
- **`write_scenario` is deliberately absent.** The brain writes scenes in its own
  head inside the turn; a tool for it would be a second LLM call for text the same
  model already produces (plan self-review). A test asserts it stays absent.
- **`kind` is fixed to `character` in `create_entity`,** and the portrait always
  lands as the `front` view — the view that becomes the entity's primary image and
  therefore makes `[[e1]]` resolve to a reference the provider can condition on.

## Commits

- (pending) feat(creator): agent tools over existing services — budget gate structural
