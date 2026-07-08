# routes.ts — GET /api/catalog (public)

> AI-facing sidecar for `routes.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
HTTP surface for the model catalog: exposes the curated `CATALOG` array to the SPA so the pricing/landing page and the generator model picker share one price list with the backend.

## What it does (for an AI reader)
- Responsibilities: register the single catalog route on the Fastify instance.
- Public API / exports / endpoints: `registerCatalogRoutes(app)` → `GET /api/catalog` → `{ models: CatalogModel[] }` (contracts `catalogResponseSchema` shape).
- Inputs → Outputs: no params, no body → 200 JSON with the full catalog.
- Side effects: none — pure read of an in-memory constant.

## Dependencies
- Imports / depends on: `./catalog` (`CATALOG`), `fastify` (type only).
- Used by: `src/app.ts` (registered in `buildApp`).

## Diagram
```mermaid
flowchart LR
  SPA[web SPA pricing + generator] -->|GET /api/catalog| R[routes.ts]
  R --> C[catalog.ts CATALOG]
  R -->|200 models| SPA
```

## Key decisions / gotchas
- **Public, no `requireUser`** on purpose: the landing/pricing page renders prices before sign-in, and the payload contains nothing user-specific or secret (AIR ids are public Runware identifiers).
- Response is static per process — if the catalog ever becomes DB-backed, add cache headers here.

- 2026-07-09: /api/catalog hides `provider:"wan-runpod"` video models when COMFY_BASE_URL is unset (self-host off) — a listed model whose backend cannot run is only a broken option. Models stay in CATALOG (routing/tests intact).

## Commits
- bdc4175 feat(api): curated model catalog with credit pricing
