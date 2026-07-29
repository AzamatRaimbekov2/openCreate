// Compare utility contracts (hidden /compare page): POST /api/compare/generate
// is a DIRECT DeepInfra image channel for model evaluation — it deliberately
// bypasses the credit ledger (an operator tool spends provider USD, not user
// credits) and returns the image INLINE as a data: URL because DeepInfra's
// Qwen-Image-Max replies with base64 PNGs, not hosted URLs.
import { z } from 'zod'

// Same prompt bounds as createGenerationInputSchema — the compare page tests
// prompts users would actually submit, so the accepted range must match.
export const compareGenerateInputSchema = z.object({
  prompt: z.string().min(2).max(2000),
})
export type CompareGenerateInput = z.infer<typeof compareGenerateInputSchema>

export const compareGenerateResultSchema = z.object({
  // data:image/png;base64,… straight from DeepInfra — never persisted, never
  // fetched by the API (no SSRF surface); the SPA renders it directly.
  imageUrl: z.string(),
  // DeepInfra's OWN per-request USD figure (inference_status.cost); null when
  // the provider omits it — the SPA then hides the cost chip.
  costUsd: z.number().nullable(),
  // Server-measured wall time of the provider call — the comparison metric.
  durationMs: z.number().int().nonnegative(),
})
export type CompareGenerateResult = z.infer<typeof compareGenerateResultSchema>
