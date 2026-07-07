# openCreate — Production Runbook

One container runs everything: the Fastify API serves the built SPA, the media
files, and the JSON API on port **8787** (single origin — first-party cookies,
no CORS). State is a SQLite database plus downloaded media under `./data`.

## Environment variables

Set these in the repo-root `.env` (compose reads it via `env_file`). Never
commit `.env`; it is git- and docker-ignored.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `RUNWARE_API_KEY` | **yes** | – | Runware API key. Server-side only — never exposed to the browser. |
| `BETTER_AUTH_SECRET` | **yes** | – | ≥ 32 chars. Signs session cookies. Generate: `openssl rand -hex 32`. Rotating it invalidates all sessions. |
| `BETTER_AUTH_URL` | prod: yes | `http://localhost:8787` | The **public https origin** users hit, e.g. `https://app.example.com`. Must match the reverse-proxy hostname. |
| `TRUSTED_ORIGINS` | prod: yes | falls back to `WEB_ORIGIN` | Comma-separated origins allowed to make cookie-carrying requests (CSRF wall). Single-origin deploy: set it to the same value as `BETTER_AUTH_URL`. |
| `LOG_LEVEL` | no | `info` | `fatal…trace`/`silent`. Structured pino JSON on stdout — read with `docker compose logs -f`. |
| `SIGNUP_BONUS_CREDITS` | no | `200` | Credits granted through the ledger on signup. |
| `WEB_ORIGIN` | no | `http://localhost:5173` | Only relevant when the SPA is served from a *different* origin than the API. Single-origin prod can ignore it (set `TRUSTED_ORIGINS` instead). |
| `API_PORT` | no | `8787` | Keep `8787` inside the container — compose maps `8787:8787` and the healthcheck follows this var. |
| `DATABASE_PATH` | no | `./data/opencreate.db` | Resolves to `/app/data/opencreate.db` (inside the `./data` volume). |
| `STORAGE_DIR` | no | `./data/media` | Downloaded generation assets, served at `/media/*`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | – | Set both to enable Google OAuth; empty/unset keeps it disabled. |
| `ASSET_HOST_ALLOWLIST` | no | `runware.ai` | SSRF gate: host suffixes the server may download assets from. Widen only if the provider changes CDNs. |
| `NODE_ENV` | – | forced `production` by compose | Enables single-origin SPA serving. |

## First run

```bash
cp .env.example .env            # then fill RUNWARE_API_KEY, BETTER_AUTH_SECRET,
                                # BETTER_AUTH_URL, TRUSTED_ORIGINS
docker compose up -d --build    # builds the image and starts the service
curl -fsS localhost:8787/health # → {"ok":true}
```

- **Migrations run automatically on boot** — `createDb()` executes the
  idempotent DDL bootstrap plus guarded micro-migrations every start, so a
  fresh volume needs no separate migrate step and upgrades are re-run-safe.
- On Linux hosts, make the data volume writable by the container's non-root
  user (uid 1000): `mkdir -p data && chown -R 1000:1000 data`.
- The image build compiles everything from source (contracts → api bundle →
  web with landing prerender). The prerender is a pure-Node SSR pass
  (`react-dom` `renderToString` over the vite SSR bundle) — **no
  chromium/playwright anywhere in the image**, which keeps the builder slim
  and hermetic. Playwright remains a dev-only e2e dependency.

## Reverse proxy / TLS

Terminate TLS in front of the container and forward to `127.0.0.1:8787`.
`BETTER_AUTH_URL` and `TRUSTED_ORIGINS` must be the public https origin.

Caddy (automatic TLS):

```caddyfile
app.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

nginx:

```nginx
server {
    listen 443 ssl;
    server_name app.example.com;
    # ssl_certificate / ssl_certificate_key ...
    client_max_body_size 16m;   # image-to-video uploads are up to ~14 MB data URIs

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Backup & restore

All state lives in `./data` (SQLite db + WAL files + media).

```bash
docker compose stop             # quiesce writers so the WAL is consistent
cp -r data "backup-$(date +%F)"
docker compose start
```

For zero-downtime backups use SQLite's online backup instead of a raw copy:
`sqlite3 data/opencreate.db ".backup 'backup.db'"` (media files can be rsynced
live — keys are immutable). Restore = stop, put the directory back, start.

## Scaling & the SQLite single-instance rule

Run **exactly one** container against one `./data` directory. SQLite in WAL
mode is safe for this single process (readers don't block the writer), but a
second API instance on the same file — or a network filesystem — is not
supported. Do not use `docker compose up --scale`. When one box is no longer
enough, the recorded migration path is SQLite → Postgres via Drizzle; see the
ADR: `docs/wiki/decisions/opencreate-mvp-architecture.md` (data-layer decision
and its revisit trigger) and `apps/api/src/db/`.

## Operations quick reference

```bash
docker compose logs -f                    # structured pino JSON logs
docker compose ps                         # healthcheck status (healthy/unhealthy)
docker compose up -d --build              # deploy a new version (rebuild + swap)
docker compose down                       # stop (data survives in ./data)
curl -fsS localhost:8787/health           # liveness: {"ok":true}
```

- Health: `GET /health` is cheap (no db/provider touch) and used by both the
  image `HEALTHCHECK` and compose; `restart: unless-stopped` restarts crashes.
- A failed Runware call refunds credits automatically; `provider.error` log
  events with repeated 402s mean the **Runware account balance** is empty.
- Logs never contain secrets: authorization/cookie headers are redacted and
  unexpected 5xx bodies are sanitized to `internal_error`.
