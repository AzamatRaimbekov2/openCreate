# PromptNode.tsx — AI component doc

> AI-facing sidecar for `PromptNode.tsx`. Created 2026-08-02. Keep this in sync with the code on every change.

## Purpose

The board's SHARED PROMPT card (ADR `canvas-prompt-node`): one text, wired into several
image/video nodes, which each prepend it to their own line. It exists because a canvas
had no way to say the same thing twice — five variants of one subject meant pasting the
shared half into five textareas, and editing five textareas when it changed.

## What it does (for an AI reader)

- Responsibilities: render + edit `config.prompt` of a `kind: 'prompt'` node, and say how
  far that text reaches. Nothing else — it never runs, never prices, never fetches.
- Public API / exports / props: `PromptNode({ id }: { id: string })`. React Flow passes
  only the id; the row is read from the canvas store. It takes NO `data` (unlike
  ImageNode/EntityNode it needs neither the catalog nor the character list).
- Inputs → Outputs: keystrokes → `updateNodeConfig(id, { prompt })` on the store (the
  document), which autosave PATCHes and `composeNodePrompt` reads for every wired child.
- Side effects: the store write above, and the `EnhanceButton`'s own
  `POST /api/prompt/enhance` (the shared kit component owns that call).

## Dependencies

- Imports: `react-i18next`, `shared/ui` (`EnhanceButton`), `../model/canvasStore`,
  sibling `NodeShell`.
- Used by: `CanvasEditor`'s module-scope `nodeTypes` map (`prompt: PromptNode`).
  Reached from `NodePalette` (glyph `¶`, drag or click).

## Diagram

```mermaid
flowchart LR
  U[user types] --> PN[PromptNode]
  PN -->|updateNodeConfig prompt| ST[(canvasStore document)]
  ST --> AS[useCanvasDoc autosave → PATCH]
  ST --> CP[composeNodePrompt<br/>template ⏎ own]
  CP --> BRI[buildRunInput → POST /api/generations]
  CP --> BLK[blockerFor → branch plan]
  ST -->|edges from this id| FEEDS[the "feeds N nodes" caption]
```

## Key decisions / gotchas

- **Furniture, like the character card.** No input port, an output port, no model, no
  price, no Generate; `RUNNABLE_KINDS` never lists `prompt`, so a branch plan can never
  show it as a priced row. It wears `NodeShell` at a permanent `idle` for the reason
  `EntityNode` does — the board should have ONE language for "a card that feeds a
  producer", not two (the status word is noise here, and consistency beats that).
- **The sparkle is mandatory** (owner law 2026-07-30) and pays off most here: one improved
  template lifts every wired child at once. Its absolute placement rides a WRAPPER, never
  `EnhanceButton`'s own `className` — that class lands on its internal `relative` box,
  which is the anchor its error/nudge chip hangs from (the ShotInspector precedent).
- **`nodrag` on the field and the sparkle wrapper**: React Flow's hit test walks
  ancestors, so without it a pointer-down in the textarea pans the board.
- **The "feeds N nodes" caption is a narrow selector** (a number, not the edge array), so
  wiring an unrelated pair of nodes does not re-render this card. With zero wires it says
  what to DO instead of printing "feeds 0 nodes" — a number pretending to be information,
  and the empty state of a card whose whole job is reach must name the next action.
- It reuses `config.prompt` rather than adding a field, so a template's text and an image
  node's prompt share one bound (2000) and one migration story (none).

## Commits

- _no commit yet_
