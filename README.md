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

## Production (Docker)

One container serves the API + built SPA on :8787; SQLite + media live in `./data`.

```bash
cp .env.example .env            # fill RUNWARE_API_KEY, BETTER_AUTH_SECRET,
                                # BETTER_AUTH_URL, TRUSTED_ORIGINS
docker compose up -d --build    # migrations run automatically on boot
curl -fsS localhost:8787/health # → {"ok":true}
```

Full runbook (env table, TLS/reverse proxy, backup, SQLite single-instance rule): [PROD.md](PROD.md).

Feature docs: `apps/api/FEATURE.md`, `apps/web/FEATURE.md`. Architecture: `docs/wiki/decisions/opencreate-mvp-architecture.md` → `docs/wiki/architecture/opencreate-implementation.md`.
