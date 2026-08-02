// apps/web/src/modules/Compare/index.ts
// Public API of the Compare module (hidden /compare model-evaluation page).
// Routes compose ONLY through these exports — no deep imports.
export { CompareForm } from './components/CompareForm'
export type { CompareFormProps } from './components/CompareForm'
export { GenerationPanel } from './components/GenerationPanel'
export type { GenerationPanelProps } from './components/GenerationPanel'
export { useCompareStore } from './model/compareStore'
export type { CompareStore } from './model/compareStore'
export { COMPARE_PROVIDERS } from './model/providers'
export type { CompareProvider } from './model/providers'
export type { CompareProviderId, PanelResult, PanelStatus } from './model/types'
// /compare-video — the Seedance 2.0 cost receipt (DeepInfra vs kie.ai). Separate
// surface from the image page above: same module, different question (which PIPE
// is cheaper for one model, not which MODEL looks better).
export { VideoCostPanel } from './components/VideoCostPanel'
export type { VideoCostPanelProps } from './components/VideoCostPanel'
export {
  estimateRunCost,
  useVideoCompareStore,
  VIDEO_DURATIONS,
  VIDEO_MODELS,
  VIDEO_RESOLUTIONS,
} from './model/videoCompareStore'
export type {
  VideoCompareStore,
  VideoModelId,
  VideoResolution,
} from './model/videoCompareStore'
export type { CompareVideoPanel, VideoChannelId, VideoRunState } from './model/videoTypes'
// /verify — the single-channel Seedance 2.0 smoke test. Same module, third question:
// not "which model looks better" and not "which pipe is cheaper", but "does this one
// channel actually work end to end, and what exactly does it send back".
export {
  useVerifyStore,
  VERIFY_DURATION_SECONDS,
  VERIFY_MODEL,
  VERIFY_RESOLUTION,
} from './model/verifyStore'
export type { VerifyRunState, VerifyStore } from './model/verifyStore'
