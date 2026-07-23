// apps/web/src/modules/Assets3D/index.ts
// Public API of the Modular 3D Assets module (ADR modular-3d-assets). Routes and
// (later) the module's own stage components import ONLY from 'modules/Assets3D';
// the model/ files stay private behind this barrel.
//
// This is the DATA-LAYER slice of the feature: the server-state hooks over the
// asset3d HTTP surface, the id-keyed live-generation hooks that reuse the shared
// ['generation', id] cache, and the two PURE helpers (price + stage). The
// stage-shaped UI (AssetLibrary, AssetWizard) lands in a later build and will be
// re-exported here then — see the plan Appendix F.
//
// The module stays free of cross-module imports: the catalog + prices are read AT
// THE ROUTE (useCatalog, the /create seam) and handed down as props; other modules
// are reached ONLY through the shared query cache (['generation', id],
// ['generations'], ['me'], ['catalog']), never through an import.

// Asset + part server-state hooks (list/create/patch/delete asset, analyze,
// add/patch/delete part, extract, mesh) and the exported detail cache key.
export {
  assetKey,
  useAssets,
  useAsset,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
  useAnalyze,
  useAddPart,
  useUpdatePart,
  useDeletePart,
  useExtractPart,
  useMeshPart,
} from './model/asset3dApi'

// Live per-part generation status over the shared ['generation', id] cache.
export {
  GENERATION_POLL_MS,
  partPollInterval,
  useLivePartGeneration,
  useLivePartGenerations,
} from './model/partGeneration'

// Pure price model for the paid steps (extract + mesh tier).
export { extractionPrice, meshPrice, meshTierOptions, type MeshTierOption } from './model/assetPricing'

// Pure wizard-stage derivation.
export { deriveStage, type WizardStage } from './model/wizardStage'

// Wizard-local UI state (selection, stage override, spend dialog, gizmo mode).
// Exported for the module's own stage components; routes have no reason to touch it.
export { useWizardStore, type GizmoMode, type WizardUiState } from './model/wizardStore'

// ── The two SCREENS the routes compose ───────────────────────────────────────
// /assets — the library body (4 states + create modal)
export { AssetLibrary } from './components/AssetLibrary'
// /assets/:assetId — the stage-shaped wizard shell
export { AssetWizard } from './components/AssetWizard'
export type { AssetWizardProps } from './components/AssetWizard'
