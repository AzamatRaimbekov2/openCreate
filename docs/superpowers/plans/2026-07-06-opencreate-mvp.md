# openCreate MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the openCreate MVP — a Runware-backed AI image/video generation platform (SPA + API monorepo) with auth, a credit ledger, a per-account library, and an honest "cheaper generation" landing page (EN/RU).

**Architecture:** pnpm monorepo: `packages/contracts` (Zod schemas shared by both sides), `apps/api` (Fastify 5 + Drizzle/SQLite + better-auth + Runware REST integration + local media storage), `apps/web` (React 19 + Vite 8 SPA, modular architecture, TanStack Router/Query, Zustand, Tailwind v4, i18next EN/RU). Runware key lives only in the API. Credits are charged at submit and refunded on failure (implements the ADR's hold→settle/refund semantics). Video is async: SPA polls our API every 4s; our API polls Runware `getResponse` on each request — no background workers in MVP. Finished assets are immediately downloaded to our own storage (Runware URLs expire in 7 days).

**Tech Stack:** TypeScript 5 strict everywhere, Zod v4, Fastify 5, drizzle-orm + better-sqlite3, better-auth, React 19, Vite 8, TanStack Router + Query v5, Zustand, Tailwind v4, react-hook-form + @hookform/resolvers, i18next + react-i18next, Vitest + RTL + Playwright, pnpm, ESLint v9 flat + Prettier (no semicolons, single quotes, trailing commas).

**Spec:** `docs/superpowers/specs/2026-07-06-opencreate-mvp-design.md` · **ADR:** `docs/wiki/decisions/opencreate-mvp-architecture.md`

**Conventions for every commit:** run the affected package's `pnpm lint && pnpm typecheck && pnpm test` first. NO `Co-Authored-By` trailer (project rule #2078). Conventional Commits.

**Dev ports:** API `http://localhost:8787`, Web `http://localhost:5173` (Vite proxies `/api` and `/media` to 8787 — no CORS needed in dev).

---

## File map (what exists when we're done)

```
openCreate/
├── pnpm-workspace.yaml
├── package.json                  # root scripts: dev, lint, typecheck, test, build
├── tsconfig.base.json
├── .prettierrc.json  .gitignore  .env.example  README.md
├── packages/contracts/
│   ├── package.json  tsconfig.json  vitest.config.ts
│   └── src/
│       ├── index.ts              # re-exports everything
│       ├── catalog.ts            # CatalogModel, AspectRatio schemas
│       ├── generation.ts         # CreateGenerationInput, Generation schemas
│       ├── credits.ts            # CreditTransaction schema
│       ├── user.ts               # Me schema
│       ├── errors.ts             # ApiError envelope + error codes
│       └── *.test.ts
├── apps/api/
│   ├── package.json  tsconfig.json  vitest.config.ts  drizzle.config.ts  eslint.config.js
│   └── src/
│       ├── index.ts              # boot (listen)
│       ├── app.ts                # buildApp(deps) — DI for testability
│       ├── config.ts             # env parsing (Zod)
│       ├── db/schema.ts  db/client.ts  db/migrate.ts
│       ├── modules/auth/auth.ts             # better-auth instance + signup bonus hook
│       ├── modules/auth/plugin.ts           # fastify mount + requireUser decorator
│       ├── modules/users/routes.ts          # GET /api/me
│       ├── modules/credits/ledger.ts        # charge/refund/grant (transactional)
│       ├── modules/credits/routes.ts        # GET /api/credits/transactions
│       ├── modules/catalog/catalog.ts       # typed model catalog (single source)
│       ├── modules/catalog/routes.ts        # GET /api/catalog
│       ├── modules/generations/service.ts   # create/get/list/delete + Runware + ledger
│       ├── modules/generations/routes.ts
│       ├── integrations/runware/client.ts   # REST client (fetch), no SDK
│       ├── integrations/runware/types.ts
│       ├── storage/local.ts                 # StorageProvider: save-from-url, /media serving
│       └── scripts/verify-catalog.ts        # checks AIR ids via modelSearch (needs real key)
│   └── test/ (mirrors src; *.test.ts, helpers/build-test-app.ts)
├── apps/web/
│   ├── package.json  tsconfig.json  vite.config.ts  eslint.config.js  index.html
│   ├── playwright.config.ts  e2e/generate.spec.ts
│   └── src/
│       ├── main.tsx
│       ├── @types/global.d.ts
│       ├── routes/__root.tsx  index.tsx  create.tsx  library.tsx  pricing.tsx  login.tsx
│       ├── modules/Auth/       (components/ hooks/ model/ index.ts)
│       ├── modules/Generator/  (components/ hooks/ model/ index.ts)
│       ├── modules/Gallery/    (components/ model/ index.ts)
│       ├── modules/Credits/    (components/ model/ index.ts)
│       ├── modules/Landing/    (components/ index.ts)
│       └── shared/
│           ├── config/i18n.ts  config/locales/en.json  config/locales/ru.json
│           ├── config/queryClient.ts
│           ├── libs/apiClient.ts
│           ├── ui/ (Button, Input, Select, Skeleton, Modal, EmptyState, ErrorState, Badge, Progress)
│           └── model/  types/
└── docs/frontend/design.md       # design tokens & rules (design-system-steward)
```

Ledger semantics note (maps to ADR): `charge` at submit (= hold+settle collapsed), `refund` on failure, `signup_bonus` on registration. Balance is denormalized on `user.creditsBalance`, mutated only inside the same DB transaction as the ledger row. Invariant: balance never goes below 0; refund only once per generation.

---

# Phase 0 — Repo scaffold

### Task 1: git + workspace + tooling skeleton

**Files:**
- Create: `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `.prettierrc.json`, `.env.example`, `README.md`
- Modify: `.gitignore` (exists — append)

- [ ] **Step 1: Init git and commit the already-written docs**

```bash
cd /Users/raimbekov/Desktop/openCreate
git init -b main
git add docs/ CLAUDE.md .AI.md .gitignore .mcp.json
git commit -m "docs: openCreate MVP spec, ADR and kickoff record"
```

- [ ] **Step 2: Write workspace files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
  - packages/*
```

Root `package.json`:
```json
{
  "name": "opencreate",
  "private": true,
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "pnpm --parallel --filter @opencreate/api --filter @opencreate/web dev",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  },
  "packageManager": "pnpm@10.12.1"
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  }
}
```

`.prettierrc.json`:
```json
{ "semi": false, "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
```

`.env.example`:
```bash
RUNWARE_API_KEY=your-runware-key
BETTER_AUTH_SECRET=generate-a-32-char-random-string
BETTER_AUTH_URL=http://localhost:8787
WEB_ORIGIN=http://localhost:5173
API_PORT=8787
DATABASE_PATH=./data/opencreate.db
STORAGE_DIR=./data/media
SIGNUP_BONUS_CREDITS=200
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Append to `.gitignore`:
```
node_modules/
dist/
data/
.env
*.tsbuildinfo
playwright-report/
test-results/
```

`README.md`: title, one-paragraph description, quickstart:
```markdown
# openCreate
AI image & video generation on Runware. Cheaper, honest credits that never expire.

## Quickstart
pnpm install
cp .env.example .env   # add RUNWARE_API_KEY + BETTER_AUTH_SECRET
pnpm --filter @opencreate/api db:migrate
pnpm dev               # web: http://localhost:5173, api: http://localhost:8787
```

- [ ] **Step 3: Verify pnpm resolves the workspace**

Run: `pnpm install` → creates lockfile, no packages yet, exit 0.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: pnpm workspace scaffold"
```

---

# Phase 1 — packages/contracts

### Task 2: contracts package with Zod schemas (test-first)

**Files:**
- Create: `packages/contracts/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/errors.ts`, `src/catalog.ts`, `src/generation.ts`, `src/credits.ts`, `src/user.ts`, `src/index.ts`
- Test: `src/generation.test.ts`, `src/catalog.test.ts`

- [ ] **Step 1: Package skeleton**

`packages/contracts/package.json`:
```json
{
  "name": "@opencreate/contracts",
  "version": "0.0.1",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```
`tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src"] }`
`vitest.config.ts`: `import { defineConfig } from 'vitest/config'; export default defineConfig({})`

Run: `pnpm --filter @opencreate/contracts add zod && pnpm --filter @opencreate/contracts add -D typescript vitest eslint prettier`

- [ ] **Step 2: Write failing tests**

`src/generation.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createGenerationInputSchema, generationSchema } from './generation'

describe('createGenerationInputSchema', () => {
  it('accepts a minimal image request', () => {
    const r = createGenerationInputSchema.safeParse({
      modelId: 'flux-schnell',
      prompt: 'a red fox in the snow',
      aspectRatio: '1:1',
    })
    expect(r.success).toBe(true)
  })
  it('rejects an empty prompt', () => {
    const r = createGenerationInputSchema.safeParse({
      modelId: 'flux-schnell',
      prompt: '',
      aspectRatio: '1:1',
    })
    expect(r.success).toBe(false)
  })
  it('rejects inputImage that is not a data URI', () => {
    const r = createGenerationInputSchema.safeParse({
      modelId: 'kling-3-pro',
      prompt: 'zoom in slowly',
      aspectRatio: '16:9',
      duration: 5,
      inputImage: 'https://example.com/cat.png',
    })
    expect(r.success).toBe(false)
  })
})

describe('generationSchema', () => {
  it('parses a processing video generation', () => {
    const r = generationSchema.safeParse({
      id: 'gen_1',
      type: 'video',
      mode: 'text',
      status: 'processing',
      prompt: 'ocean waves',
      modelId: 'pixverse-v6',
      params: { aspectRatio: '9:16', duration: 5 },
      costCredits: 35,
      mediaUrls: [],
      progress: 40,
      errorMessage: null,
      createdAt: '2026-07-06T10:00:00.000Z',
      completedAt: null,
    })
    expect(r.success).toBe(true)
  })
})
```

`src/catalog.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { catalogModelSchema } from './catalog'

describe('catalogModelSchema', () => {
  it('parses a video model with per-duration credits', () => {
    const r = catalogModelSchema.safeParse({
      id: 'pixverse-v6',
      type: 'video',
      name: 'Swift Video',
      providerLabel: 'PixVerse V6',
      air: 'pixverse:1@8',
      tier: 'standard',
      supportsImageInput: true,
      aspectRatios: ['16:9', '1:1', '9:16'],
      durationOptions: [5, 8],
      creditsByDuration: { '5': 35, '8': 56 },
    })
    expect(r.success).toBe(true)
  })
  it('requires credits for image models', () => {
    const r = catalogModelSchema.safeParse({
      id: 'x',
      type: 'image',
      name: 'X',
      providerLabel: 'X',
      air: 'a:1@1',
      tier: 'fast',
      supportsImageInput: false,
      aspectRatios: ['1:1'],
    })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `pnpm --filter @opencreate/contracts test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement schemas**

`src/errors.ts`:
```ts
import { z } from 'zod'

export const apiErrorCodeSchema = z.enum([
  'unauthorized',
  'not_found',
  'validation_failed',
  'insufficient_credits',
  'content_blocked',
  'provider_error',
  'internal_error',
])
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

export const apiErrorSchema = z.object({
  error: z.object({ code: apiErrorCodeSchema, message: z.string() }),
})
export type ApiError = z.infer<typeof apiErrorSchema>
```

`src/catalog.ts`:
```ts
import { z } from 'zod'

export const aspectRatioSchema = z.enum(['16:9', '1:1', '9:16'])
export type AspectRatio = z.infer<typeof aspectRatioSchema>

export const modelTierSchema = z.enum(['fast', 'quality', 'standard', 'plus', 'pro', 'premium'])
export type ModelTier = z.infer<typeof modelTierSchema>

const catalogBase = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  providerLabel: z.string().min(1),
  air: z.string().regex(/^[a-z0-9-]+:[a-z0-9.@-]+$/i),
  tier: modelTierSchema,
  supportsImageInput: z.boolean(),
  aspectRatios: z.array(aspectRatioSchema).min(1),
})

export const catalogImageModelSchema = catalogBase.extend({
  type: z.literal('image'),
  credits: z.number().int().positive(),
})
export const catalogVideoModelSchema = catalogBase.extend({
  type: z.literal('video'),
  durationOptions: z.array(z.number().int().positive()).min(1),
  creditsByDuration: z.record(z.string(), z.number().int().positive()),
})
export const catalogModelSchema = z.discriminatedUnion('type', [
  catalogImageModelSchema,
  catalogVideoModelSchema,
])
export type CatalogModel = z.infer<typeof catalogModelSchema>
export type CatalogImageModel = z.infer<typeof catalogImageModelSchema>
export type CatalogVideoModel = z.infer<typeof catalogVideoModelSchema>

export const catalogResponseSchema = z.object({ models: z.array(catalogModelSchema) })
```

`src/generation.ts`:
```ts
import { z } from 'zod'
import { aspectRatioSchema } from './catalog'

export const generationTypeSchema = z.enum(['image', 'video'])
export const generationModeSchema = z.enum(['text', 'image'])
export const generationStatusSchema = z.enum(['processing', 'succeeded', 'failed'])

export const createGenerationInputSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().min(2).max(2000),
  aspectRatio: aspectRatioSchema,
  duration: z.number().int().min(1).max(15).optional(),
  inputImage: z
    .string()
    .startsWith('data:image/')
    .max(14_000_000)
    .optional(),
})
export type CreateGenerationInput = z.infer<typeof createGenerationInputSchema>

export const generationParamsSchema = z.object({
  aspectRatio: aspectRatioSchema,
  duration: z.number().int().optional(),
  seed: z.number().optional(),
})

export const generationSchema = z.object({
  id: z.string(),
  type: generationTypeSchema,
  mode: generationModeSchema,
  status: generationStatusSchema,
  prompt: z.string(),
  modelId: z.string(),
  params: generationParamsSchema,
  costCredits: z.number().int(),
  mediaUrls: z.array(z.string()),
  progress: z.number().int().min(0).max(100).nullable().optional(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})
export type Generation = z.infer<typeof generationSchema>

export const generationListSchema = z.object({
  items: z.array(generationSchema),
  nextCursor: z.string().nullable(),
})
export type GenerationList = z.infer<typeof generationListSchema>
```

`src/credits.ts`:
```ts
import { z } from 'zod'

export const creditTransactionKindSchema = z.enum(['signup_bonus', 'charge', 'refund'])
export const creditTransactionSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  kind: creditTransactionKindSchema,
  generationId: z.string().nullable(),
  createdAt: z.string(),
})
export type CreditTransaction = z.infer<typeof creditTransactionSchema>
export const creditTransactionListSchema = z.object({
  items: z.array(creditTransactionSchema),
})
```

`src/user.ts`:
```ts
import { z } from 'zod'

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  creditsBalance: z.number().int(),
})
export type Me = z.infer<typeof meSchema>
```

`src/index.ts`: `export * from './errors'` … (all five files).

- [ ] **Step 5: Run tests, verify pass; commit**

Run: `pnpm --filter @opencreate/contracts test` → PASS.
```bash
git add packages/ pnpm-lock.yaml && git commit -m "feat(contracts): shared zod schemas for catalog, generations, credits, user, errors"
```

---

# Phase 2 — apps/api

### Task 3: Fastify app skeleton with DI + health route

**Files:**
- Create: `apps/api/package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`
- Create: `src/config.ts`, `src/app.ts`, `src/index.ts`
- Test: `test/health.test.ts`

- [ ] **Step 1: Package skeleton + deps**

`apps/api/package.json`:
```json
{
  "name": "@opencreate/api",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "db:migrate": "tsx src/db/migrate.ts",
    "lint": "eslint src test",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc -p tsconfig.build.json"
  }
}
```

Run:
```bash
pnpm --filter @opencreate/api add fastify @fastify/cookie @fastify/static better-auth drizzle-orm better-sqlite3 zod uuid @opencreate/contracts@workspace:*
pnpm --filter @opencreate/api add -D typescript tsx vitest eslint prettier drizzle-kit @types/better-sqlite3 @types/node
```

`eslint.config.js` (flat, typescript-eslint recommended — same file copied in web with react additions):
```js
import tseslint from 'typescript-eslint'
export default tseslint.config(tseslint.configs.recommended, {
  rules: { '@typescript-eslint/no-explicit-any': 'error' },
})
```
(also `pnpm --filter @opencreate/api add -D typescript-eslint`)

- [ ] **Step 2: Failing test**

`test/health.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildTestApp } from './helpers/build-test-app'

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })
})
```

`test/helpers/build-test-app.ts` (grows over tasks; initial version):
```ts
import { buildApp } from '../../src/app'

export async function buildTestApp() {
  return buildApp({
    config: {
      databasePath: ':memory:',
      storageDir: './data/test-media',
      runwareApiKey: 'test-key',
      betterAuthSecret: 'test-secret-test-secret-test-secret',
      betterAuthUrl: 'http://localhost:8787',
      webOrigin: 'http://localhost:5173',
      signupBonusCredits: 200,
      port: 0,
      googleClientId: null,
      googleClientSecret: null,
    },
  })
}
```

Run: `pnpm --filter @opencreate/api test` → FAIL (app.ts missing).

- [ ] **Step 3: Implement config + app**

`src/config.ts`:
```ts
import { z } from 'zod'

const envSchema = z.object({
  RUNWARE_API_KEY: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:8787'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  API_PORT: z.coerce.number().default(8787),
  DATABASE_PATH: z.string().default('./data/opencreate.db'),
  STORAGE_DIR: z.string().default('./data/media'),
  SIGNUP_BONUS_CREDITS: z.coerce.number().int().default(200),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
})

export type AppConfig = {
  runwareApiKey: string
  betterAuthSecret: string
  betterAuthUrl: string
  webOrigin: string
  port: number
  databasePath: string
  storageDir: string
  signupBonusCredits: number
  googleClientId: string | null
  googleClientSecret: string | null
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = envSchema.parse(env)
  return {
    runwareApiKey: e.RUNWARE_API_KEY,
    betterAuthSecret: e.BETTER_AUTH_SECRET,
    betterAuthUrl: e.BETTER_AUTH_URL,
    webOrigin: e.WEB_ORIGIN,
    port: e.API_PORT,
    databasePath: e.DATABASE_PATH,
    storageDir: e.STORAGE_DIR,
    signupBonusCredits: e.SIGNUP_BONUS_CREDITS,
    googleClientId: e.GOOGLE_CLIENT_ID ?? null,
    googleClientSecret: e.GOOGLE_CLIENT_SECRET ?? null,
  }
}
```

`src/app.ts` (DI container — deps grow over tasks; keep this exact shape):
```ts
import Fastify from 'fastify'
import type { AppConfig } from './config'

export type AppDeps = {
  config: AppConfig
  // added in later tasks: db, runware, storage
}

export async function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: false, bodyLimit: 15 * 1024 * 1024 })

  app.get('/health', async () => ({ ok: true }))

  app.setErrorHandler((err, _req, reply) => {
    const status = 'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500
    const code = status === 500 ? 'internal_error' : 'validation_failed'
    reply.status(status).send({ error: { code, message: err.message } })
  })

  return app
}
```

`src/index.ts`:
```ts
import { buildApp } from './app'
import { loadConfig } from './config'

const config = loadConfig()
const app = await buildApp({ config })
await app.listen({ port: config.port, host: '0.0.0.0' })
console.log(`api on :${config.port}`)
```

- [ ] **Step 4: Run tests → PASS. Commit**

```bash
git add apps/api pnpm-lock.yaml && git commit -m "feat(api): fastify skeleton with typed config and health route"
```

### Task 4: Drizzle schema + migrations

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `drizzle.config.ts`
- Test: `test/db.test.ts`

- [ ] **Step 1: Failing test**

`test/db.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/client'

describe('db', () => {
  it('creates all tables in memory', () => {
    const { sqlite } = createDb(':memory:')
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name)
    for (const t of ['user', 'session', 'account', 'verification', 'generation', 'credit_transaction']) {
      expect(tables).toContain(t)
    }
  })
})
```

Run: FAIL.

- [ ] **Step 2: Implement schema**

`src/db/schema.ts` (better-auth default table names + our domain tables):
```ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  creditsBalance: integer('credits_balance').notNull().default(0),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const generation = sqliteTable('generation', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['image', 'video'] }).notNull(),
  mode: text('mode', { enum: ['text', 'image'] }).notNull(),
  status: text('status', { enum: ['processing', 'succeeded', 'failed'] }).notNull(),
  prompt: text('prompt').notNull(),
  modelId: text('model_id').notNull(),
  paramsJson: text('params_json').notNull(),
  costCredits: integer('cost_credits').notNull(),
  runwareTaskUuid: text('runware_task_uuid'),
  runwareCostUsd: text('runware_cost_usd'),
  mediaJson: text('media_json').notNull().default('[]'),
  progress: integer('progress'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
})

export const creditTransaction = sqliteTable('credit_transaction', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  kind: text('kind', { enum: ['signup_bonus', 'charge', 'refund'] }).notNull(),
  generationId: text('generation_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
```

`src/db/client.ts`:
```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from './schema'
import { DDL } from './ddl'

export type Db = ReturnType<typeof createDb>['db']

export function createDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(DDL)
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}
```

`src/db/ddl.ts` — literal `CREATE TABLE IF NOT EXISTS` statements matching the schema above exactly (idempotent bootstrap; MVP replaces drizzle-kit migrations — simpler and works for ':memory:' tests). Write all six tables. Example for one (repeat pattern for all):
```ts
export const DDL = `
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  credits_balance INTEGER NOT NULL DEFAULT 0
);
-- ...session, account, verification, generation, credit_transaction identically mapped
CREATE INDEX IF NOT EXISTS idx_generation_user_created ON generation(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transaction(user_id, created_at DESC);
`
```
`src/db/migrate.ts`:
```ts
import { loadConfig } from '../config'
import { createDb } from './client'

createDb(loadConfig().databasePath)
console.log('db ready')
```

- [ ] **Step 3: Tests PASS. Wire db into AppDeps** (`buildApp({config, db})`; `build-test-app.ts` passes `createDb(':memory:').db`). Commit: `feat(api): drizzle schema + sqlite bootstrap DDL`

### Task 5: better-auth with signup bonus

**Files:**
- Create: `src/modules/auth/auth.ts`, `src/modules/auth/plugin.ts`, `src/modules/credits/ledger.ts` (grant part)
- Test: `test/auth.test.ts`

- [ ] **Step 1: Failing test**

`test/auth.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildTestApp } from './helpers/build-test-app'

async function register(app: Awaited<ReturnType<typeof buildTestApp>>) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: 'a@b.co', password: 'password123', name: 'A' },
  })
  return res
}

describe('auth', () => {
  it('registers, sets session cookie, grants 200 signup credits', async () => {
    const app = await buildTestApp()
    const res = await register(app)
    expect(res.statusCode).toBe(200)
    const cookie = res.headers['set-cookie']
    expect(cookie).toBeDefined()

    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: String(cookie) },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ email: 'a@b.co', creditsBalance: 200 })
  })
  it('GET /api/me without session → 401 envelope', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/me' })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('unauthorized')
  })
})
```

- [ ] **Step 2: Implement**

`src/modules/credits/ledger.ts` (start with grant; charge/refund in Task 6):
```ts
import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { creditTransaction, user } from '../../db/schema'

export function grantSignupBonus(db: Db, userId: string, amount: number) {
  db.transaction((tx) => {
    tx.update(user)
      .set({ creditsBalance: sql`${user.creditsBalance} + ${amount}` })
      .where(eq(user.id, userId))
      .run()
    tx.insert(creditTransaction)
      .values({ id: randomUUID(), userId, amount, kind: 'signup_bonus', createdAt: new Date() })
      .run()
  })
}
```

`src/modules/auth/auth.ts`:
```ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Db } from '../../db/client'
import type { AppConfig } from '../../config'
import { grantSignupBonus } from '../credits/ledger'

export function createAuth(db: Db, config: AppConfig) {
  return betterAuth({
    secret: config.betterAuthSecret,
    baseURL: config.betterAuthUrl,
    basePath: '/api/auth',
    trustedOrigins: [config.webOrigin],
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    emailAndPassword: { enabled: true },
    socialProviders:
      config.googleClientId && config.googleClientSecret
        ? { google: { clientId: config.googleClientId, clientSecret: config.googleClientSecret } }
        : {},
    user: { additionalFields: { creditsBalance: { type: 'number', defaultValue: 0, input: false } } },
    databaseHooks: {
      user: {
        create: {
          after: async (u) => {
            grantSignupBonus(db, u.id, config.signupBonusCredits)
          },
        },
      },
    },
  })
}
export type Auth = ReturnType<typeof createAuth>
```

`src/modules/auth/plugin.ts` — mounts better-auth handler on `/api/auth/*` and decorates `requireUser`:
```ts
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Auth } from './auth'

export type SessionUser = { id: string; email: string; name: string | null }

export async function registerAuth(app: FastifyInstance, auth: Auth) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (req, reply) => {
      const url = new URL(req.url, 'http://localhost')
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const request = new Request(new URL(req.url, `http://${req.headers.host ?? 'localhost'}`), {
        method: req.method,
        headers,
        body: req.method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
      })
      const response = await auth.handler(request)
      reply.status(response.status)
      response.headers.forEach((value, key) => reply.header(key, value))
      reply.send(await response.text())
      void url
    },
  })

  app.decorate('requireUser', async (req: FastifyRequest): Promise<SessionUser> => {
    const headers = new Headers()
    if (req.headers.cookie) headers.set('cookie', req.headers.cookie)
    const session = await auth.api.getSession({ headers })
    if (!session) {
      const err = new Error('Sign in required') as Error & { statusCode: number; apiCode: string }
      err.statusCode = 401
      err.apiCode = 'unauthorized'
      throw err
    }
    return { id: session.user.id, email: session.user.email, name: session.user.name ?? null }
  })
}
```
Extend the `app.setErrorHandler` in `app.ts` to use `err.apiCode` when present. Add `GET /api/me` route (`src/modules/users/routes.ts`) reading balance from `user` table with `requireUser`.

- [ ] **Step 3: Tests PASS. Commit** `feat(api): better-auth (email+google) with signup bonus + /api/me`

> NOTE for implementer: better-auth's exact handler-mount and `additionalFields` API — verify against the installed version's docs (`node_modules/better-auth/README.md` or https://better-auth.com). If the fastify adapter `toNodeHandler` is available in the installed version, prefer it over the manual Request bridge above. Behavior contract = the test.

### Task 6: Ledger charge/refund with invariants

**Files:**
- Modify: `src/modules/credits/ledger.ts`
- Create: `src/modules/credits/routes.ts` (GET /api/credits/transactions)
- Test: `test/ledger.test.ts`

- [ ] **Step 1: Failing tests**

`test/ledger.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/client'
import { chargeCredits, grantSignupBonus, refundCredits, InsufficientCreditsError } from '../src/modules/credits/ledger'
import { user } from '../src/db/schema'
import { eq } from 'drizzle-orm'

