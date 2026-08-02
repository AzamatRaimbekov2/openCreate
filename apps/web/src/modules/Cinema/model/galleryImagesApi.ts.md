# galleryImagesApi.ts — AI component doc

> AI-facing sidecar for `galleryImagesApi.ts`. Created 2026-07-23. Keep this in sync with the code on every change.

## Purpose
Read-only TanStack Query hook that lists the signed-in user's OWN finished images
so the shot reference picker ("attach from gallery") can show them as thumbnails.
Cinema cannot import from `modules/Gallery` (cross-module law), so this mirrors
the wire SHAPE (`GenerationList`) rather than the Gallery hook.

## What it does (for an AI reader)
- Responsibilities:
  - Fetch ONE page of `GET /api/generations?limit=50` via `api<GenerationList>()`.
  - `select` it down to `GalleryImage[]` = the succeeded IMAGE generations that
    own a usable first media URL, flattened to `{ id, url }`.
  - Deliberately NO infinite scroll — the picker is a quick grab, not an archive.
- Public API / exports / props / endpoints:
  - `type GalleryImage = { id: string; url: string }`.
  - `useMyImageGenerations()` → `UseQueryResult<GalleryImage[]>` (has
    `data`/`isLoading`/`isError`/`refetch` the picker maps to its 4 UI states).
  - Endpoint: `GET /api/generations?limit=50`.
- Inputs → Outputs: (no args) → the user's recent succeeded image URLs as
  `{ id, url }[]`.
- Side effects (I/O, network, state): one GET; caches under
  `['cinema','gallery-images']` (separate from Gallery's `['generations']`
  infinite key, so the two never collide). `staleTime: 30s`.

## Dependencies
- Imports / depends on: `@tanstack/react-query` (`useQuery`),
  `@opencreate/contracts` (`GenerationList` type), `shared/libs/apiClient` (`api`).
- Used by: `Cinema/components/ShotGalleryPicker.tsx` (the modal picker).

## Diagram
```mermaid
flowchart LR
  GET[GET /api/generations?limit=50] --> HOOK[useMyImageGenerations]
  HOOK -->|select: image + succeeded + first url| FLAT[GalleryImage id,url array]
  FLAT --> PICKER[ShotGalleryPicker grid]
```

## Key decisions / gotchas
- `select` uses `flatMap` (not `filter` + `map`) so the first-URL extraction is
  airtight under `noUncheckedIndexedAccess`: a row with an empty `mediaUrls` is
  dropped, never coerced into an `undefined` src.
- Own cache key `['cinema','gallery-images']` — must NOT reuse Gallery's
  `['generations']` infinite key (different data shape, different lifecycle).
- No `modules/Gallery` import: only the `GenerationList` contract shape is shared.

## Commits
- _no commit yet_
