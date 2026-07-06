// e2e API mocks (plan Task 21). Every /api и /media request is intercepted at
// the browser level with page.route, so the e2e suite runs against the REAL
// SPA (vite dev server) with a fully scripted backend — no Fastify process, no
// Runware key, fully deterministic. State lives per-install (one object per
// test) so the flow can evolve: empty gallery → processing card → succeeded.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page, Route } from '@playwright/test'

// ——— fixtures ————————————————————————————————————————————————————————————

// Signed-in better-auth session (GET /api/auth/get-session). Field set mirrors
// better-auth 1.6's wire shape; expiresAt far in the future so the client
// never treats it as stale mid-test.
const SESSION = {
  session: {
    id: 'sess-e2e',
    token: 'tok-e2e',
    userId: 'user-e2e',
    expiresAt: '2030-01-01T00:00:00.000Z',
    createdAt: '2026-07-06T00:00:00.000Z',
    updatedAt: '2026-07-06T00:00:00.000Z',
    ipAddress: '',
    userAgent: 'playwright',
  },
  user: {
    id: 'user-e2e',
    email: 'e2e@opencreate.dev',
    name: 'E2E',
    emailVerified: false,
    image: null,
    createdAt: '2026-07-06T00:00:00.000Z',
    updatedAt: '2026-07-06T00:00:00.000Z',
  },
}

// Catalog subset (contracts catalogResponseSchema shape): one image model and
// the Swift video model the happy path picks — 5s = 35 credits.
const CATALOG = {
  models: [
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
  ],
}

const GENERATION_ID = 'gen-e2e-1'
const MEDIA_URL = `/media/${GENERATION_ID}.mp4`
export const START_BALANCE = 200
export const COST = 35

// One Generation DTO per lifecycle stage (contracts generationSchema shape)
function generationFixture(prompt: string, stage: 'processing' | 'polling' | 'succeeded') {
  return {
    id: GENERATION_ID,
    type: 'video',
    mode: 'text',
    status: stage === 'succeeded' ? 'succeeded' : 'processing',
    prompt,
    modelId: 'pixverse-v6',
    params: { aspectRatio: '1:1', duration: 5 },
    costCredits: COST,
    mediaUrls: stage === 'succeeded' ? [MEDIA_URL] : [],
    progress: stage === 'processing' ? 0 : stage === 'polling' ? 40 : 100,
    errorMessage: null,
    createdAt: '2026-07-06T10:00:00.000Z',
    completedAt: stage === 'succeeded' ? '2026-07-06T10:01:00.000Z' : null,
  }
}

// ——— route installer ——————————————————————————————————————————————————————

export type MockOptions = {
  // Signed-in vs anonymous visitor (anonymous: landing/login flows)
  signedIn?: boolean
}

export async function installApiMocks(page: Page, { signedIn = true }: MockOptions = {}) {
  // Mutable per-test state: what the "backend" believes right now
  const state = {
    created: false, // POST /api/generations happened
    prompt: '',
    polls: 0, // GET /api/generations/:id calls since creation
  }

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  // The generation reaches its terminal state on the second poll: first GET
  // answers processing/40 (progress UI must render), the next one succeeds —
  // exactly the transition the SPA's 4s polling is built around.
  const currentGeneration = () => {
    if (state.polls === 0) return generationFixture(state.prompt, 'processing')
    if (state.polls === 1) return generationFixture(state.prompt, 'polling')
    return generationFixture(state.prompt, 'succeeded')
  }

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const { pathname } = url
    const method = route.request().method()

    // better-auth session endpoint — the ONLY auth call the SPA needs here
    // (requireSession guard + useAuthSession). Anonymous = JSON null.
    if (pathname === '/api/auth/get-session') {
      return json(route, signedIn ? SESSION : null)
    }

    // Ledger-accurate profile: balance drops by the charge after creation
    if (pathname === '/api/me') {
      if (!signedIn)
        return json(route, { error: { code: 'unauthorized', message: 'Sign in required' } }, 401)
      return json(route, {
        id: 'user-e2e',
        email: 'e2e@opencreate.dev',
        name: 'E2E',
        creditsBalance: state.created ? START_BALANCE - COST : START_BALANCE,
      })
    }

    if (pathname === '/api/catalog') {
      return json(route, CATALOG)
    }

    if (pathname === '/api/generations' && method === 'POST') {
      const body = route.request().postDataJSON() as { prompt: string }
      state.created = true
      state.prompt = body.prompt
      // 202 = video accepted, still processing (images would be 201)
      return json(route, generationFixture(state.prompt, 'processing'), 202)
    }

    // The list must agree with the poll state: after the terminal transition
    // the SPA invalidates ['generations'] and refetches — an empty answer here
    // would wipe the freshly succeeded card out of the cache.
    if (pathname === '/api/generations' && method === 'GET') {
      return json(route, { items: state.created ? [currentGeneration()] : [], nextCursor: null })
    }

    if (pathname === `/api/generations/${GENERATION_ID}` && method === 'GET') {
      state.polls += 1
      return json(route, currentGeneration())
    }

    if (pathname === '/api/credits/transactions') {
      return json(route, { items: [] })
    }

    // Fail loudly on anything unscripted — a silent 404 would surface as a
    // confusing UI state instead of pointing at the missing mock.
    return json(route, { error: { code: 'not_found', message: `no mock for ${pathname}` } }, 404)
  })

  // Generated media: the tiny committed mp4 — enough for <video> to mount and
  // the /media request to resolve 200 without a real storage dir.
  await page.route('**/media/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'video/mp4',
      body: readFileSync(join(import.meta.dirname, 'fixtures/tiny.mp4')),
    }),
  )
}
