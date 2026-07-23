// apps/web/src/modules/Assets3D/model/wizardStage.ts
// PURE stage derivation for the linear wizard (ADR D6). The wizard is
// STAGE-shaped, not page-shaped: ONE $assetId route whose component derives the
// active stage from the loaded asset + parts state (mirroring FilmEditor being a
// single workbench and SoulStudio owning the draft). Keeping the derivation pure
// and here — not tangled into the component — is what lets us unit-test every
// transition with no network and no render.
//
// The order of the checks IS the flow: the wizard sits at the FURTHEST-BACK
// incomplete stage, so a single still-draft part keeps the user on Parts even if
// siblings are already meshing. An explicit `override` (the user navigating back
// to a completed stage via the rail) short-circuits everything.
import type { Asset3d, Asset3dPart } from '@opencreate/contracts'

// The five linear stages, in flow order.
export type WizardStage = 'upload' | 'parts' | 'extract' | 'mesh' | 'assembly'

// Derive the active stage from the aggregate. `override` is the completed stage
// the user navigated back to; when present it wins (manual back-nav).
export function deriveStage(
  asset: Asset3d | null,
  parts: Asset3dPart[],
  override?: WizardStage | null,
): WizardStage {
  // Manual back-nav to a completed stage always wins.
  if (override != null) return override
  // No asset loaded yet (pre-create / not-found calm state) → the upload entry.
  if (asset === null) return 'upload'
  // An asset with no parts → Parts (analyze for free, or add by hand).
  if (parts.length === 0) return 'parts'
  // Any still-draft part (never extracted) keeps the user on Parts.
  if (parts.some((p) => p.status === 'draft')) return 'parts'
  // Any part extracted-but-not-yet-meshed → Extract (there is extraction work in
  // view). Checked BEFORE mesh so the furthest-back incomplete stage wins.
  if (parts.some((p) => p.status === 'extracting' || p.status === 'extracted')) return 'extract'
  // Any part mid-mesh → Mesh.
  if (parts.some((p) => p.status === 'meshing')) return 'mesh'
  // Every part is ready → Assembly.
  return 'assembly'
}
