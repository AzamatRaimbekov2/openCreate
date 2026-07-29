# Canvas Mode — node-graph generation canvas (design)

**Date:** 2026-07-29 · **Status:** approved in brainstorm (owner), pending spec review
**Owner decision trail:** paradigm = node graph with wires (Flora-style, NOT ComfyUI-atomic);
nodes = self-contained task blocks; execution = per-node + "run branch"; MVP node set =
image, video, upload, character (Soul), upscale, remove-bg, note. Engine = `@xyflow/react`.

## 1. What it is

A new guarded SPA area `/canvas` where the user composes **chains of generations** on an
infinite canvas: prompt→image, image→remix, image→video, image→upscale/remove-bg, with a
Soul character wired in for cross-chain face/style consistency. Each node is a
mini-composer (prompt, model chip, aspect/duration, cost, Generate). Wires carry media
(and entity refs) from a node's output to a child's input. The canvas is a first-class
saved document per account, like a film.

Competitive reference: Freepik Spaces / Flora / Krea — but riding openCreate's existing
generation lifecycle, credit ledger, and design system unchanged.

## 2. Core principle

**The canvas CITES generations; it never owns money or media.** Running a node is an
ordinary `POST /api/generations`; the node stores the returned id (append-only history).
Charge-at-submit, refund-on-fail, polling, Library ingestion — all untouched. This is the
same aggregate discipline as films (shots cite generations) and Assets3D.

## 3. UI (approved mockup: `.superpowers/brainstorm/*/content/canvas-ui-layout.html`)

- **Top bar** — back to canvas list, inline-editable title, autosave indicator
  ("saved 12s ago" / amber "not saved" with retry), credit balance, export menu.
- **Left palette** — 7 node types (Image ▣, Video ▶, Upload ⇧, Character ☺, Upscale 4K,
  Remove BG ✂, Note ✎); drag onto canvas, or double-click canvas for a quick-add menu.
- **Canvas** — React Flow: dot-grid void background, pan/zoom, marquee selection,
  minimap (bottom-right), zoom controls (bottom-left). Bioluminescent Terminal styling.
- **Node block** — header (kind + status dot), media preview (with version strip
  "⟳ v3 · history" — regeneration appends, never overwrites), prompt textarea
  (with the AI-enhance sparkle from the composer), chips (model / aspect / duration /
  glow-green cost), Generate pill, "Run branch" outline pill.
  Status = border color: idle steel → processing amber (+progress) → succeeded green
  → failed red (localized reason + "credits refunded" chip + retry).
- **Ports & wires** — output right, input left; wire color = payload type
  (green media, pink entity, blue operation). Invalid connections refuse to attach;
  cycle-creating connections are rejected during drag.
- **Character node** — compact card: avatar, name, "from Soul"; output only.
- **Note node** — sticky, no ports, free text.

## 4. Node semantics

| Node | Inputs | Output | Runs as |
|---|---|---|---|
| Image | ≤1 media + ≤1 character | image | `POST /api/generations` type=image (input edge → i2i via `inputGenerationId`; character → `entityRefs`) |
| Video | ≤1 media + ≤1 character | video | type=video (media input → i2v) |
| Upload | — | image | client upload; node stores the media URL (no generation, no charge) |
| Character | — | entity ref | no run; supplies `entityId` to consumers |
| Upscale | exactly 1 media | image | type=image with pseudo-model `upscale-4x` |
| Remove BG | exactly 1 media | image | type=image with pseudo-model `remove-bg` |
| Note | — | — | never runs |

**Execution:**
- Per-node Generate = one paid generation; poll via the shared `['generation', id]`
  cache every 4s, processing-only, 20-min budget with amber "taking longer" + Refresh
  (Generator rules).
- **Run branch** (on any node): client topo-sorts ancestors, shows a confirm dialog
  with the itemized total ("3 nodes → $0.37"), runs sequentially top-down, skipping
  nodes that already have a succeeded output. Mid-branch failure stops the run:
  the failed node shows the error, downstream nodes never start.
