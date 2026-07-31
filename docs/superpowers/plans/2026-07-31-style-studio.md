# Style Studio Implementation Plan (phases 1-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-created video styles as a unified registry — per the accepted ADR `docs/wiki/decisions/style-studio.md`. A style resolves by id at generation time exactly like a model resolves against the catalog.

**Architecture:** Builtin styles stay code (STYLE_PRESETS = the seed catalog); user styles live in a new `style` table. The wire `styleId` opens from enum to string; the SERVER validates at use time (builtin OR the caller's own row) before any charge. `applyPromptPreset` becomes fragment-parameterized (pure, no table lookup). New styles module (CRUD + registry), pickers move to `GET /api/styles`.

**Tech Stack:** the house stack. TDD. Commit hygiene per the established agent discipline (only your files, hunk-staging for shared ones).

---

## Task 1: Contracts — styleId opens, applyPromptPreset takes fragments

**Files:** `packages/contracts/src/presets.ts`, `presets.test.ts`, NEW `packages/contracts/src/style.ts` + test, `index.ts`.

1. In presets.ts: RENAME the enum to `builtinStyleIdSchema` (+ `BuiltinStyleId`) — it remains the type for STYLE_PRESETS keys and for template/soul INTERNALS. The public `styleIdSchema` becomes `z.string().min(1).max(60)` (keep the export name — most consumers compile unchanged). **Check first — every consumer of styleIdSchema/StyleId**: `soul.ts` builds on styleIdSchema (contracts index says so), `film.ts` (defaultStyleId + createFilmInputSchema), templates types (`apps/api/src/modules/templates/types.ts` uses StyleId — templates pin BUILTIN styles, so switch those to BuiltinStyleId), web pickers. Decide per consumer: wire surfaces → open string; internal catalogs (templates, soul style tables, STYLE_PRESETS) → BuiltinStyleId. Every switch documented in the sidecar.
2. `applyPromptPreset(prompt, preset)` currently reads `STYLE_PRESETS[preset.styleId]` (presets.ts:289 area). New signature: `applyPromptPreset(prompt, preset, style?: StyleFragments)` where `export type StyleFragments = { fragment: string; negative: string }`. The function NEVER looks up tables; passing the builtin fragments is now the caller's job. Add `resolveBuiltinStyle(id: string): StyleFragments | null` helper in presets.ts (returns null for non-builtin ids) so callers share one lookup.
3. NEW `style.ts` contracts: `styleKindSchema = z.enum(['prompt'])` · `styleSchema` (id, name, kind, builtin: z.boolean(), fragment, negative, recommendedModelId nullable, previewUrl nullable, createdAt/updatedAt nullable for builtin) · `createStyleInputSchema` { name 1..60, fragment 1..500, negative 0..300 default '', recommendedModelId optional } · `updateStyleInputSchema` = partial + `previewGenerationId` optional (string ≤60) · `styleListSchema { items }`. Export from index.
4. Tests: enum rename compiles templates/soul consumers; open styleId accepts a uuid AND every builtin id; applyPromptPreset with explicit fragments byte-identical to the old builtin behavior (regression-pin: compose with 'anime' fragments passed in === old output); style.ts input bounds.

Commit: `feat(contracts): open styleId, fragment-parameterized preset compose, style entity`.

## Task 2: DB + styles module (registry, CRUD)

**Files:** `db/ddl.ts` (+STYLE_DDL per the ADR D2 shape), `db/client.ts`, `db/schema.ts`, NEW `modules/styles/service.ts` + `routes.ts`, `app.ts`, test `test/styles.test.ts`.

- Service: `createStyleService({ db, generations? })`:
  - `listStyles(userId)` → builtin entries (from STYLE_PRESETS, builtin: true, fragments EXPOSED read-only, previewUrl null) + user rows (previewUrl resolved from previewGenerationId via the generations service `get` — a deleted/failed preview reads null, never throws).
  - `createStyle/updateStyle/deleteStyle` — owner-scoped (requireStyle, foreign==missing→404 error class); builtin ids REJECTED on update/delete with a validation error; kind fixed 'prompt'; `previewGenerationId` on update must cite the CALLER'S OWN succeeded image generation (copyGeneratedAsset-style default-deny — same message for every refusal).
  - `resolveStyleFragments(userId, styleId): StyleFragments | null` — builtin first (resolveBuiltinStyle), else own row, else null. THE function generations will call.
- Routes: GET/POST/PATCH/DELETE `/api/styles(/:id)`, requireUser, films-routes guard pattern. No rate bucket beyond global (free text CRUD).
- app.ts: register after canvas; export the service instance — generations needs it (next task).
- Tests: 401s; CRUD roundtrip; foreign 404; builtin immutable (400); list = 7 builtin + own; preview citation default-deny (foreign/failed/video gen → 400, balance untouched); resolveStyleFragments precedence (builtin id wins over a user row with the same id — and forbid CREATING a style whose id/name collides with builtin? ids are uuids, no collision; nothing to forbid).

Commit: `feat(styles): style table, registry, owner-scoped CRUD`.

## Task 3: generations resolve styles through the registry

**Files:** `modules/generations/service.ts`, `app.ts` wiring, test `test/generations-styles.test.ts`.

- create(): where applyPromptPreset is called (~line 491), resolve first: if `preset?.styleId` → `styles.resolveStyleFragments(userId, styleId)`; null → `ValidationError('unknown style …')` BEFORE the charge; pass fragments into applyPromptPreset. Builtin path must stay byte-identical (regression test: styled generation with 'anime' produces the same positive/negative as before). films/shot-references createClip path goes through the same create() — no extra change, but **check** storyboard/templates instantiation paths for their own applyPromptPreset calls (grep; adapt the same way).
- Deps: generations service takes `resolveStyle` (inject the function, not the whole service — Pick discipline).
- Tests: custom style applies (fragments visible in runware call), foreign styleId → 400 no charge, deleted style → 400 no charge, builtin regression pin.

Commit: `feat(generations): styles resolve through the registry — user styles apply everywhere`.

## Task 4: Web — Styles module + page

**Files:** NEW `apps/web/src/modules/Styles/` (model/api.ts, components/StyleLibrary.tsx, StyleEditor.tsx, index.ts), route `_shell.styles.tsx`, AppShell nav «Стили», locales.

- api: useStyles (['styles']), useCreateStyle/useUpdateStyle/useDeleteStyle (setQueryData absorb), useGeneratePreview — POST /api/generations {modelId: style.recommendedModelId ?? 'flux-schnell', prompt: STYLE_PREVIEW_PROMPT, promptPreset: { styleId }, aspectRatio '1:1'} then PATCH previewGenerationId on success (poll until succeeded like canvas useNodeGeneration).
- StyleLibrary: 4 states; builtin cards (badge «встроенный», no edit) + mine (preview img or placeholder, edit/delete with confirm).
- StyleEditor (модалка или инлайн-панель — mirror the entity editor pattern if one exists, else Modal): имя (RU ok), фрагмент EN textarea + **EnhanceButton sparkle (mandatory, wrapper-div gotcha из ImageNode.tsx.md)**, негатив textarea, recommendedModel Select (image+video модели из useCatalog через роут-шов — модуль Styles не импортирует Generator; catalog передать с роута пропсом), «Сгенерировать превью» (1 кр flux-schnell по умолчанию; кнопка с ценой).
- Deletion confirm: kit Modal, danger.
- Route in AppShell nav; locales ru/en (`styles.*`).

Commit(s): api+lib, editor, route+nav.

## Task 5: Pickers move to the registry

**Files:** every current style picker — **grep first**: `STYLE_PRESETS` and `styleId` in apps/web/src (Generator composer? Cinema ShotInspector/FilmEditor, film create flow, Soul?). For each: options come from `useStyles()` data (id, name, builtin) instead of the static table; loading state per 4-states (skeleton option row / disabled select while pending). The ROUTE seam rule: modules must not import Styles' hooks? — pickers live in Cinema/Generator; useStyles is Styles-module API → cross-module import forbidden. Resolution: the styles LIST hook goes to the route level like useCatalog does (routes may import modules/Styles) and flows down as props; where a picker sits deep (ShotInspector), follow the exact seam cinema.$filmId already uses for catalog/templates/entities. Document each seam in sidecars.
- Regression: film with builtin defaultStyleId renders exactly as before; a user style selected in the Cinema inspector survives save+generate.

Commit: `feat(web): style pickers read the registry — user styles selectable everywhere`.

## Task 6: Gate + live + docs

- Full gate: contracts+api+web (lint/tsc/vitest/build).
- Live (browser, cheap): создать стиль «Неоновый нуар» (fragment: neon-noir wording) → превью 1 кр → выбрать его в Cinema-инспекторе шота → сгенерировать 1 кадр Flash 1 кр → кадр в стиле. Проверить builtin-регрессию: старый фильм рендерит как раньше.
- Docs: FEATURE.md (web+api), wiki log RU, сайдкары. Shared-файлы — hunk-staging.

---

## Check-first ledger (reality beats the plan)

- applyPromptPreset exact signature/shape: presets.ts:280-320.
- styleIdSchema consumers: soul.ts (builds on it!), film.ts, templates/types.ts, web pickers, tests.
- Where storyboard/templates call applyPromptPreset or read STYLE_PRESETS.
- The entity-editor UI pattern (does one exist to mirror for StyleEditor?).
- generations service line anchors shifted by recent commits — search, don't count.
