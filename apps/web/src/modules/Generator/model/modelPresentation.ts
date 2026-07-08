// apps/web/src/modules/Generator/model/modelPresentation.ts
// Client-side PRESENTATION metadata for catalog models — NOT part of the API
// contract. It maps each model id to its provider brand (which inline logo mark
// to draw) and its i18n description key, and derives the display tariff. Pricing
// is never duplicated here: the credit numbers come straight from the catalog
// the API sent (creditsFor lives on the model), we only pair them with the $
// equivalent for the UI.
import type { CatalogModel } from '@opencreate/contracts'

// Provider brands we draw a logo mark for. 'generic' is the fallback so a new
// or unknown model id still renders a mark instead of crashing (see ProviderMark).
export type ProviderId =
  | 'flux'
  | 'pixverse'
  | 'minimax'
  | 'seedance'
  | 'wan'
  | 'kling'
  | 'veo'
  | 'generic'

// The presentation record the select reads per model
export type ModelPresentation = {
  // Which brand actually runs this model → picks the ProviderMark glyph
  provider: ProviderId
  // i18n key of the one-line, honest description
  descriptionKey: string
}

// Which brand runs each catalog model — the two FLUX models share a mark
const PROVIDER_BY_MODEL: Record<string, ProviderId> = {
  'flux-schnell': 'flux',
  'flux-dev': 'flux',
  'pixverse-v6': 'pixverse',
  'minimax-hailuo': 'minimax',
  'seedance-1-5-pro': 'seedance',
  'wan-2-7': 'wan',
  // Self-hosted Wan 2.2 ("Forge") — same Wan brand mark as wan-2-7. Its
  // description string is generator.models.wan-2-2.description in the locales.
  'wan-2-2': 'wan',
  'kling-3-pro': 'kling',
  'veo-3-1-fast': 'veo',
}

// i18n description key for a model id (strings live in generator.models.<id>)
export function descriptionKeyFor(modelId: string): string {
  return `generator.models.${modelId}.description`
}

// The presentation metadata for a model id, with a safe fallback for unknowns
export function presentationFor(modelId: string): ModelPresentation {
  return {
    provider: PROVIDER_BY_MODEL[modelId] ?? 'generic',
    descriptionKey: descriptionKeyFor(modelId),
  }
}

// One credit is worth $0.01 to the user (design.md claim: $0.01 images). The
// display tariff pairs the credit price with that dollar equivalent.
const USD_PER_CREDIT = 0.01

export type ModelTariff = {
  // Credit price shown to the user (image = flat; video = its BASE duration)
  credits: number
  // Dollar equivalent, already formatted to cents ("0.35")
  dollars: string
}

// The display tariff: images charge a flat rate; videos quote their BASE
// (first) duration price — durationOptions[0] — so the tariff is one honest
// number the user can compare across models at a glance.
export function tariffFor(model: CatalogModel): ModelTariff {
  const credits =
    model.type === 'image'
      ? model.credits
      : (model.creditsByDuration[String(model.durationOptions[0])] ?? 0)
  return { credits, dollars: (credits * USD_PER_CREDIT).toFixed(2) }
}
