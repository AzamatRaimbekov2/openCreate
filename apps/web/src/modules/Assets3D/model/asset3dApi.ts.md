# asset3dApi.ts — AI component doc

> AI-facing sidecar for `asset3dApi.ts`. Created 2026-07-18. Keep this in sync with the code on every change.

## Purpose
Server-state hooks for Modular 3D Assets (ADR modular-3d-assets) — the whole
`/api/assets3d*` HTTP surface as TanStack Query hooks. Mirrors Cinema's
filmsApi/shotsApi: a list, a composite detail, and the asset/part/analyze/extract/
mesh mutations, all keyed off the `['asset3d', id]` detail spine.

## What it does (for an AI reader)
- Responsibilities: own `['assets3d']` (list) and `assetKey(id)=['asset3d', id]`
  (asset + parts + derived statuses); keep both truthful across every mutation.
- Public API / exports / endpoints:
  - `assetKey(id)` — shared detail cache key.
  - `useAssets()` → GET `/api/assets3d` (`Asset3dList`).
  - `useAsset(id)` → GET `/api/assets3d/:id` (`Asset3dDetail`), disabled on empty id.
  - `useCreateAsset()` → POST `/api/assets3d` (`CreateAsset3dInput` → `Asset3d`).
  - `useUpdateAsset()` → PATCH `/api/assets3d/:id` (rename).
  - `useDeleteAsset()` → DELETE `/api/assets3d/:id` (optimistic remove + rollback).
  - `useAnalyze()` → POST `/api/assets3d/:id/analyze` (FREE, no body; `provider_error`
    via `ApiClientError.code`).
  - `useAddPart()` / `useUpdatePart()` (name/description OR `transform` clear-vs-untouch)
    / `useDeletePart()` → the `/parts[/:pid]` routes.
  - `useExtractPart()` → POST `…/extract` (PAID, no body, 200).
  - `useMeshPart()` → POST `…/mesh` (PAID, `{ modelId }`, 202 async).
- Inputs → Outputs: contract inputs → TanStack Query/Mutation objects; responses
  typed by `@opencreate/contracts` via `api<T>`.
- Side effects: network via `api<T>`; cache invalidation of `assetKey(id)`, and for
  the PAID hooks also `['generations']` + `['me']`.

## Dependencies
- Imports / depends on: `@tanstack/react-query`, contract types, `shared/libs/apiClient`.
- Used by: the (later) `AssetLibrary`, `CreateAssetModal`, `AssetWizard`, and the
  Parts/Extract/Mesh stage components; re-exported through the module `index.ts`.

## Diagram
```mermaid
flowchart LR
  UI[Assets3D UI] --> H[asset3dApi hooks]
  H -->|GET/POST/PATCH/DELETE| API[/api/assets3d*]
  H --> C[(cache: assets3d, asset3d:id)]
  H -. paid only .-> G[(cache: generations, me)]
```

## Key decisions / gotchas
- extract/mesh responses are `Asset3dPart` (NOT `Generation`) — `res.id` is the PART
  id, so this file NEVER `setQueryData(['generation', …])`; seeding the shared gen
  cache with a part-shaped object would poison what Gallery/Cinema/Soul read.
- Paid mutations invalidate `['generations']` + `['me']` (a charge moved the balance
  and added a feed item); the refetched aggregate then surfaces the fresh citation
  that `partGeneration.ts` polls by id.
- `assetKey` is exported so every mutation and the wizard write/invalidate the exact
  same detail entry (a typo'd key would strand the wizard).
- No cross-module imports — shares only cache keys with Generator/Gallery/Credits.

## Commits
- _no commit yet_
