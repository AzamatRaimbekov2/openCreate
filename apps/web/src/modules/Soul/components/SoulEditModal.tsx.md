# SoulEditModal.tsx — AI component doc

> AI-facing sidecar for `SoulEditModal.tsx`. Created 2026-07-12. Keep this in sync with the code on every change.

## Purpose

Reopen a built character in the constructor and save the new spec. Free — editing
generates nothing, and the portraits already minted stay exactly as they are (a
re-roll is a separate, priced act on the sheet).

## What it does (for an AI reader)

- Responsibilities: seed a draft from the entity, render `SoulConstructor` inside a
  `Modal`, PATCH `{ name, soul }`, close on success.
- Public API / props: `{ entity: Entity, isOpen: boolean, onClose: () => void }`.
- Inputs → Outputs: an entity → an edited `Soul` → `PATCH /api/entities/:id`.
- Side effects: `useUpdateSoul` (seeds `['entity', id]`, invalidates `['entities']`).

## Dependencies

- Imports: `react`, `react-i18next`, `@opencreate/contracts` (type `Entity`),
  `shared/libs/apiClient`, `shared/libs/errorCopy`, `shared/ui` (`Modal`),
  `../model/soulApi`, `../model/soulDraft`, sibling `SoulConstructor`.
- Used by: `SoulCard` (mounted only while open).

## Diagram

```mermaid
flowchart LR
  E[Entity] --> DFE[draftFromEntity]
  DFE --> C[SoulConstructor inside a Modal]
  C -->|save| U["useUpdateSoul → PATCH { name, soul }"]
  U -->|server re-derives description| SEED["cache ['entity', id] = the row it wrote"]
  U -->|success| CLOSE[onClose]
```

## Key decisions / gotchas

- No description field, ever: `soul != null ⟹ description is DERIVED` (entity.ts).
  There is nothing right the client could send.
- The CARD mounts this only while open, so each reopen starts from the SAVED soul —
  no effect is needed to reset the draft, and an abandoned edit cannot leak.

## Commits

- _no commit yet_

## Update 2026-07-31 — modal scroller (design.md §6 Modal law)
- `<SoulConstructor>` is now wrapped in `flex min-h-0 flex-1 flex-col overflow-y-auto pr-1`.
  This is the tallest body any modal hands to the kit Modal (name + two required axes +
  eight optional selects + trait chips + notes + preview), and the panel is a
  `max-h-[92dvh]` flex column whose children default to `min-height:auto` — so it painted
  past the bottom and the wheel scrolled the page behind the overlay.
- **The Save button scrolls WITH the content here**, unlike StyleEditor's pinned footer:
  the submit lives INSIDE `SoulConstructor`, and pulling it out would mean restructuring
  that component rather than wrapping this body — beyond the surgical scope of this
  sweep. This is the Templates canon shape and it fully fixes reachability (one scroll
  brings Save into view). Pinning is the upgrade if `SoulConstructor` is ever split.
