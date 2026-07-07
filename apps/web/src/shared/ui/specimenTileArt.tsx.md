# specimenTileArt.tsx — AI component doc

> AI-facing sidecar for `specimenTileArt.tsx`. Created 2026-07-07 (Stage 2 —
> replaces `showcasePosterArt.ts`). Keep this in sync with the code on every change.

## Purpose
Art direction data for `SpecimenTile`: eight blue-violet DUOTONE research-lab
"specimen" drawings on a 200×200 plate — the v3 showcase art that replaces the
v2 editorial poster set. Flat fills, hairline strokes and SVG `<pattern>`
textures ONLY: no gradients (hard owner rule), no filters, no text.

## What it does (for an AI reader)
- Responsibilities: define the specimen catalog (`eye`, `brain`, `hand`,
  `arch`, `moon`, `koi`, `cell`, `orbit` — the reference symbolism plus three
  same-language plates to fill the 4×2 grid) and one pure drawing function per
  kind. Mid-tones come from ink at opacity — never a third color, never a
  gradient.
- Public API / exports: `SPECIMEN_KINDS`, `SpecimenKind`, `SPECIMEN_GROUND`
  (`#161233`), `SPECIMEN_INK` (`#8fa3f2`), `SpecimenPatternUrls`
  (`{ dots, hatch, scan }` — per-instance `url(#…)` strings),
  `SPECIMEN_GLYPHS: Record<SpecimenKind, (p) => ReactElement>`.
- Inputs → Outputs: pattern fill urls (unique per `SpecimenTile` instance via
  `useId`) → an SVG `<g>` drawing for the given specimen.
- Side effects: none — pure data + pure render functions.
- The two hex values are ART CONTENT (like a photo's pixels), not UI chrome:
  the documented exception to the tokens-only rule (design.md §5), inherited
  from the retired `showcasePosterArt.ts`.

## Dependencies
- Imports / depends on: `react` types only (`ReactElement`).
- Used by: `SpecimenTile.tsx` (the only consumer — it owns the `<svg>` shell,
  the ground plate and the pattern defs the glyphs reference).

## Diagram
```mermaid
flowchart LR
  Tile[SpecimenTile.tsx] -- pattern urls (useId) --> Glyph[SPECIMEN_GLYPHS(kind)]
  Glyph -- g element: flat INK/GROUND fills + patterns --> SVG[200×200 specimen plate]
  Spread[ShowcaseSpread.tsx] -- kind per grid cell --> Tile
```

## Key decisions / gotchas
- **Duotone discipline**: exactly two hexes; every intermediate tone is
  `SPECIMEN_INK` at opacity. Tests assert the rendered markup contains no
  `gradient` substring and no `filter`/`feTurbulence` elements.
- **Video marking is NOT here**: the landing marks the `moon` tile with the
  localized `landing.showcase.videoMarker` chip — art stays caption-free.
- **Distinctness is contract**: each glyph has unique geometry; the
  SpecimenTile test fingerprints geometry attributes across all 8 kinds.
- Pattern ids arrive as props so multiple tiles never collide on defs ids.

## Commits
- (pending) restyle(web): terminal landing with ascii-sphere hero + pricing