function seedUser(db: ReturnType<typeof createDb>['db']) {
  db.insert(user)
    .values({ id: 'u1', email: 'u1@x.co', createdAt: new Date(), updatedAt: new Date() })
    .run()
  return 'u1'
}
const balance = (db: ReturnType<typeof createDb>['db'], id: string) =>
  db.select({ b: user.creditsBalance }).from(user).where(eq(user.id, id)).get()?.b

describe('ledger', () => {
  it('charge deducts, refund restores exactly once', () => {
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    grantSignupBonus(db, uid, 200)
    chargeCredits(db, uid, 35, 'gen1')
    expect(balance(db, uid)).toBe(165)
    refundCredits(db, uid, 'gen1')
    expect(balance(db, uid)).toBe(200)
    refundCredits(db, uid, 'gen1') // second refund is a no-op
    expect(balance(db, uid)).toBe(200)
  })
  it('charge beyond balance throws and changes nothing', () => {
    const { db } = createDb(':memory:')
    const uid = seedUser(db)
    grantSignupBonus(db, uid, 10)
    expect(() => chargeCredits(db, uid, 35, 'gen2')).toThrow(InsufficientCreditsError)
    expect(balance(db, uid)).toBe(10)
  })
})
```

- [ ] **Step 2: Implement**

Add to `ledger.ts`:
```ts
export class InsufficientCreditsError extends Error {
  statusCode = 402
  apiCode = 'insufficient_credits'
  constructor() {
    super('Not enough credits')
  }
}

