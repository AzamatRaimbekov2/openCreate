// GET /api/catalog (plan Task 7). Public on purpose — the landing/pricing page
// must render model names and credit prices before sign-in, and the catalog
// contains nothing user-specific or secret (AIR ids are public Runware ids).
import type { FastifyInstance } from 'fastify'
import type { VideoProviderId } from '@opencreate/contracts'
import { CATALOG } from './catalog'

// Which video backends this deployment can actually reach. Runware is the
// always-on baseline (its key is required at boot); the optional providers are
// each keyed off their own env — COMFY_BASE_URL for the self-hosted pod,
// ARK_API_KEY for the direct ByteDance channel.
//
// A model whose backend is unconfigured is WORSE than a missing model: it is a
// selectable option that walks the user through model → prompt → aspect →
// duration and only then fails at submit. So the catalog hides them. The entries
// stay in CATALOG (routing and tests are unchanged, and setting the env is enough
// to light them up) — they are simply not offered.
//
// This replaced a boolean `comfyConfigured` flag: with a second optional provider
// the boolean would have become two booleans, then three. A set of the providers
// that ARE configured says the same thing once and never needs widening again.
export function registerCatalogRoutes(
  app: FastifyInstance,
  configuredProviders: ReadonlySet<VideoProviderId>,
) {
  const models = CATALOG.filter(
    // Video only: image and audio models are always Runware, which is always on.
    // A video model with no explicit provider is a Runware model by default.
    (m) => m.type !== 'video' || configuredProviders.has(m.provider ?? 'runware'),
  )
  // Shape matches contracts catalogResponseSchema: { models: CatalogModel[] }.
  app.get('/api/catalog', async () => ({ models }))
}
