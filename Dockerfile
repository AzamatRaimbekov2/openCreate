# syntax=docker/dockerfile:1
# openCreate production image — ONE container serving the API and the built SPA
# on port 8787 (single-origin: first-party cookies, no CORS). See PROD.md.
#
# Stage layout:
#   base      — node:22-slim + pnpm via corepack (version pinned by the root
#               package.json `packageManager` field)
#   build     — full workspace install + `pnpm build`. The landing prerender is
#               a pure-Node SSR pass (react-dom renderToString over the vite SSR
#               bundle) — NO chromium/playwright is needed at build or runtime,
#               so no playwright base image and no SKIP_PRERENDER escape hatch.
#   prod-deps — production-only node_modules for @opencreate/api, resolved from
#               the same lockfile (better-sqlite3 installs its linux prebuild
#               here; its build script is allowlisted in pnpm-workspace.yaml).
#   runtime   — slim final image: api esbuild bundle (contracts inlined) + web
#               dist + pruned node_modules, non-root `node` user.

FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm \
    PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ---- build: install everything, build contracts + api + web (prerender) -----
FROM base AS build
# Manifests first so the install layer caches across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY packages ./packages
COPY apps ./apps
# api: tsc type gate + esbuild bundle → apps/api/dist/index.js
# web: tsc + vite build + SSR pass + landing prerender → apps/web/dist
RUN pnpm build

# ---- prod-deps: prod-only node_modules for the api (lockfile-exact) ---------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --filter @opencreate/api...

# ---- runtime -----------------------------------------------------------------
FROM node:22-slim AS runtime
# NODE_ENV=production also switches on single-origin SPA serving in app.ts.
ENV NODE_ENV=production
WORKDIR /app
# pnpm layout: apps/api/node_modules holds symlinks into the root
# node_modules/.pnpm store — copy both trees to keep resolution intact.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
# package.json carries "type": "module" so node runs dist/index.js as ESM.
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
# Built SPA — WEB_DIST_PATH defaults to ../web/dist relative to apps/api,
# so keeping the monorepo layout means zero extra env configuration.
COPY --from=build /app/apps/web/dist ./apps/web/dist
# SQLite db + downloaded media live under /app/data (bind-mount it; see
# docker-compose.yml). Owned by the unprivileged `node` user (uid 1000).
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8787
# node's global fetch — the slim image has no curl/wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "const p=process.env.API_PORT||8787;fetch('http://127.0.0.1:'+p+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# DB bootstrap (idempotent DDL + micro-migrations) runs automatically on boot
# inside createDb() — no separate migrate step is needed on first run.
CMD ["node", "--enable-source-maps", "apps/api/dist/index.js"]