export function chargeCredits(db: Db, userId: string, amount: number, generationId: string) {
  db.transaction((tx) => {
    const row = tx.select({ b: user.creditsBalance }).from(user).where(eq(user.id, userId)).get()
    if (!row || row.b < amount) throw new InsufficientCreditsError()
    tx.update(user)
      .set({ creditsBalance: sql`${user.creditsBalance} - ${amount}` })
      .where(eq(user.id, userId))
      .run()
    tx.insert(creditTransaction)
      .values({ id: randomUUID(), userId, amount: -amount, kind: 'charge', generationId, createdAt: new Date() })
      .run()
  })
}

export function refundCredits(db: Db, userId: string, generationId: string) {
  db.transaction((tx) => {
    const charge = tx
      .select()
      .from(creditTransaction)
      .where(and(eq(creditTransaction.generationId, generationId), eq(creditTransaction.kind, 'charge')))
      .get()
    if (!charge) return
    const already = tx
      .select()
      .from(creditTransaction)
      .where(and(eq(creditTransaction.generationId, generationId), eq(creditTransaction.kind, 'refund')))
      .get()
    if (already) return
    tx.update(user)
      .set({ creditsBalance: sql`${user.creditsBalance} + ${-charge.amount}` })
      .where(eq(user.id, userId))
      .run()
    tx.insert(creditTransaction)
      .values({ id: randomUUID(), userId, amount: -charge.amount, kind: 'refund', generationId, createdAt: new Date() })
      .run()
  })
}
```
`src/modules/credits/routes.ts`: `GET /api/credits/transactions` → requireUser → last 100 rows mapped to `creditTransactionListSchema` shape.

- [ ] **Step 3: PASS + commit** `feat(api): transactional credit ledger with charge/refund invariants`

### Task 7: Model catalog

**Files:**
- Create: `src/modules/catalog/catalog.ts`, `src/modules/catalog/routes.ts`, `src/scripts/verify-catalog.ts`
- Test: `test/catalog.test.ts`

- [ ] **Step 1: Failing test**

`test/catalog.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { CATALOG, getModel, creditsFor } from '../src/modules/catalog/catalog'
import { catalogModelSchema } from '@opencreate/contracts'

