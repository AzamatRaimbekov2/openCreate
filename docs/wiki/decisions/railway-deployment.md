---
type: decision
status: accepted
updated: 2026-08-02
sources:
  - PROD.md — existing single-container runbook (docker compose target)
  - Dockerfile — 4-stage build, non-root runtime, EXPOSE 8787, HEALTHCHECK /health
  - apps/api/src/config.ts — env schema, parseTrustProxy, provider gating
  - apps/api/src/storage/local.ts — StorageProvider interface (the S3/R2 seam)
  - apps/api/src/app.ts:543-550 — /media/* static serving, public by design
  - docs/wiki/decisions/opencreate-mvp-architecture.md — D5 "local disk MVP, S3/R2 later"
tags:
  - project-docs
  - wiki/decision
  - architecture
  - infrastructure
  - deployment
---

# ADR: Production deployment on Railway (R2 media, GitHub Actions CI/CD)

## Status

**Accepted — owner approved the written spec on 2026-08-02** ("все пойдет, начинай
деплой"). Owner choices locked in the intake round: platform = **Railway.app**; GitHub repo = **`AzamatRaimbekov/opencreate`,
private**; media storage = **external S3/R2 from day one** (not the platform volume);
deploy trigger = **GitHub Actions → Railway CLI with a token** (not the platform's own
GitHub auto-deploy). Implementation spec: [[infrastructure-railway]].

## Context

openCreate has never been deployed. What exists today is a *local* production shape,
already built and documented in `PROD.md`: one Docker image where the Fastify API serves
the JSON API, the built SPA and `/media/*` from a single origin on port 8787, with SQLite
plus downloaded media under `./data`. That shape was designed for `docker compose` on a
box with a reverse proxy in front.

Moving it to Railway changes four things and only four: **who terminates TLS**, **where the
data directory lives**, **who runs the build**, and **who holds the secrets**. Everything
below the process boundary — the credit ledger, the async generation lifecycle, the
provider gating, the SSRF allowlist — is untouched, and this ADR deliberately does not
reopen any of it.

Two constraints dominate every decision here:

1. **SQLite is a single-writer database on a single filesystem.** Exactly one process may
   hold the `./data` directory. This makes horizontal scaling, rolling deploys with
   overlap, and network filesystems all unavailable — not as a preference, as a
   correctness requirement. `PROD.md` already states the rule; a platform whose *default*
   deploy strategy overlaps old and new instances can violate it silently.
2. **The provider assets are perishable.** Runware URLs expire in 7 days, ByteDance
   hard-deletes at 24h, Alibaba and kie.ai at 24h. `storage.saveFromUrl` copying the bytes
   out is the only reason a user's generation still exists tomorrow. Whatever holds those
   bytes is load-bearing, not a cache.

The MVP ADR ([[opencreate-mvp-architecture]] D5) already recorded the intent: *"own asset
storage; `StorageProvider` abstraction — local disk MVP, S3/R2 later."* This ADR cashes
that in, one release earlier than "later", because the owner chose to pay the migration
cost before the first production byte rather than after.

## Decision

### D1 — Railway as the runtime, one service, one volume, one replica

The existing `Dockerfile` is the deploy unit; Railway builds it and runs it. No Nixpacks,
no buildpack, no second service. Concretely:

- **replicas = 1, permanently.** Not a scaling knob — a correctness invariant inherited
  from SQLite. Recorded in the service description so a future operator does not "just
  bump it".
- **Deploy overlap disabled.** Railway's default is to start the new deployment before
  stopping the old; against one volume that means two processes on one SQLite file.
  Overlap is set to zero, trading a few seconds of downtime per deploy for the invariant.
  This is the single most important platform setting in the whole ADR.
- **Volume mounted at `/app/data`**, holding only `opencreate.db` (+ WAL) once D2 lands.
- **Health check = `GET /health`**, which the image already exposes and which touches
  neither the database nor a provider.

Rejected: Render (same shape, no advantage), Fly.io (better SQLite story via LiteFS, but
LiteFS solves replication we explicitly do not want at one replica, and costs a harder
setup), a plain VPS with `docker compose` (cheapest and the runbook already exists — but
hands us TLS renewal, host patching and backups as ongoing manual work).

### D2 — Media move to Cloudflare R2 now; SQLite stays on the volume

Generated media leave the filesystem for an S3-compatible bucket (Cloudflare R2), selected
by the same optional-secret discipline every provider in `config.ts` already uses: R2
credentials present → R2 provider; absent → local disk. **Development keeps working with
zero configuration**, which is the property that makes this migration safe to land.

Why R2 and not the volume: video assets accumulate without bound and never shrink, a
platform volume is a fixed-size disk that must be resized by hand, and it is the same disk
the SQLite database lives on — a runaway media directory takes the database down with it.
R2 also has zero egress fees, which matters for a product whose entire output is video.

Why *not* also move SQLite: nothing about R2 helps a relational database, and the
Postgres migration path is already recorded in [[opencreate-mvp-architecture]] with its own
revisit trigger. One migration at a time.

**The interface has to change**, and this is the real cost of D2. `StorageProvider` today
exposes `dir` (an absolute directory handed to `@fastify/static`) and `localPath(key, ext)`
(an absolute file path handed to ffmpeg). Neither concept exists in object storage. They
are replaced by a serve descriptor, a materialize/release pair for ffmpeg inputs, and a
publish call for ffmpeg outputs — five call sites in total. Details, signatures and the
per-call-site plan are in [[infrastructure-railway]] §4.

**Reads are a 302 to a public R2 domain, and this lowers no security bar**: `/media/*` is
*already* unauthenticated today (verified at `apps/api/src/app.ts:543-550` — "public by
design for the MVP: keys are unguessable UUIDs minted by us, and `<img>`/`<video>` tags
need plain GETs without auth headers"). The confidentiality model is unchanged: an opaque
UUID is the capability. If that model is ever tightened, it gets tightened in both
providers at once, behind the same seam.

No data migration job is needed: no production data exists yet. The local `./data/media`
of a development machine stays local.

### D3 — GitHub Actions is the quality gate; Railway is only the deploy target

Two workflows. `ci.yml` runs on every PR and every push to `main`: install with a frozen
lockfile, lint, typecheck, unit tests (contracts + api + web), build. `deploy.yml` runs
only after a green CI on `main` and only then invokes the Railway CLI with a project token
held in GitHub secrets, then polls `/health` on the public origin before reporting success.

Rejected: Railway's native GitHub auto-deploy. It builds on push and its "wait for CI"
setting is a checkbox on the platform side — the gate then lives in two places with two
owners. One pipeline, one place where "may this ship" is decided.

Playwright e2e is deliberately **not** in the deploy path: it needs browser downloads and
is minutes of wall clock. It gets its own manual/nightly workflow. A deploy gate that
people learn to skip is worse than no gate.

## Consequences

- **Deploys have a short downtime window** (seconds, one container swap). Accepted
  consequence of D1's overlap-zero rule. Zero-downtime deploys are unavailable until the
  database stops being a file — i.e. until the Postgres migration.
- **The blast radius of a bad deploy is the whole product** — one service, one process.
  Mitigated by CI gating, a health check, and Railway's redeploy-previous rollback.
- **R2 becomes a hard dependency of the render pipeline**: ffmpeg now reads inputs that
  must be downloaded first and writes outputs that must be uploaded after. Renders get
  slower by the transfer time and gain a new failure mode (network mid-render). Bounded by
  the same timeout/size discipline `saveFromUrl` already enforces.
- **Two storage providers now exist and both must be tested.** The local one stays the
  development default forever; the R2 one only ever runs in production unless explicitly
  configured. That asymmetry is a standing risk of drift — mitigated by writing the
  provider tests against the *interface*, not the implementation.
- **Secrets multiply**: 11 provider keys plus R2 credentials plus a production-only
  `BETTER_AUTH_SECRET` now live in Railway, and a Railway token lives in GitHub. Rotation
  of `BETTER_AUTH_SECRET` invalidates every session — documented, not automated.
- **Cost becomes recurring and usage-shaped** (compute-minutes + volume + R2 storage)
  instead of zero. Order of magnitude, not a quote: single-digit dollars a month at
  MVP traffic, dominated by whether the container idles or is kept warm.

## Open questions (resolved before or during implementation)

1. **Volume ownership vs the non-root runtime user.** The image runs as `node` (uid 1000);
   a platform-mounted volume owned by root would make the data directory unwritable and
   the process would die at boot inside `createDb`. Resolution path and fallbacks in
   [[infrastructure-railway]] §5 R1 — verified on the first deploy, not assumed.
2. **How Railway's edge handles `X-Forwarded-For`.** `TRUST_PROXY=true` trusts the
   *leftmost* entry, so it is only safe if the edge overwrites rather than appends. The
   spec adds a hop-count form of `TRUST_PROXY` for exactly this and pins the behaviour
   with a live check, because getting it wrong means either every user shares one
   rate-limit bucket or an attacker picks their own bucket per request.
3. **Whether the Railway builder can run the full build** (pnpm install + tsc + vite +
   SSR + prerender) within its memory/time limits. Fallback documented: build the image in
   GitHub Actions, push to GHCR, deploy the image.

## Rejected alternatives

- **Keep media on the volume with a TTL sweeper** — smaller change, but it makes data loss
  a scheduled job and still couples media growth to the database's disk.
- **Serve `/media/*` by proxying R2 through the API** — preserves single-origin purity and
  would allow future per-object auth, but pays egress twice and puts video bandwidth
  through the one process that also runs the ledger. Revisit only if `/media` ever needs
  real authorization.
- **Vercel for the SPA + Railway for the API** — two origins, which costs the first-party
  cookie property that `PROD.md`'s single-origin design exists to protect.
- **Postgres now** — correct eventually, out of scope here; it is a data-layer decision
  with its own recorded revisit trigger, not a deployment decision.
