// GET /api/catalog (plan Task 7). Public on purpose — the landing/pricing page
// must render model names and credit prices before sign-in, and the catalog
// contains nothing user-specific or secret (AIR ids are public Runware ids).
import type { FastifyInstance } from 'fastify'
import { CATALOG } from './catalog'

export function registerCatalogRoutes(app: FastifyInstance) {
  // Shape matches contracts catalogResponseSchema: { models: CatalogModel[] }.
  app.get('/api/catalog', async () => ({ models: CATALOG }))
}
