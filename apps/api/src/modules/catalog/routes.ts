// GET /api/catalog (plan Task 7). Public on purpose — the landing/pricing page
// must render model names and credit prices before sign-in, and the catalog
// contains nothing user-specific or secret (AIR ids are public Runware ids).
import type { FastifyInstance } from 'fastify'
import { CATALOG } from './catalog'

// `comfyConfigured` = COMFY_BASE_URL is set. When self-host is OFF, hide the
// wan-runpod models: listing a model whose backend can't run only produces a
// selectable option that always errors. The models stay in CATALOG (backend
// routing/tests unchanged) — they just aren't offered to the UI until a pod
// is configured.
export function registerCatalogRoutes(app: FastifyInstance, comfyConfigured: boolean) {
  const models = comfyConfigured ? CATALOG : CATALOG.filter((m) => m.type !== 'video' || m.provider !== 'wan-runpod')
  // Shape matches contracts catalogResponseSchema: { models: CatalogModel[] }.
  app.get('/api/catalog', async () => ({ models }))
}