describe('catalog', () => {
  it('every entry passes the contract schema', () => {
    for (const m of CATALOG) expect(catalogModelSchema.safeParse(m).success).toBe(true)
  })
  it('creditsFor image ignores duration', () => {
    expect(creditsFor(getModel('flux-schnell')!, undefined)).toBe(1)
  })
  it('creditsFor video uses duration table', () => {
    expect(creditsFor(getModel('pixverse-v6')!, 5)).toBe(35)
  })
  it('creditsFor video with unsupported duration throws', () => {
    expect(() => creditsFor(getModel('pixverse-v6')!, 99)).toThrow()
  })
})
```

- [ ] **Step 2: Implement catalog** (single source of truth; prices from research 2026-07, re-verify quarterly)

`src/modules/catalog/catalog.ts`:
```ts
import type { AspectRatio, CatalogModel } from '@opencreate/contracts'

export const RESOLUTIONS: Record<string, Record<AspectRatio, { width: number; height: number }>> = {
  hd: {
    '16:9': { width: 1280, height: 720 },
    '1:1': { width: 960, height: 960 },
    '9:16': { width: 720, height: 1280 },
  },
  fhd: {
    '16:9': { width: 1920, height: 1080 },
    '1:1': { width: 1440, height: 1440 },
    '9:16': { width: 1080, height: 1920 },
  },
  square1024: {
    '16:9': { width: 1344, height: 768 },
    '1:1': { width: 1024, height: 1024 },
    '9:16': { width: 768, height: 1344 },
  },
}

export const CATALOG: CatalogModel[] = [
  {
    id: 'flux-schnell',
    type: 'image',
    name: 'Flash',
    providerLabel: 'FLUX schnell',
    air: 'runware:100@1',
    tier: 'fast',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 1,
  },
  {
    id: 'flux-dev',
    type: 'image',
    name: 'Studio',
    providerLabel: 'FLUX dev',
    air: 'runware:101@1',
    tier: 'quality',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 2,
  },
  {
    id: 'pixverse-v6',
    type: 'video',
    name: 'Swift',
    providerLabel: 'PixVerse V6',
    air: 'pixverse:1@8',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 8],
    creditsByDuration: { '5': 35, '8': 56 },
  },
  {
    id: 'minimax-hailuo',
    type: 'video',
    name: 'Motion',
    providerLabel: 'MiniMax Hailuo 2.3',
    air: 'minimax:4@1',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9'],
    durationOptions: [6, 10],
    creditsByDuration: { '6': 35, '10': 60 },
  },
  {
    id: 'wan-2-7',
    type: 'video',
    name: 'Cinema',
    providerLabel: 'Wan 2.7',
    air: 'alibaba:wan@2.7',
    tier: 'plus',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 8],
    creditsByDuration: { '5': 55, '8': 88 },
  },
  {
    id: 'kling-3-pro',
    type: 'video',
    name: 'Director',
    providerLabel: 'Kling 3.0 Pro',
    air: 'klingai:kling-video@3-pro',
    tier: 'pro',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 10],
    creditsByDuration: { '5': 80, '10': 160 },
  },
  {
    id: 'veo-3-1-fast',
    type: 'video',
    name: 'Premiere',
    providerLabel: 'Veo 3.1 Fast',
    air: 'google:3@2',
    tier: 'premium',
    supportsImageInput: true,
    aspectRatios: ['16:9', '9:16'],
    durationOptions: [8],
    creditsByDuration: { '8': 140 },
  },
]

export function getModel(id: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.id === id)
}

export function creditsFor(model: CatalogModel, duration: number | undefined): number {
  if (model.type === 'image') return model.credits
  if (duration === undefined) throw new Error('duration required for video')
  const credits = model.creditsByDuration[String(duration)]
  if (!credits) throw new Error(`unsupported duration ${duration} for ${model.id}`)
  return credits
}

export function resolutionFor(model: CatalogModel, aspect: AspectRatio) {
  const table = model.type === 'image' ? RESOLUTIONS.square1024 : model.tier === 'pro' || model.tier === 'premium' || model.tier === 'plus' ? RESOLUTIONS.fhd : RESOLUTIONS.hd
  return table[aspect]
}
```
`routes.ts`: `GET /api/catalog` → `{ models: CATALOG }` (public, no auth).
`src/scripts/verify-catalog.ts`: for each CATALOG entry, POST a `modelSearch` task to Runware with the AIR id; print FOUND/NOT-FOUND table; exit 1 if any missing. (Run manually with a real key before launch; AIR ids `minimax:4@1`, `google:3@2` flagged by research as needing verification.)

- [ ] **Step 3: PASS + commit** `feat(api): curated model catalog with credit pricing`

### Task 8: Runware REST client

**Files:**
- Create: `src/integrations/runware/types.ts`, `src/integrations/runware/client.ts`
- Test: `test/runware-client.test.ts`

- [ ] **Step 1: Failing tests** (mock global fetch with `vi.stubGlobal`)

`test/runware-client.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRunwareClient, RunwareError } from '../src/integrations/runware/client'

const client = () => createRunwareClient({ apiKey: 'k' })
afterEach(() => vi.unstubAllGlobals())

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('runware client', () => {
  it('imageInference returns first data item', async () => {
    const fn = stubFetch(200, {
      data: [{ taskType: 'imageInference', taskUUID: 't1', imageURL: 'https://im.runware.ai/x.jpg', cost: 0.002, NSFWContent: false, seed: 7 }],
    })
    const res = await client().imageInference({
      taskUUID: 't1',
      positivePrompt: 'fox',
      model: 'runware:100@1',
      width: 1024,
      height: 1024,
    })
    expect(res.imageURL).toContain('im.runware.ai')
    const [, init] = fn.mock.calls[0]!
    const sent = JSON.parse(String(init!.body))
    expect(Array.isArray(sent)).toBe(true)
    expect(sent[0].taskType).toBe('imageInference')
    expect(sent[0].includeCost).toBe(true)
  })
  it('maps runware errors[] to RunwareError', async () => {
    stubFetch(200, { data: [], errors: [{ taskUUID: 't1', code: 'invalidModel', message: 'bad model' }] })
    await expect(
      client().imageInference({ taskUUID: 't1', positivePrompt: 'x', model: 'bad', width: 512, height: 512 }),
    ).rejects.toThrow(RunwareError)
  })
  it('getResponse passes through processing status with progress', async () => {
    stubFetch(200, { data: [{ taskType: 'videoInference', taskUUID: 't2', status: 'processing', progress: 40 }] })
    const res = await client().getResponse('t2')
    expect(res).toEqual({ status: 'processing', progress: 40 })
  })
  it('getResponse maps success payload', async () => {
    stubFetch(200, { data: [{ taskType: 'videoInference', taskUUID: 't2', status: 'success', videoURL: 'https://vm.runware.ai/v.mp4', cost: 0.35 }] })
    const res = await client().getResponse('t2')
    expect(res.status).toBe('success')
    if (res.status === 'success') expect(res.videoURL).toContain('vm.runware.ai')
  })
})
```

- [ ] **Step 2: Implement**

`types.ts`:
```ts
export type RunwareImageRequest = {
  taskUUID: string
  positivePrompt: string
  model: string
  width: number
  height: number
  seed?: number
}
export type RunwareImageResult = { imageURL: string; seed?: number; cost?: number; NSFWContent?: boolean }
export type RunwareVideoRequest = {
  taskUUID: string
  positivePrompt: string
  model: string
  width: number
  height: number
  duration: number
  frameImages?: Array<{ image: string; frame: 'first' | 'last' }>
}
export type RunwarePollResult =
  | { status: 'processing'; progress: number | null }
  | { status: 'success'; videoURL?: string; imageURL?: string; cost?: number; NSFWContent?: boolean }
  | { status: 'error'; message: string }
