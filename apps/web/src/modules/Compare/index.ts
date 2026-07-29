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
