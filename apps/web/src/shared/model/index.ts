// apps/web/src/shared/model/index.ts
// Public API of the shared data/state layer — domain-agnostic hooks and stores
// that more than one module drives. Import from 'shared/model' only.
export { useEnhancePrompt } from './enhancePrompt'
export { useEnhanceNudge } from './enhanceNudge'
export type { EnhanceNudgeState } from './enhanceNudge'