```

`client.ts`:
```ts
import type { RunwareImageRequest, RunwareImageResult, RunwarePollResult, RunwareVideoRequest } from './types'

const ENDPOINT = 'https://api.runware.ai/v1'

export class RunwareError extends Error {
  statusCode = 502
  apiCode = 'provider_error'
  constructor(message: string, public runwareCode?: string) {
    super(message)
  }
}

export type RunwareClient = {
  imageInference(req: RunwareImageRequest): Promise<RunwareImageResult>
  submitVideo(req: RunwareVideoRequest): Promise<void>
  getResponse(taskUUID: string): Promise<RunwarePollResult>
}

type Raw = { data?: Array<Record<string, unknown>>; errors?: Array<{ code?: string; message?: string }> }

export function createRunwareClient(opts: { apiKey: string; endpoint?: string }): RunwareClient {
  const post = async (tasks: Array<Record<string, unknown>>): Promise<Raw> => {
    const attempt = async (): Promise<globalThis.Response> =>
      fetch(opts.endpoint ?? ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify(tasks),
      })
    let res = await attempt()
    if ([429, 503, 504].includes(res.status)) {
      await new Promise((r) => setTimeout(r, 1500))
      res = await attempt()
    }
    if (!res.ok) throw new RunwareError(`Runware HTTP ${res.status}`)
    return (await res.json()) as Raw
  }

  const firstOrThrow = (raw: Raw): Record<string, unknown> => {
    const err = raw.errors?.[0]
    if (err) throw new RunwareError(err.message ?? 'Runware task failed', err.code)
    const item = raw.data?.[0]
    if (!item) throw new RunwareError('Empty Runware response')
    return item
  }

  return {
    async imageInference(req) {
      const raw = await post([
        {
          taskType: 'imageInference',
          deliveryMethod: 'sync',
          includeCost: true,
          numberResults: 1,
          outputType: 'URL',
          outputFormat: 'WEBP',
          safety: { checkContent: true },
          ...req,
        },
      ])
      const item = firstOrThrow(raw)
      return item as unknown as RunwareImageResult
    },
    async submitVideo(req) {
      const { frameImages, ...rest } = req
      const raw = await post([
        {
          taskType: 'videoInference',
          deliveryMethod: 'async',
          includeCost: true,
          outputFormat: 'MP4',
          safety: { checkContent: true, mode: 'fast' },
          ...(frameImages ? { inputs: { frameImages } } : {}),
          ...rest,
        },
      ])
      firstOrThrow(raw) // ack or immediate error
    },
    async getResponse(taskUUID) {
      const raw = await post([{ taskType: 'getResponse', taskUUID }])
      const err = raw.errors?.[0]
      if (err) return { status: 'error', message: err.message ?? 'generation failed' }
      const item = raw.data?.[0]
      if (!item) return { status: 'error', message: 'empty poll response' }
      if (item.status === 'processing')
        return { status: 'processing', progress: typeof item.progress === 'number' ? item.progress : null }
      if (item.status === 'success' || item.videoURL || item.imageURL)
        return {
          status: 'success',
          videoURL: item.videoURL as string | undefined,
          imageURL: item.imageURL as string | undefined,
          cost: item.cost as number | undefined,
          NSFWContent: item.NSFWContent as boolean | undefined,
        }
      return { status: 'error', message: 'unexpected poll payload' }
    },
  }
}
```

- [ ] **Step 3: PASS + commit** `feat(api): runware REST client (imageInference, videoInference, getResponse)`

### Task 9: Local storage provider

**Files:**
- Create: `src/storage/local.ts`
- Test: `test/storage.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStorage } from '../src/storage/local'

afterEach(() => vi.unstubAllGlobals())

describe('local storage', () => {
  it('downloads a url into STORAGE_DIR and returns /media path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })))
    const dir = mkdtempSync(join(tmpdir(), 'oc-storage-'))
    const storage = createLocalStorage(dir)
    const url = await storage.saveFromUrl('https://vm.runware.ai/v.mp4', 'gen1', 'mp4')
    expect(url).toBe('/media/gen1.mp4')
    expect(existsSync(join(dir, 'gen1.mp4'))).toBe(true)
  })
})
```

- [ ] **Step 2: Implement**

```ts
import { createWriteStream, mkdirSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export type StorageProvider = {
  saveFromUrl(url: string, key: string, ext: string): Promise<string>
  dir: string
  remove(key: string, ext: string): Promise<void>
}

export function createLocalStorage(dir: string): StorageProvider {
  mkdirSync(dir, { recursive: true })
  return {
    dir,
    async saveFromUrl(url, key, ext) {
      const res = await fetch(url)
      if (!res.ok || !res.body) throw new Error(`asset download failed: ${res.status}`)
      const file = join(dir, `${key}.${ext}`)
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file))
      return `/media/${key}.${ext}`
    },
    async remove(key, ext) {
      await unlink(join(dir, `${key}.${ext}`)).catch(() => undefined)
    },
  }
}
```
In `app.ts`, register `@fastify/static` with `root: deps.storage.dir`, `prefix: '/media/'`.

- [ ] **Step 3: PASS + commit** `feat(api): local media storage with /media serving`

### Task 10: Generations service + routes (the core)

**Files:**
- Create: `src/modules/generations/service.ts`, `src/modules/generations/routes.ts`
- Test: `test/generations.test.ts` (uses a fake RunwareClient injected via AppDeps)

- [ ] **Step 1: Failing tests** — cover the whole lifecycle:

```ts
import { describe, expect, it, vi } from 'vitest'
import { buildTestApp, registerAndGetCookie, fakeRunware } from './helpers/build-test-app'

describe('generations', () => {
  it('image: charges credits, calls runware, stores asset, returns succeeded', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', cost: 0.002, seed: 1, NSFWContent: false })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST', url: '/api/generations', headers: { cookie },
      payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
    })
    expect(res.statusCode).toBe(201)
    const gen = res.json()
    expect(gen.status).toBe('succeeded')
    expect(gen.mediaUrls[0]).toMatch(/^\/media\/.+\.webp$/)
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(199)
  })

  it('image: refunds on runware failure', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockRejectedValue(Object.assign(new Error('provider down'), { apiCode: 'provider_error', statusCode: 502 }))
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST', url: '/api/generations', headers: { cookie },
      payload: { modelId: 'flux-schnell', prompt: 'red fox', aspectRatio: '1:1' },
    })
    expect(res.statusCode).toBe(502)
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('video: 202 processing, then poll transitions to succeeded and downloads asset', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    rw.getResponse
      .mockResolvedValueOnce({ status: 'processing', progress: 40 })
      .mockResolvedValueOnce({ status: 'success', videoURL: 'https://vm.runware.ai/v.mp4', cost: 0.35 })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({
      method: 'POST', url: '/api/generations', headers: { cookie },
      payload: { modelId: 'pixverse-v6', prompt: 'waves', aspectRatio: '9:16', duration: 5 },
    })
    expect(created.statusCode).toBe(202)
    const id = created.json().id

    const p1 = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(p1.json()).toMatchObject({ status: 'processing', progress: 40 })

    const p2 = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(p2.json().status).toBe('succeeded')
    expect(p2.json().mediaUrls[0]).toMatch(/\.mp4$/)
  })

  it('video: poll error → failed + refund', async () => {
    const rw = fakeRunware()
    rw.submitVideo.mockResolvedValue(undefined)
    rw.getResponse.mockResolvedValue({ status: 'error', message: 'timeoutProvider' })
    const app = await buildTestApp({ runware: rw })
    const cookie = await registerAndGetCookie(app)
    const created = await app.inject({
      method: 'POST', url: '/api/generations', headers: { cookie },
      payload: { modelId: 'pixverse-v6', prompt: 'waves', aspectRatio: '9:16', duration: 5 },
    })
    const id = created.json().id
    const p = await app.inject({ method: 'GET', url: `/api/generations/${id}`, headers: { cookie } })
    expect(p.json().status).toBe('failed')
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().creditsBalance).toBe(200)
  })

  it('insufficient credits → 402, no runware call', async () => {
    const rw = fakeRunware()
    const app = await buildTestApp({ runware: rw, signupBonusCredits: 5 })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST', url: '/api/generations', headers: { cookie },
      payload: { modelId: 'pixverse-v6', prompt: 'waves', aspectRatio: '9:16', duration: 5 },
    })
    expect(res.statusCode).toBe(402)
    expect(res.json().error.code).toBe('insufficient_credits')
    expect(rw.submitVideo).not.toHaveBeenCalled()
  })

  it('list returns own items newest-first with cursor; delete removes', async () => {
    // create 3 images (mock success), GET /api/generations?limit=2 → 2 items + nextCursor,
    // GET with cursor → 1 item; DELETE first id → list length 2. Assert another user's cookie sees 0.
  })
})
```
(The last test's comment is the spec — write it out fully in code following the same inject patterns.)

`fakeRunware` in `build-test-app.ts`:
```ts
import { vi } from 'vitest'
export const fakeRunware = () => ({
  imageInference: vi.fn(),
  submitVideo: vi.fn(),
  getResponse: vi.fn(),
})
```
`buildTestApp` accepts `{ runware?, signupBonusCredits? }` overrides and injects a temp `mkdtemp` storage dir. `registerAndGetCookie` posts sign-up and returns the cookie string.

- [ ] **Step 2: Implement service**

`src/modules/generations/service.ts`:
```ts
import { randomUUID } from 'node:crypto'
import { and, desc, eq, lt } from 'drizzle-orm'
import type { Db } from '../../db/client'
import type { RunwareClient } from '../../integrations/runware/client'
import type { StorageProvider } from '../../storage/local'
import type { CreateGenerationInput, Generation } from '@opencreate/contracts'
import { generation } from '../../db/schema'
import { chargeCredits, refundCredits } from '../credits/ledger'
import { creditsFor, getModel, resolutionFor } from '../catalog/catalog'

