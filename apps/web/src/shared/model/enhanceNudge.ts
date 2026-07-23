// apps/web/src/shared/model/enhanceNudge.ts
// The one-per-session dismissed flag for the enhance nudge tooltip. A tiny
// Zustand singleton (not sessionStorage) so the "seen it once" decision is
// SHARED across both surfaces and every route in the SPA session: nudged on
// /create, the user is not nudged again in the Cinema shot prompt. It resets on
// a full reload, which is the right grain for a gentle, non-repeating hint.
import { create } from 'zustand'

export type EnhanceNudgeState = {
  // true once the hint has been shown or dismissed this session — arming stops.
  dismissed: boolean
  // Mark the hint spent for the rest of the session (idempotent).
  dismiss: () => void
}

export const useEnhanceNudge = create<EnhanceNudgeState>((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
}))
