# openCreate

AI image & video generation on Runware. Cheaper, honest credits that never expire.

## Quickstart

```bash
pnpm install
cp .env.example .env   # add RUNWARE_API_KEY + BETTER_AUTH_SECRET
pnpm --filter @opencreate/api db:migrate
pnpm dev               # web: http://localhost:5173, api: http://localhost:8787
```

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter @opencreate/web e2e   # playwright happy path (mocked API)
```

Feature docs: `apps/api/FEATURE.md`, `apps/web/FEATURE.md`. Architecture: `docs/wiki/decisions/opencreate-mvp-architecture.md` → `docs/wiki/architecture/opencreate-implementation.md`.
