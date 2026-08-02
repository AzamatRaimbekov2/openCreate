# mentionQuery.ts — AI component doc

> AI-facing sidecar for `shared/libs/mentionQuery.ts`. Created 2026-07-23; moved out of `modules/Generator/model` 2026-07-24. Keep this in sync with the code on every change.

## Purpose
Pure caret math for a composer's INLINE `@` mention picker: from the prompt text + caret offset, decide whether the caret is inside an `@query` run, and how to splice the chosen token in. Side-effect-free so the trigger rules are unit-testable without DOM/store.

## What it does (for an AI reader)
- Responsibilities: detect the active `@query` at the caret (boundary + no-inner-whitespace rules); splice a `[[eN]]` token in its place.
- Public API / exports:
  - `type ActiveMention = { start: number; query: string }`.
  - `findActiveMention(text, caret) => ActiveMention | null`.
  - `applyMention(text, active, caret, token) => { text, caret }`.
- Inputs → Outputs: `(text, caret)` → the active mention or null; `(text, active, caret, token)` → new text + new caret.
- Side effects: none (pure).

## Dependencies
- Imports / depends on: nothing.
- Used by: `modules/Generator/components/ChatComposer.tsx` and `modules/Cinema/components/ShotInspector.tsx` (each wires these to its textarea value + `selectionStart`).

## Diagram
```mermaid
flowchart LR
  T[text + caret] --> F[findActiveMention] --> Q{@query?}
  Q -- yes --> P[open picker, filter by query]
  P -- select item --> A[applyMention → new text + caret]
```

## Key decisions / gotchas
- MOVED to shared/libs (2026-07-24), same reason as `mentions.ts`: both the /create composer and the Cinema shot composer speak the `@` protocol, and modules may not import each other.
- `@` must open the run (text start or right after whitespace) → an email's `user@host` never triggers.
- Any whitespace between `@` and the caret closes the mention (`@bob and|` → null).
- Uses the caret, NOT end-of-text, so mid-string editing works.
- `applyMention` adds one trailing space but never doubles it when text already follows.

## Commits
- _no commit yet_