export class NotFoundError extends Error {
  statusCode = 404
  apiCode = 'not_found'
}
export class ValidationError extends Error {
  statusCode = 400
  apiCode = 'validation_failed'
}

type Deps = { db: Db; runware: RunwareClient; storage: StorageProvider }

function toDto(row: typeof generation.$inferSelect): Generation {
  return {
    id: row.id,
    type: row.type,
    mode: row.mode,
    status: row.status,
    prompt: row.prompt,
    modelId: row.modelId,
    params: JSON.parse(row.paramsJson),
    costCredits: row.costCredits,
    mediaUrls: JSON.parse(row.mediaJson),
    progress: row.progress,
    errorMessage: row.errorMessage,
    createdAt: new Date(row.createdAt).toISOString(),
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
  }
}

export function createGenerationService({ db, runware, storage }: Deps) {
  async function create(userId: string, input: CreateGenerationInput): Promise<{ dto: Generation; created: boolean }> {
    const model = getModel(input.modelId)
    if (!model) throw new ValidationError(`unknown model ${input.modelId}`)
    if (!model.aspectRatios.includes(input.aspectRatio))
      throw new ValidationError(`aspect ${input.aspectRatio} unsupported for ${model.id}`)
    if (input.inputImage && !model.supportsImageInput)
      throw new ValidationError(`${model.id} does not support image input`)
    const cost = creditsFor(model, input.duration) // throws ValidationError-worthy on bad duration
    const { width, height } = resolutionFor(model, input.aspectRatio)
    const id = randomUUID()
    const taskUUID = randomUUID()
    const now = new Date()
    const mode = input.inputImage ? 'image' : 'text'

    chargeCredits(db, userId, cost, id)
    db.insert(generation)
      .values({
        id, userId, type: model.type, mode, status: 'processing',
        prompt: input.prompt, modelId: model.id,
        paramsJson: JSON.stringify({ aspectRatio: input.aspectRatio, duration: input.duration }),
        costCredits: cost, runwareTaskUuid: taskUUID, createdAt: now,
      })
      .run()

    if (model.type === 'image') {
      try {
        const res = await runware.imageInference({
          taskUUID, positivePrompt: input.prompt, model: model.air, width, height,
        })
        const mediaUrl = await storage.saveFromUrl(res.imageURL, id, 'webp')
        db.update(generation)
          .set({
            status: 'succeeded', mediaJson: JSON.stringify([mediaUrl]),
            runwareCostUsd: res.cost?.toString(), completedAt: new Date(),
            paramsJson: JSON.stringify({ aspectRatio: input.aspectRatio, seed: res.seed }),
          })
          .where(eq(generation.id, id))
          .run()
      } catch (err) {
        refundCredits(db, userId, id)
        db.update(generation)
          .set({ status: 'failed', errorMessage: err instanceof Error ? err.message : 'generation failed', completedAt: new Date() })
          .where(eq(generation.id, id))
          .run()
        throw err
      }
      const row = db.select().from(generation).where(eq(generation.id, id)).get()
      return { dto: toDto(row!), created: true }
    }

    // video
    try {
      await runware.submitVideo({
        taskUUID, positivePrompt: input.prompt, model: model.air, width, height,
        duration: input.duration!,
        ...(input.inputImage ? { frameImages: [{ image: input.inputImage, frame: 'first' as const }] } : {}),
      })
    } catch (err) {
      refundCredits(db, userId, id)
      db.update(generation)
        .set({ status: 'failed', errorMessage: err instanceof Error ? err.message : 'submit failed', completedAt: new Date() })
        .where(eq(generation.id, id))
        .run()
      throw err
    }
    const row = db.select().from(generation).where(eq(generation.id, id)).get()
    return { dto: toDto(row!), created: false }
  }

  async function get(userId: string, id: string): Promise<Generation> {
    const row = db
      .select().from(generation)
      .where(and(eq(generation.id, id), eq(generation.userId, userId)))
      .get()
    if (!row) throw new NotFoundError('generation not found')
    if (row.status !== 'processing' || !row.runwareTaskUuid) return toDto(row)

    const poll = await runware.getResponse(row.runwareTaskUuid)
    if (poll.status === 'processing') {
      db.update(generation).set({ progress: poll.progress }).where(eq(generation.id, id)).run()
      return toDto({ ...row, progress: poll.progress })
    }
    if (poll.status === 'success') {
      const src = poll.videoURL ?? poll.imageURL
      if (!src) return toDto(row)
      const mediaUrl = await storage.saveFromUrl(src, id, row.type === 'video' ? 'mp4' : 'webp')
      // guard: only transition if still processing (concurrent polls)
      db.transaction((tx) => {
        const fresh = tx.select().from(generation).where(eq(generation.id, id)).get()
        if (fresh?.status !== 'processing') return
        tx.update(generation)
          .set({
            status: 'succeeded', mediaJson: JSON.stringify([mediaUrl]),
            runwareCostUsd: poll.cost?.toString(), progress: 100, completedAt: new Date(),
          })
          .where(eq(generation.id, id))
          .run()
      })
    } else {
      db.transaction((tx) => {
        const fresh = tx.select().from(generation).where(eq(generation.id, id)).get()
        if (fresh?.status !== 'processing') return
        tx.update(generation)
          .set({ status: 'failed', errorMessage: poll.message, completedAt: new Date() })
          .where(eq(generation.id, id))
          .run()
      })
      refundCredits(db, userId, id)
    }
    const updated = db.select().from(generation).where(eq(generation.id, id)).get()
    return toDto(updated!)
  }

  function list(userId: string, limit: number, cursor?: string) {
    const rows = db
      .select().from(generation)
      .where(cursor ? and(eq(generation.userId, userId), lt(generation.createdAt, new Date(Number(cursor)))) : eq(generation.userId, userId))
      .orderBy(desc(generation.createdAt))
      .limit(limit + 1)
      .all()
    const items = rows.slice(0, limit).map(toDto)
    const nextCursor = rows.length > limit ? String(rows[limit - 1]!.createdAt.getTime()) : null
    return { items, nextCursor }
  }

  async function remove(userId: string, id: string) {
    const row = db
      .select().from(generation)
      .where(and(eq(generation.id, id), eq(generation.userId, userId)))
      .get()
    if (!row) throw new NotFoundError('generation not found')
    await storage.remove(id, row.type === 'video' ? 'mp4' : 'webp')
    db.delete(generation).where(eq(generation.id, id)).run()
  }

  return { create, get, list, remove }
}
```

`routes.ts`: thin Fastify routes — parse body with `createGenerationInputSchema` (return 400 envelope on fail), call service, map `created ? 201 : 202`, `GET /:id`, `GET ?limit&cursor` (limit default 24, max 50), `DELETE /:id` → 204. All behind `requireUser`.

- [ ] **Step 3: All API tests PASS. Commit** `feat(api): generation lifecycle — charge, runware, store, poll, refund`

### Task 11: API wrap-up — wire everything in app.ts + smoke script

**Files:**
- Modify: `src/app.ts` (register auth plugin, routes, static /media), `src/index.ts` (create db/runware/storage from config)

- [ ] Wire deps: `buildApp({ config, db, runware, storage })`; `index.ts` builds real ones (`createRunwareClient({apiKey: config.runwareApiKey})` etc).
- [ ] Run full suite: `pnpm --filter @opencreate/api lint && pnpm --filter @opencreate/api typecheck && pnpm --filter @opencreate/api test` → all green.
- [ ] Manual smoke (real key optional): `pnpm --filter @opencreate/api dev` + `curl localhost:8787/health`, `curl localhost:8787/api/catalog`.
- [ ] Commit `feat(api): assembled application entrypoint`

---

# Phase 3 — apps/web

> Frontend rules are BINDING: react-senior-standard.md (modular architecture, public API via index.ts, no cross-module imports, aliases, zero `any`, no index keys, 4 UI states per screen, TanStack Router only, pnpm only). Design tokens & direction live in `docs/frontend/design.md` (Task 13). All user-facing strings via i18next keys (EN + RU).

### Task 12: Vite scaffold + providers + router

**Files:**
- Create: `apps/web/package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `index.html`
- Create: `src/main.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx` (placeholder landing), `src/shared/config/queryClient.ts`, `src/shared/config/i18n.ts`, `src/shared/config/locales/en.json`, `src/shared/config/locales/ru.json`, `src/@types/global.d.ts`
- Test: `src/routes/__root.test.tsx` (smoke render)

