// apps/web/src/modules/Assets3D/model/wizardStore.ts
// Zustand store for the wizard's LOCAL UI state — and nothing else. Every fact
// about the asset (its parts, their derived statuses, the cited generations)
// lives in TanStack Query under ['asset3d', id] / ['generation', id]; this store
// holds only what the SERVER has no opinion about: which part the user clicked,
// which stage they navigated back to, which spend dialog is open, and which
// buttons are mid-flight.
//
// WHY a store rather than useState in AssetWizard: these five facts are read by
// components that are siblings, not ancestors — the stage rail sets the override
// the stage body reads, the parts checklist selects the part the assembly gizmo
// then grabs, and the extract grid's batch dialog is opened from a row and
// answered by the modal. Threading all of that through props would turn the
// wizard shell into a prop bus for state it does not itself use.
//
// The two id LISTS (extractingIds / meshingIds) are deliberately optimistic UI
// only. The truth of "is this part extracting" is the part's DERIVED status from
// the server; these exist for the gap between the click and the aggregate
// refetch, so a just-clicked button can pulse instead of looking dead. Never
// branch money or correctness on them.
import { create } from 'zustand'
import type { WizardStage } from './wizardStage'

// The assembly gizmo's active manipulation mode (drei TransformControls modes).
export type GizmoMode = 'translate' | 'rotate' | 'scale'

export type WizardUiState = {
  // The part the user is working on. ONE field, not one per stage: the parts
  // checklist, the extraction grid and the assembly gizmo are all answering the
  // same question ("which part am I on"), and they are never on screen together
  // — a second field would only let the two selections silently disagree.
  selectedPartId: string | null
  // The completed stage the user navigated BACK to via the rail; null = follow
  // deriveStage. Cleared whenever the asset advances (the wizard resets it when
  // the user acts), so the override is a detour, not a new home.
  stageOverride: WizardStage | null
  // The parts a batch extract has been REQUESTED for but not yet paid: the spend
  // alertdialog is open exactly while this is non-null (the SoulSheet
  // pendingViews precedent — the dialog's open state IS the pending set, so the
  // two can never disagree about what is about to be charged).
  pendingExtractIds: string[] | null
  // Parts whose extract mutation is in flight — UI pulse only (see header note).
  extractingIds: string[]
  // Parts whose mesh mutation is in flight — UI pulse only.
  meshingIds: string[]
  // Which handle the assembly gizmo shows. Translate is the default because
  // placing a part is the first thing anyone does with a loose mesh.
  gizmoMode: GizmoMode

  // Actions
  selectPart: (partId: string | null) => void
  setStageOverride: (stage: WizardStage | null) => void
  requestExtract: (partIds: string[]) => void
  cancelExtract: () => void
  setExtracting: (partIds: string[]) => void
  setMeshing: (partIds: string[]) => void
  setGizmoMode: (mode: GizmoMode) => void
  // Full reset — the wizard calls it when it mounts on a DIFFERENT asset, so a
  // selection or an open spend dialog cannot leak across assets (the store is a
  // module singleton; the route param is not).
  reset: () => void
}

// The pristine slice, kept separate so `reset` cannot drift from the initializer.
const INITIAL = {
  selectedPartId: null,
  stageOverride: null,
  pendingExtractIds: null,
  extractingIds: [],
  meshingIds: [],
  gizmoMode: 'translate',
} satisfies Omit<
  WizardUiState,
  | 'selectPart'
  | 'setStageOverride'
  | 'requestExtract'
  | 'cancelExtract'
  | 'setExtracting'
  | 'setMeshing'
  | 'setGizmoMode'
  | 'reset'
>

export const useWizardStore = create<WizardUiState>((set) => ({
  ...INITIAL,
  selectPart: (selectedPartId) => set({ selectedPartId }),
  setStageOverride: (stageOverride) => set({ stageOverride }),
  requestExtract: (partIds) => set({ pendingExtractIds: partIds }),
  // Answering the dialog either way clears the pending set; the CONFIRM path
  // separately moves those ids into extractingIds, so the dialog closes the
  // instant the money is committed rather than holding a spinner (design.md §9).
  cancelExtract: () => set({ pendingExtractIds: null }),
  setExtracting: (extractingIds) => set({ extractingIds }),
  setMeshing: (meshingIds) => set({ meshingIds }),
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),
  reset: () => set(INITIAL),
}))
