# VideoNode.tsx — AI component doc

> AI-facing sidecar for `VideoNode.tsx`. Created 2026-07-29. Keep this in sync with the code on every change.

## Purpose
The video node — a nine-line wrapper that renders `GenerationNode` with `kind='video'`. Everything else (preview states, prompt, model/aspect/duration pickers, submit) is the shared body in `ImageNode.tsx`; only the differences are declared here.

## What it does (for an AI reader)
- Responsibilities: bind the shared generation body to the video kind.
- Public API / exports / props / endpoints: `VideoNode({ id, data: GenerationNodeData })` — registered as React Flow node type `video`.
- Inputs → Outputs: node id + `{ models }` → the shared composer, filtered to video models.
- Side effects (I/O, network, state): none of its own (the shared body owns them).

## Dependencies
- Imports / depends on: `GenerationNode`, `GenerationNodeData` from `./ImageNode`.
- Used by: `CanvasEditor`'s `nodeTypes` map.

## Diagram
```mermaid
flowchart LR
  RF["React Flow node type 'video'"] --> VN[VideoNode]
  VN -->|kind='video'| GN[GenerationNode in ImageNode.tsx]
  GN --> UI[duration picker · per-duration price · no output handle]
```

## Key decisions / gotchas
- Video is TERMINAL in the MVP: `GenerationNode` gives it no output handle, because both i2i and i2v need a still. Chaining clip→clip is out of scope until a later phase decides what that would even mean.
- The node's media wire makes its run an i2v: `buildRunInput` sends the parent's latest generation as `inputGenerationId`, and the SERVER turns that into the provider's seed frame.
- Pricing differs from image nodes: the shared body prices the model at the SELECTED duration (`creditsByDuration`), so the card shows what will be billed.

## Commits
- f7268e3 2026-07-30 feat(canvas-web): node components — image/video/upload/note, version strip
