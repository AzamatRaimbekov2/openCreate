# catalog.ts — curated model catalog (single source of truth)

> AI-facing sidecar for `catalog.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
The one place where openCreate's sellable models live: product ids, display names, Runware AIR ids, tiers, supported aspect ratios, duration options and **credit prices**. Routes, the generation service and SPA pricing all derive from this array — pricing is never duplicated elsewhere.

## What it does (for an AI reader)
- Responsibilities: hold the 2 image + 6 video model definitions and the pure pricing/resolution helpers.
- Public API / exports:
  - `CATALOG: CatalogModel[]` — every entry validated by the shared `catalogModelSchema` (see `test/catalog.test.ts`).
  - `getModel(id)` → `CatalogModel | undefined` — lookup by product id.
  - `creditsFor(model, duration)` → `number` — flat `credits` for images; `creditsByDuration[duration]` for video. Throws on missing/unsupported duration so a bad request can never be mischarged.
  - `resolutionFor(model, aspect)` → `{ width, height }` — images use `square1024`; plus/pro/premium video tiers FHD, other video tiers HD.
  - `RESOLUTIONS` — aspect-ratio → pixel tables.
- Inputs → Outputs: pure data + pure functions, no I/O, no state.
- Side effects: none.

## Dependencies
- Imports / depends on: `@opencreate/contracts` (types only: `AspectRatio`, `CatalogModel`).
- Used by: `modules/catalog/routes.ts` (GET /api/catalog), `modules/generations/service.ts` (Task 10: charge amount + Runware params), `scripts/verify-catalog.ts`.

## Diagram
```mermaid
flowchart LR
  K[(contracts: catalogModelSchema)] -.types.-> C[catalog.ts CATALOG + creditsFor + resolutionFor]
  C --> R[routes.ts GET /api/catalog]
  C --> G[generations/service.ts]
  C --> V[scripts/verify-catalog.ts AIR check]
```

## Key decisions / gotchas
- `RESOLUTIONS` is a literal object with `satisfies Record<string, Record<AspectRatio, Resolution>>` (NOT typed as `Record<string, …>`): under `noUncheckedIndexedAccess` this keeps `RESOLUTIONS.hd` and `table[aspect]` fully defined — the plan snippet's `Record<string, …>` shape would not typecheck.
- Prices are research 2026-07; re-verify quarterly. AIR ids `minimax:4@1` and `google:3@2` were flagged as needing verification — run `pnpm --filter @opencreate/api exec tsx src/scripts/verify-catalog.ts` with a real `RUNWARE_API_KEY` before launch.
- `seedance-1-5-pro` ("Pulse", standard tier) added 2026-07-08 after the direct-vs-Runware cost analysis (`docs/research/2026-07-07-seedance-direct-vs-runware.md`): wholesale ≈$0.026/s 720p silent on Runware → 35 cr/5s retail keeps ~63% margin and puts a genuine Seedance in our catalog against Higgsfield's $0.83+. AIR id verified LIVE via `modelSearch` (t2v + i2v capabilities confirmed). Seedance 2.0 deliberately NOT added — doesn't fit any tier below ~90 cr (see research doc).
- `supportsSafetyParam: false` on seedance-1-5-pro (2026-07-08): live submit failed with `unsupportedParameter: safety` — ByteDance models on Runware reject the `safety` task param that our client sends by default. The flag flows catalog → generations service (`omitSafety`) → runware client (omits `safety` from the task). Moderation for these models relies on the `NSFWContent` result flag, which the service already enforces.
- `wan-2-2` ("Forge", `provider: 'wan-runpod'`) added 2026-07-09: self-hosted Wan 2.2 on our RunPod GPU via the ComfyUI seam. `air` is a SYNTHETIC tag (`wan-runpod:wan2.2-t2v-a14b`) that only satisfies the AIR regex — it is never sent to Runware, and `verify-catalog.ts` SKIPS any `provider !== 'runware'` model. Premium tier, t2v only (`supportsImageInput: false`), 5s → 60 credits. KNOWN GAP: self-host has no provider NSFW check (poll returns `nsfw:false`).

- `supportsSafetyParam: false` also on `wan-2-7` (2026-07-09): Alibaba/Wan models reject Runware's `safety` param exactly like ByteDance — verified live when a Wan 2.7 submit 400'd. Same omitSafety flow.

## Commits
- bdc4175 feat(api): curated model catalog with credit pricing
