# presets.ts — AI component doc

> AI-facing sidecar for `presets.ts`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose
CinemaStudio prompt-preset tables (style / camera shot / camera motion / quality) plus the pure
`applyPromptPreset` function that composes them into a positive+negative prompt. Lives in contracts
so the web renders pickers and the API composes prompts from the SAME source — a preset is a named
choice (structure), never free text (prose). ADR: `docs/wiki/decisions/cinema-studio.md` §3.

## What it does (for an AI reader)
- Responsibilities: hold the canonical preset tables; turn a structured `PromptPreset` + the user's
  text into the model-facing `{ positivePrompt, negativePrompt }`.
- Public API / exports:
  - Schemas: **`builtinStyleIdSchema`** (the 7-value enum), **`styleIdSchema`** (open `z.string().min(1).max(60)`),
    `framingSchema`, `cameraShotSchema`, `cameraMotionSchema`, `qualitySchema`, `promptPresetSchema`.
  - Types: **`BuiltinStyleId`**, `StyleId` (= `string`), **`StyleFragments`**, `Framing`, `CameraShot`,
    `CameraMotion`, `Quality`, `StylePreset`, `PresetOption`, `NegatingPresetOption`, `PromptPreset`,
    `ComposedPrompt`.
  - Tables: `STYLE_PRESETS` (7: disney/anime/2d-cartoon/3d-cartoon/**hand-drawn**/**comic**/cinematic;
    each has `fragment`, `negative`, `recommendedModelId`), `FRAMING_PRESETS` (none/**reference-sheet**),
    `CAMERA_SHOTS`, `CAMERA_MOTIONS`, `QUALITY_PRESETS`.
  - Functions: `applyPromptPreset(userPrompt, preset?, style?) → { positivePrompt, negativePrompt }`,
    **`resolveBuiltinStyle(id: string) → StylePreset | null`**.
- Inputs → Outputs: `(userPrompt, preset?, style?: StyleFragments)` → composed prompts. Order is fixed:
  style, framing, shot, motion, quality, then user text LAST. Empty fragments contribute nothing (no
  dangling commas). Negatives are **collected and joined** across every axis that carries one
  (style, framing).
- Side effects: none. Pure data + pure function.

## Dependencies
- Imports / depends on: `zod`.
- Used by (planned): `packages/contracts/src/index.ts` (re-export); the API generation service
  (composes server-side, AFTER entity substitution in `modules/entities/mentions.ts`); the web
  Cinema module's shot composer (renders pickers from the tables). Name `applyPromptPreset` is
  deliberately distinct from `mentions.composePrompt` — they compose in sequence, not compete.

## Diagram
```mermaid
flowchart LR
  U[user prompt text] --> AP[applyPromptPreset]
  P[PromptPreset ids] --> AP
  ST["STYLE_PRESETS<br/>(fragment + negative)"] --> RB["resolveBuiltinStyle(id)"]
  RB --> REG["style registry<br/>(server: builtin OR own row)"]
  REG -->|"StyleFragments param"| AP
  FR["FRAMING_PRESETS<br/>(fragment + negative)"] --> AP
  CS[CAMERA_SHOTS] --> AP
  CM[CAMERA_MOTIONS] --> AP
  Q[QUALITY_PRESETS] --> AP
  AP --> OUT["{ positivePrompt, negativePrompt }"]
  SOUL["soul.ts<br/>soulPromptPreset()"] -.->|"{ styleId, framing:'reference-sheet' }"| P
```

## Key decisions / gotchas
- **THE STYLE AXIS HAS TWO IDS** (ADR style-studio D1, 2026-07-31). `builtinStyleIdSchema` is the old
  enum, unchanged and still the key type of `STYLE_PRESETS`; `styleIdSchema` KEPT ITS NAME but is now
  an open string, because users build their own styles and the server resolves the id at use time (the
  way `modelId` resolves against the catalog) instead of the wire pinning what exists. Widening only —
  every builtin id still parses, so no stored row and no client build became invalid. Choosing between
  them is a real decision: **wire/user-chosen surfaces** (`promptPreset.styleId`, `film.defaultStyleId`,
  storyboard input) take the open id; **fixed internal catalogs** (`STYLE_PRESETS`, the server-side
  template catalog, a soul's style axis) take `BuiltinStyleId` because they are authored in code
  against these seven and index the table directly.
- **`applyPromptPreset` no longer looks the style up** (ADR style-studio D3). Fragments arrive as the
  third parameter; whoever composes resolves the id first (server: registry → builtin or the caller's
  own row; client: `resolveBuiltinStyle` for a preview). A user style's fragments live in a db row
  owned by one caller, which a pure function shared with the browser must not know how to fetch. The
  composition itself — order, joins, trim — is untouched, and `builtin composition is frozen` in
  `presets.test.ts` pins the exact bytes (with `apps/api/test/generations-styles.test.ts` pinning them
  again at the real HTTP boundary).
- **The hazard that introduces, and where it is caught:** fragments are gated on the `style` argument,
  NOT on `preset.styleId`. An id nobody resolved contributes nothing rather than leaking the bare id
  ("anime") into the prompt — but that also means a caller who forgets to resolve silently produces an
  UNSTYLED generation the user paid for. On the server that state is unreachable by construction:
  `create()` refuses an unresolvable id before it charges, so the failure mode is a 400.
- `resolveBuiltinStyle` returns the whole `StylePreset`, not just the two fragments, because the other
  readers of a resolved builtin need the rest: the registry's list needs `label`, the Cinema inspector
  needs `recommendedModelId`. A `StylePreset` satisfies `StyleFragments` structurally, so one lookup
  serves all three. It uses `Object.hasOwn` rather than `in` so `'constructor'`/`'toString'` cannot
  resolve to inherited functions and be handed to the composer as a style.
- **Negatives are JOINED, not assigned** (changed for Soul Studio). Style used to be the only axis
  with a negative, so a single `=` sufficed. `framing` is the second: `negativePrompt = framing.negative`
  would have silently DROPPED the style's — a Disney reference sheet would stop pushing away
  "photorealistic" the moment it started pushing away "busy background". With exactly one negative
  present the joined output is byte-identical to the old behaviour, so every pre-existing request is
  unaffected.
- **`framing: 'reference-sheet'`** is what makes Soul Studio's "clean and understandable" portraits a
  *named, tested thing* instead of a magic string in the API. Half its work is in the NEGATIVE (busy
  background, multiple characters, text, watermark, cropped) — a positive-only `PresetOption` cannot
  express that, hence `NegatingPresetOption`. Reusable by CinemaStudio (a clean product shot wants
  exactly the same thing).
- **`comic` is not a second `2d-cartoon`.** `2d-cartoon` is flat, soft and playful; `comic` is INKED —
  hard black linework, halftone dots, cel colour. Its negative pushes away both a soft painterly
  render *and* **anime**, because that is the illustrated tradition a diffusion model has far more
  training data for and will otherwise drift into. It is deliberately on the SHARED `StyleId` enum, so
  it also appears in CinemaStudio's picker — judged desirable (a character built in `comic` and a film
  shot in `comic` must agree), not a leak.
- Additive by design: no `promptPreset` → composed prompt is exactly the user's text. Existing
  ChatComposer is untouched.
- `'none'` is a real first-class option on the modifier axes so the UI can offer "no preference"
  without special-casing `undefined`.
- Unknown id → treated as absent, never emitted literally (correctness core, mirrors mentions.ts).
- Tables are literal objects with `satisfies` (not `Record<K,V>`) so `noUncheckedIndexedAccess`
  keeps `STYLE_PRESETS.disney` etc. fully defined without guards.
- **`hand-drawn` is not a second `2d-cartoon`.** `2d-cartoon` is flat, bold, playful (TV cartoon);
  `hand-drawn` is an animated *feature* — painted on twos, oil-brush, line boil, deliberately
  unsmooth. Its `negative` actively pushes away `smooth interpolated motion, motion blur` because
  video models default to frame-interpolated movement and will otherwise render a 2D-looking picture
  that *moves* like a 3D render. Extracted from the «Буран» template's reference prompt
  (`apps/api/src/modules/templates/catalog/buran.ts`), but it is drawing technique ONLY — the
  reference's lightless night and handheld operator stayed out, so the style is reusable on a sunlit
  hand-drawn film too. Adding a style id costs one i18n key per locale
  (`cinema.preset.style.<id>` in `en.json` / `ru.json`); the pickers build themselves from the enum.

## Commits
- _no commit yet_
