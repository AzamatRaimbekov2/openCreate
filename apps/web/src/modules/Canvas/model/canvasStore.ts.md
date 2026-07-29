# canvasStore.ts — AI component doc

> AI-facing sidecar for `canvasStore.ts`. Created 2026-07-29. Keep this in sync with the code on every change.

## Purpose
The editing truth for ONE open canvas: the working document (title, viewport, nodes, edges) plus a save status. Server truth lives in TanStack Query; this store holds exactly what the server has no opinion about between saves. Every node component reads its own row from here by id, and every mutating action flips `saveState` to `'dirty'`, which is the single signal the autosave loop watches.

## What it does (for an AI reader)
- Responsibilities: hold the document, expose typed edit actions, and track save status.
- Public API / exports / props / endpoints: `useCanvasStore`, `SaveState`. Actions: `init(doc)`, `reset()`, `setTitle`, `setViewport`, `addNode(kind, position)`, `moveNode`, `updateNodeConfig`, `setUploadUrl`, `appendGeneration`, `removeNode`, `addEdge(source, target)`, `removeEdge`, `markSaving`, `markSaved`, `markSaveError`.
- Inputs → Outputs: a loaded `CanvasDetail` in via `init`; a mutable `{title, viewport, nodes, edges}` document out, consumed by the editor for render and by `useCanvasDoc` as the PATCH body.
- Side effects (I/O, network, state): in-memory state only — no network, no persistence. Ids are minted with `crypto.randomUUID()`.

## Dependencies
- Imports / depends on: `zustand`, contract types from `@opencreate/contracts`.
- Used by: `useCanvasDoc.ts` (reads the doc, flips save flags), `useNodeGeneration.ts` (`appendGeneration` on submit), every node component (`ImageNode`/`VideoNode`/`UploadNode`/`NoteNode`), `CanvasEditor.tsx` (derives React Flow objects, writes back changes), `routes/canvas.$canvasId.tsx` (init/reset lifecycle + title/saveState in the header).

## Diagram
```mermaid
flowchart TD
  Q["useCanvasDetail (query)"] -->|init doc| S[canvasStore]
  S -->|nodes / edges| E[CanvasEditor derives RF objects]
  E -->|moveNode / addEdge / removeNode| S
  N[node components] -->|updateNodeConfig / appendGeneration| S
  S -->|saveState = dirty| AU[useCanvasAutosave]
  AU -->|PATCH full doc| API[(/api/canvases/:id)]
  AU -->|markSaved / markSaveError| S
  RT["route unmount"] -->|reset| S
```

## Key decisions / gotchas
- SINGLETON + `init()`/`reset()`, not a store factory — the `wizardStore` precedent. The route resets on unmount so one canvas's nodes can never leak into the next; the store is a module singleton, the route param is not.
- `removeNode` drops the node and its EDGES, never its children's `generationIds`: a downstream node cites generation ids directly, so deleting the parent must not erase the clip the user already paid for.
- `generationIds` is append-only (`appendGeneration`) — that list IS the version history the `VersionStrip` steps through; overwriting it would silently discard paid runs.
- **I3 fix-wave correction.** `markSaved` guards on `'saving'` ONLY (it originally also matched `'dirty'`, which was the bug). A mutator always sets `'dirty'` unconditionally, so an edit landing WHILE a PATCH is in flight flips `'saving'` → `'dirty'`; the in-flight PATCH's own `markSaved()` call must leave that alone — matching `'dirty'` too let it stomp the edit straight to `'saved'` even though it was never sent, and the autosave subscriber (armed only on the transition INTO dirty) never re-fired for it.
- **I1 fix-wave correction.** Node/edge ids are the FULL `crypto.randomUUID()` (36 chars), not an 8-char slice. `canvas_node.id`/`canvas_edge.id` are GLOBAL primary keys server-side (every canvas's rows share one table) — an 8-char slice only needs to look unique WITHIN the canvas that mints it, but a cross-canvas collision surfaces as an unmapped SQLite UNIQUE-constraint error (500) for an innocent user. 36 chars still fits the contract's cap (`z.string().min(1).max(40)`) with room to spare.
- `INITIAL` is spread on `reset()` so the nodes/edges arrays are fresh objects; sharing the array identity across resets would let a stale render mutate the next document.

## Commits
- 3da7615 2026-07-30 feat(canvas-web): api layer + per-document editor store
- (fix-wave) fix(canvas): I1 — mint full crypto.randomUUID ids (global PK, not canvas-scoped); I3 — markSaved guards on 'saving' only
