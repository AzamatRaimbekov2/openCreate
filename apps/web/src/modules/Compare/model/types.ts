// apps/web/src/modules/Compare/model/types.ts
// Panel-level types for the hidden /compare model-evaluation page. One
// PanelResult per provider, each moving through the 4 mandatory UI states
// independently — a provider failure must never darken its neighbors.

// The three contenders. Two ride the PRODUCTION pipeline (POST /api/generations
// → Runware, spends credits — comparing the real path is the point) and one is
// the DeepInfra candidate behind POST /api/compare/generate (spends USD).
export type CompareProviderId = 'flux-dev' | 'nano-banana-pro' | 'qwen-image-max'

export type PanelStatus = 'empty' | 'loading' | 'error' | 'success'

export type PanelResult = {
  status: PanelStatus
  // Present on success: a /media/… URL (catalog models) or a data: URL (Qwen).
  imageUrl?: string
  // Present on error: user-safe message (never raw provider text — the API
  // already sanitizes its envelopes).
  error?: string
  // Present on success: wall time. Client-measured for catalog models,
  // server-measured for Qwen (contracts durationMs) — both are honest "how
  // long did the user wait" numbers.
  durationMs?: number
  // Present on success when known: pre-formatted cost chip ("2 cr" / "$0.075").
  // Formatted at the service layer because the UNITS differ per channel —
  // credits vs USD — and the panel must not know which channel it renders.
  costLabel?: string
}