- [ ] **Step 1: Scaffold + deps**

```bash
pnpm --filter @opencreate/web add react react-dom @tanstack/react-router @tanstack/react-query zustand react-hook-form @hookform/resolvers zod i18next react-i18next better-auth @opencreate/contracts@workspace:*
pnpm --filter @opencreate/web add -D typescript vite @vitejs/plugin-react @tanstack/router-plugin tailwindcss @tailwindcss/vite vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom eslint typescript-eslint eslint-plugin-react-hooks prettier playwright @playwright/test
```

`apps/web/package.json` scripts:
```json
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "lint": "eslint src",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "e2e": "playwright test"
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      modules: fileURLToPath(new URL('./src/modules', import.meta.url)),
      shared: fileURLToPath(new URL('./src/shared', import.meta.url)),
      routes: fileURLToPath(new URL('./src/routes', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/media': 'http://localhost:8787',
    },
  },
  test: { environment: 'jsdom', setupFiles: './src/test-setup.ts', globals: true },
})
```
(`tsconfig.json` mirrors aliases via `paths`; add `"types": ["vitest/globals", "@testing-library/jest-dom"]`. `src/test-setup.ts`: `import '@testing-library/jest-dom/vitest'`.)

`index.html` — full SEO/OG head (landing is `/`):
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>openCreate — AI images from $0.01, video from $0.35</title>
    <meta name="description" content="Generate AI images and cinematic videos with top models. Honest pricing: credits never expire, no subscription required." />
    <meta property="og:title" content="openCreate — cheaper AI image & video generation" />
    <meta property="og:description" content="Images from $0.01, 5s videos from $0.35. Credits never expire." />
    <meta property="og:type" content="website" />
    <style>html{background:#faf9f6}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/shared/config/i18n.ts`:
```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ru from './locales/ru.json'

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('oc-lang') : null

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru } },
  lng: stored ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export function setLanguage(lang: 'en' | 'ru') {
  localStorage.setItem('oc-lang', lang)
  void i18n.changeLanguage(lang)
}
export default i18n
```
Locale files start with the keys used by tasks below (nav, landing, generator, gallery, credits, auth, errors) — add keys as components are built; NEVER hardcode UI strings.

`src/routes/__root.tsx`:
```tsx
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from 'shared/config/queryClient'
import { AppErrorBoundary, OfflineOverlay, NotFoundPage } from 'shared/ui'
import 'shared/config/i18n'

export const Route = createRootRoute({
  component: () => (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <OfflineOverlay />
        <Outlet />
      </QueryClientProvider>
    </AppErrorBoundary>
  ),
  notFoundComponent: NotFoundPage,
})
```
`src/main.tsx`: standard TanStack Router bootstrap (`createRouter({ routeTree })`, `RouterProvider`, `StrictMode`). Smoke test renders the router with memory history and asserts the landing headline appears.

- [ ] **Step 2: `pnpm --filter @opencreate/web test` PASS, `dev` boots. Commit** `feat(web): vite scaffold, tanstack router, i18n, providers`

### Task 13: Design system — tokens, shared/ui kit, error-UX surfaces, design.md

**Files:**
- Create: `src/shared/ui/` — `Button.tsx`, `Input.tsx`, `Select.tsx`, `Skeleton.tsx`, `Modal.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `Badge.tsx`, `Progress.tsx`, `AppErrorBoundary.tsx`, `OfflineOverlay.tsx`, `NotFoundPage.tsx`, `index.ts`
- Create: `src/shared/config/theme.css` (Tailwind v4 `@theme`), `docs/frontend/design.md`
- Test: `src/shared/ui/Button.test.tsx`, `src/shared/ui/ErrorState.test.tsx`, `src/shared/ui/OfflineOverlay.test.tsx`

**Design direction (unique, simple, beautiful — deliberately NOT Higgsfield's dark cinema):** "Paper & Ink" — warm paper background `#faf9f6`, ink text `#111110`, one electric accent `#4f46e5` (indigo) + success `#16a34a`; generous whitespace; `rounded-2xl` cards with soft `shadow-sm`; system font stack with large tracking-tight display headings; motion: only opacity/translate 150ms. Dark surfaces allowed ONLY for media cards (video/image previews sit on `#141413`).

`src/shared/config/theme.css`:
```css
@import 'tailwindcss';

@theme {
  --color-paper: #faf9f6;
  --color-ink: #111110;
  --color-ink-soft: #57534e;
  --color-accent: #4f46e5;
  --color-accent-soft: #eef2ff;
  --color-media: #141413;
  --color-success: #16a34a;
  --color-danger: #dc2626;
  --radius-card: 1rem;
}
```

- [ ] **Step 1: Write `docs/frontend/design.md`** — tokens above, spacing scale (4px), component inventory with variants (Button: primary/ghost/danger, sizes md/lg; states incl. loading+disabled), a11y rules (focus-visible ring `ring-2 ring-accent`, min hit area 40px, aria-labels on icon buttons), voice (short verbs, no exclamation marks), and the 4-states rule.
- [ ] **Step 2: Failing tests** — Button renders label/spinner and is disabled while loading; ErrorState shows message + retry button firing callback; OfflineOverlay appears when `window` fires `offline` and hides on `online`.
- [ ] **Step 3: Implement kit.** Every component typed props (`type Props = {...}`), Tailwind classes only, no CSS files besides theme.css. `AppErrorBoundary` = class component catching render errors → full-screen fallback with reload button. `NotFoundPage` = 404 with link home. `OfflineOverlay` = `useSyncExternalStore` on online/offline events → fixed blocking overlay.
- [ ] **Step 4: PASS + commit** `feat(web): paper&ink design system, shared ui kit, error-ux surfaces`

### Task 14: API client + auth module

**Files:**
- Create: `src/shared/libs/apiClient.ts`
- Create: `src/modules/Auth/model/authClient.ts`, `model/useSession.ts`, `components/AuthForm.tsx`, `index.ts`
- Create: `src/routes/login.tsx`
- Test: `src/shared/libs/apiClient.test.ts`, `src/modules/Auth/components/AuthForm.test.tsx`

- [ ] **Step 1: Failing tests.** apiClient: parses JSON on 2xx; on non-2xx throws `ApiClientError` carrying `{code,message}` from the envelope (fallback `internal_error`). AuthForm: renders email+password fields with zod validation errors (RHF), submits login, shows server error message in an alert region, has a mode switch login↔register.
- [ ] **Step 2: Implement.**

`apiClient.ts`:
```ts
import { apiErrorSchema, type ApiErrorCode } from '@opencreate/contracts'

export class ApiClientError extends Error {
  constructor(public code: ApiErrorCode, message: string, public status: number) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (res.status === 204) return undefined as T
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body)
    if (parsed.success)
      throw new ApiClientError(parsed.data.error.code, parsed.data.error.message, res.status)
    throw new ApiClientError('internal_error', `Request failed (${res.status})`, res.status)
  }
  return body as T
}
```
`authClient.ts`: `createAuthClient({ baseURL: '/api/auth' })` from `better-auth/react` — exports `signIn`, `signUp`, `signOut`, `useSession`. `useSession.ts` wraps it and exposes `useMe()` — TanStack Query on `/api/me` (enabled when session exists), `staleTime: 30_000`. `AuthForm.tsx`: RHF + zodResolver, i18n labels, 4 states, Google button rendered only when `import.meta.env.VITE_GOOGLE_AUTH === '1'`. `routes/login.tsx` renders it centered on paper background; redirect to `/create` when already signed in.

- [ ] **Step 3: PASS + commit** `feat(web): api client + auth module (email/password, optional google)`

### Task 15: Credits module

**Files:**
- Create: `src/modules/Credits/model/creditsApi.ts`, `components/BalanceChip.tsx`, `components/TransactionsList.tsx`, `index.ts`
- Test: `components/BalanceChip.test.tsx` (4 states), `components/TransactionsList.test.tsx`

- [ ] BalanceChip: query `/api/me`; loading → `Skeleton`, error → compact retry icon-button, data → `⚡ 165` chip with accent styling; clicking opens TransactionsList modal (kind → i18n label, signed amounts colored success/danger). Test all four states by mocking `api` (`vi.mock('shared/libs/apiClient')`).
- [ ] Commit `feat(web): credits balance chip + transactions modal`

### Task 16: Generator module (create page core)

**Files:**
- Create: `src/modules/Generator/model/generatorStore.ts` (Zustand), `model/catalogApi.ts`, `model/createGeneration.ts`, `components/GeneratorPanel.tsx`, `components/ModelPicker.tsx`, `components/AspectPicker.tsx`, `components/DurationPicker.tsx`, `components/ImageDrop.tsx`, `components/CostLabel.tsx`, `index.ts`
- Create: `src/routes/create.tsx`
- Test: `model/generatorStore.test.ts`, `components/GeneratorPanel.test.tsx`

- [ ] **Step 1: Failing tests.**
  - Store: `setModel('pixverse-v6')` resets duration to first supported & clears inputImage if unsupported; `costCredits` selector = catalog lookup (image → credits, video → creditsByDuration[duration]); mode switch image↔video picks first model of that type.
  - Panel: renders prompt textarea, model cards from mocked catalog, aspect segmented control filtered by model, duration pills only for video, cost label "≈ 35 credits", submit disabled when prompt < 2 chars, submit calls mutation with exact `CreateGenerationInput`, insufficient-credits error surfaces inline with a link to /pricing.
- [ ] **Step 2: Implement.** Store holds `{ type, modelId, prompt, aspectRatio, duration, inputImage }` + actions; catalog fetched once with TanStack Query (`staleTime: Infinity`); `createGeneration.ts` = `useMutation` posting to `/api/generations`, on success: image → prepend to gallery cache + toast; video → prepend processing card + navigate stays; on `ApiClientError('insufficient_credits')` → inline banner. ImageDrop: file input + drag-drop → validate type/size (≤10MB) → `FileReader.readAsDataURL` → store. i2v available only when `model.supportsImageInput`.
- [ ] **Step 3: `routes/create.tsx`** — auth-guarded (`beforeLoad` redirects to /login), two-column layout: GeneratorPanel left, live Gallery (Task 17) right; mobile stacks.
- [ ] Commit `feat(web): generator module — prompt, model/aspect/duration, i2v upload, cost`

### Task 17: Gallery module with async polling

**Files:**
- Create: `src/modules/Gallery/model/generationsApi.ts`, `components/GenerationCard.tsx`, `components/GalleryGrid.tsx`, `components/GenerationDetail.tsx`, `index.ts`
- Create: `src/routes/library.tsx`
- Test: `components/GenerationCard.test.tsx`, `components/GalleryGrid.test.tsx`

- [ ] **Step 1: Failing tests.**
  - Card processing: shows Progress with % (from `progress`), pulsing media placeholder, no video element.
  - Card succeeded video: `<video controls src="/media/...mp4">` + download + delete buttons.
  - Card failed: danger border, errorMessage, badge "credits refunded" (i18n), delete button.
  - Grid: loading → 8 skeleton cards; empty → EmptyState with CTA to create; error → ErrorState retry; data → cards + "Load more" when nextCursor.
- [ ] **Step 2: Implement.** `generationsApi.ts`: `useInfiniteQuery(['generations'], GET /api/generations?limit=24&cursor)`; single-item `useQuery(['generation', id])` with `refetchInterval: (q) => (q.state.data?.status === 'processing' ? 4000 : false)`; when item transitions to terminal state → invalidate `['generations']` and `['me']` (refund case). Card uses the single-item query only while processing (otherwise renders list data — no extra requests). Delete: optimistic removal + rollback on error. `routes/library.tsx`: auth-guarded grid page with type filter chips (all/images/videos, client-side).
- [ ] Commit `feat(web): gallery with 4-state cards and 4s polling of processing items`

### Task 18: App shell & navigation

**Files:**
- Create: `src/shared/ui/AppShell.tsx` (header: logo, nav Create/Library/Pricing, BalanceChip, lang switch EN/RU, user menu w/ sign-out)
- Modify: routes to use shell (create/library inside shell; landing/login standalone)
- Test: `src/shared/ui/AppShell.test.tsx` (nav renders, lang switch calls setLanguage, signed-out state shows Sign in button)

- [ ] Implement + test + commit `feat(web): app shell with nav, balance, language switch`

# Phase 4 — Landing, e2e, verification

### Task 19: Landing module (route `/`)

**Files:**
- Create: `src/modules/Landing/components/Hero.tsx`, `PriceTable.tsx`, `HowItWorks.tsx`, `FaqClaims.tsx`, `LandingPage.tsx`, `model/pricingData.ts`, `index.ts`
- Modify: `src/routes/index.tsx`
- Test: `components/PriceTable.test.tsx`, `components/LandingPage.test.tsx`

**Copy rules (from research — legally/factually safe):** claims allowed: «Images from $0.01», «5-second videos from $0.35», «Credits never expire», «No subscription required». Comparison table marked "verified July 2026". NO blanket "cheaper than everything" claim. All strings via i18n (EN+RU).

- [ ] **Step 1: `model/pricingData.ts`** — single config: our price rows (from CATALOG credits × $0.01) vs competitor reference points `{ competitor: 'Higgsfield', item: 'Seedance 5s video', price: 0.83, note: 'Ultra plan effective rate', verifiedAt: '2026-07' }`, Midjourney $0.05/image, Runway $1.15/5s. Test asserts every row has verifiedAt.
- [ ] **Step 2: Failing tests** — PriceTable renders our vs competitor columns with the "verified" caption; LandingPage sections render in order with CTA buttons linking to /create (signed-in) or /login.
- [ ] **Step 3: Implement.** Hero: display-size headline (i18n: en «Create images & video. Pay pennies, not plans.» / ru «Создавай изображения и видео. Плати копейки, а не подписки.»), sub-line with the three claims, primary CTA, and a light live-feel showcase strip (static curated thumbnails from `public/showcase/*.webp` — generate real ones later via the product itself; committed placeholders are plain gradient WEBPs). PriceTable: paper card, our row highlighted accent-soft. HowItWorks: 3 steps (prompt → model → result). FaqClaims: credits never expire / what a credit is / which models.
- [ ] Commit `feat(web): landing with honest price comparison (EN/RU)`

### Task 20: Pricing page (route `/pricing`)

**Files:**
- Create: `src/routes/pricing.tsx` (reuses `PriceTable` + full per-model credit table from catalog query + signup CTA "200 free credits")
- Test: covered by PriceTable tests + route smoke in e2e

- [ ] Implement + commit `feat(web): pricing page with per-model credit table`

### Task 21: Playwright e2e (mocked API)

**Files:**
- Create: `apps/web/playwright.config.ts`, `e2e/generate.spec.ts`, `e2e/mocks.ts`

- [ ] `mocks.ts`: `page.route('/api/**')` handlers — catalog fixture, me fixture (200 credits), POST generations → 202 processing video fixture, GET :id → first call processing/40%, second succeeded with `/media/fake.mp4`; `/media/**` → tiny static mp4 from `e2e/fixtures/`.
- [ ] `generate.spec.ts`: visits `/` → sees hero claim; goes to /create (mock session) → types prompt → picks Swift 5s → sees «≈ 35 credits» → Generate → processing card with progress → auto-transitions to playable video card; balance chip decreased. Second test: landing RU switch shows Russian hero.
- [ ] `playwright.config.ts`: `webServer: { command: 'pnpm dev', port: 5173 }`, chromium only, `use: { baseURL: 'http://localhost:5173' }`.
- [ ] Run `pnpm --filter @opencreate/web e2e` → green. Commit `test(web): e2e happy path with mocked api`

### Task 22: Full verification + docs + wiki

- [ ] Root: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — ALL green (fix anything that isn't).
- [ ] Manual smoke with real key (if RUNWARE_API_KEY present): generate 1 cheapest image (1 credit) end-to-end; verify asset saved under `data/media/` and served from `/media/...`.
- [ ] Write `apps/web/FEATURE.md` + `apps/api/FEATURE.md` (what the app does, module map, how to run/test).
- [ ] Update `docs/wiki/`: index (add openCreate build entry under Workflows), `log.md` entry, and `docs/wiki/architecture/` note linking ADR → implementation.
- [ ] Update README quickstart if commands drifted.
- [ ] Final commit `docs: feature docs + wiki update for MVP`

### Task 23 (stretch, optional): prerender landing for SEO

- [ ] Add `vite-prerender-plugin` (or a `scripts/prerender.ts` that boots the built app with playwright and snapshots `/` into `dist/index.html`). Only if time allows; index.html already carries full meta/OG so this is an enhancement, not a blocker.

---

## Self-review (done at plan time)

- **Spec coverage:** auth+bonus (T5), ledger (T6), catalog (T7), runware (T8), storage/7-day TTL (T9), generation lifecycle incl. refund (T10), me/transactions (T5/T6), SPA scaffold+i18n (T12), design system + error-UX 404/modal/crash/offline (T13), auth UI (T14), credits UI (T15), generator incl. i2v (T16), gallery+polling (T17), shell+lang switch (T18), landing claims (T19), pricing page (T20), e2e (T21), verification+docs (T22), SEO prerender stretch (T23). Payments/presets — non-goals, excluded. ✔
- **Type consistency:** `CreateGenerationInput`/`Generation`/`CatalogModel` names used identically in contracts (T2), API service (T10), and web modules (T16-17). Ledger fns `grantSignupBonus/chargeCredits/refundCredits` consistent T5/T6/T10. `RunwareClient` interface identical T8/T10 and faked in tests. ✔
- **Placeholders:** the only intentionally-deferred bodies are boilerplate whose exact content is dictated by referenced configs (DDL table repetition, locale JSON growth, T10 list/delete test spelled as comment-spec). Each states exactly what to write. ✔
- **Known API risk:** better-auth mount/hook shapes and TanStack Router plugin import names must be checked against installed versions; behavior contracts = the tests, adjust implementation not tests.