- Insufficient credits → existing `insufficient_credits` error; dialog shows shortfall.

## 5. Data model & API

```
canvas       { id, ownerId, title, viewport {x,y,zoom}, createdAt, updatedAt }
canvas_node  { id, canvasId, kind, position {x,y}, config JSON, generationIds JSON, uploadUrl? }
canvas_edge  { id, canvasId, sourceNodeId, targetNodeId }
```

- `config` per kind: prompt, modelId, aspectRatio, duration (video), entityId
  (character), text (note).
- `generationIds` — append-only history; latest succeeded = the node's output.
- Contracts in `packages/contracts/src/canvas.ts` (zod, mirrored DTO style of film.ts).
- Endpoints: `POST/GET /api/canvases`, `GET/PATCH/DELETE /api/canvases/:id`.
  PATCH carries the full node/edge document (debounced ~1.5s autosave,
  last-write-wins — single-owner docs). Ownership enforced like films.
- Deleting a parent node removes its edges; children keep their generations
  (they cite generation ids, not the parent).

**One generation-contract change:** optional `inputGenerationId` on
`createGenerationInput`, mutually exclusive with `inputImage`. Server verifies the
generation belongs to the caller and succeeded with image output, then resolves its own
stored media as the provider reference. Kills the client-side base64 roundtrip; no SSRF
surface (own storage only).

**Catalog change:** two pseudo-models `upscale-4x`, `remove-bg` (type image, mode image,
fixed low prices) mapped in the Runware provider to `imageUpscale` / `removeBackground`
task types. Zero new contract fields; ledger prices them like any model.

## 6. Frontend structure

```
apps/web/src/modules/Canvas/
  components/  CanvasEditor, NodePalette, ImageNode, VideoNode, UploadNode,
               EntityNode, OperationNode, NoteNode, RunBranchDialog, VersionStrip
  model/       useCanvasDoc (load + debounced autosave), useRunBranch (toposort + queue),
               edgeRules (port/cycle validation), canvasStore (Zustand: selection, viewport)
  index.ts
routes/  _shell.canvas.index.tsx (canvas list, film-list pattern)
         canvas.$canvasId.tsx (editor, full-viewport like cinema.$filmId)
```

Nodes embed the existing `ModelSelect`, `PromptField`, `CostLabel`, enhance affordance.
New dependency: `@xyflow/react` (~45KB gz, MIT). Rejected alternatives: hand-rolled
pan/zoom+SVG (months of edge cases: hit-testing, marquee, culling, gestures);
Konva/Pixi (canvas-rendered nodes can't embed our DOM composer components).

## 7. Error handling

- 4 UI states for the editor route: canvas skeleton · empty canvas with "drag your
  first node" hint · load error + retry · data.
- Node failure: red border, localized `errorCode` mapping (reuses generation error
  UX), refund chip, retry.
- Autosave failure: amber "not saved" + retry with backoff; local state preserved.
- Cycles and illegal port combinations rejected at interaction time.

## 8. Testing

Contract tests (canvas schemas, inputGenerationId validation) · unit: `edgeRules`
(every illegal connection + cycles), `useRunBranch` toposort/skip/stop-on-fail ·
component: each node's 4 states, version strip · API: CRUD + ownership + pseudo-model
pricing · e2e (Playwright, mocked provider): create canvas → image node → generate →
wire into video → run branch.

## 9. Build phases

1. Backend: canvas contracts + CRUD + `inputGenerationId`.
2. Frontend editor: image/video/upload/note nodes, wires, autosave — usable product.
3. Character node + run-branch.
4. Upscale/remove-bg pseudo-models + operation nodes.

Out of scope (explicitly): multiplayer/realtime collaboration, auto-cascade re-runs,
node templates/marketplace, canvas export as video (CinemaStudio's job).
