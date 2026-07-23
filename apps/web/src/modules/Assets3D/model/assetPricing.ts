// apps/web/src/modules/Assets3D/model/assetPricing.ts
// PURE price model for the two paid steps (extract + mesh). Mirrors the SERVER
// model rule ONLY to PRICE the button BEFORE the click (design.md §9: a paid
// action prints its price first). No network, no side effects — the arithmetic
// behind every priced button, unit-tested (the Soul portraitSheet precedent).
//
// It returns `null` — never 0, never a guess — whenever the catalog is absent or
// the matching model is missing: a null price renders a Skeleton and DISABLES the
// button, because a guessed number over real credits is a money bug.
import type { CatalogModel } from '@opencreate/contracts'

// The image member of the catalog union (carries the flat `credits` the extractor
// is charged). Narrowed via the discriminant so `.credits` is type-safe.
type ImageModel = Extract<CatalogModel, { type: 'image' }>
// The model3d member (flat-priced per mesh) — the tier picker's rows.
type Model3d = Extract<CatalogModel, { type: 'model3d' }>

// Extraction price = the credits of the reference-capable IMAGE model the server
// picks (type 'image' + a set `referenceMode`) — selected by the SAME discriminator
// as the API's pickExtractionModel, never a hardcoded id, so a catalog re-price or
// model swap moves the printed number automatically. `null` if none is present.
export function extractionPrice(models: CatalogModel[]): number | null {
  const model = models.find(
    (m): m is ImageModel => m.type === 'image' && m.referenceMode != null,
  )
  return model ? model.credits : null
}

// One mesh-tier option for the per-part picker: a model3d catalog row with its
// flat price. `value` is the { modelId } the mesh mutation sends.
export type MeshTierOption = {
  // The model3d catalog id — the tier the user picks
  value: string
  // Display name (e.g. 'TRELLIS.2')
  label: string
  // Flat credit price for this tier (model3d is flat-priced per mesh)
  credits: number
}

// The model3d rows for the tier picker, in catalog display order.
export function meshTierOptions(models: CatalogModel[]): MeshTierOption[] {
  return models
    .filter((m): m is Model3d => m.type === 'model3d')
    .map((m) => ({ value: m.id, label: m.name, credits: m.credits }))
}

// Mesh price for the user-picked tier id. `null` when the catalog is missing the
// id or the id is not a model3d — never a fallback number.
export function meshPrice(models: CatalogModel[], modelId: string): number | null {
  const model = models.find((m): m is Model3d => m.type === 'model3d' && m.id === modelId)
  return model ? model.credits : null
}
