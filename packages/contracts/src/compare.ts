// Compare utility contracts (hidden /compare page): POST /api/compare/generate
// is a DIRECT DeepInfra image channel for model evaluation — it deliberately
// bypasses the credit ledger (an operator tool spends provider USD, not user
// credits) and returns the image INLINE as a data: URL because DeepInfra's
// Qwen-Image-Max replies with base64 PNGs, not hosted URLs.
import { z } from 'zod'
import { apiErrorCodeSchema } from './errors'

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

// ── VIDEO cost verification (POST /api/compare/video) ────────────────────────
// WHY THIS EXISTS. The question "which Seedance channel is cheaper" kept being
// answered from rate cards, and rate cards lie in a specific way: every provider
// publishes TWO prices per resolution ("with video input" billed over input+output
// duration, "no video input" billed over output only). We are always on the "no
// video" row, comparison blogs quote the other one, and the conclusion inverts.
//
// So this endpoint refuses to estimate. It runs ONE prompt through TWO channels at
// IDENTICAL settings and reports each provider's OWN cost figure — DeepInfra's
// `inference_status.cost` and kie.ai's `creditsConsumed` × $0.005. Not a rate card:
// a receipt.
//
// THE MODEL IS SEEDANCE 2.0 ON BOTH SIDES. Comparing two different models measures
// the models, not the pipes, and the open question is which pipe is cheaper for
// byte-identical settings. DeepInfra resells ByteDance's own list price; kie.ai
// resells fal's (which is ~2× ByteDance), discounted ~32% — so the rate cards say
// kie.ai should lose here by roughly a third. This endpoint exists to check that
// against two real receipts instead of two spreadsheets.
export const compareVideoInputSchema = z.object({
  prompt: z.string().min(2).max(2000),
  // WHICH model both channels run. Added because verifying the page itself should
  // not cost $1.86: Seedance 2.0 is the expensive question, but 1.5 Pro answers
  // "does this page work end to end" for roughly a tenth of that, and both channels
  // carry it (kie.ai `bytedance/seedance-1.5-pro`, DeepInfra
  // `ByteDance/Seedance-1.5-Pro` — the latter confirmed live, it answers 402 on an
  // empty balance rather than 404).
  //
  // The value is a CATALOG id, not a provider handle: each channel spells the same
  // model differently and the route owns that translation.
  model: z.enum(['seedance-2-0', 'seedance-1-5-pro']).default('seedance-2-0'),
  // Ask each channel to attach its RAW terminal envelope to the panel. Off by
  // default so the ordinary compare page never carries provider prose; the operator
  // verification page turns it on, because on an unobserved channel the raw body is
  // the only thing that distinguishes "produced nothing" from "produced something
  // under a key we did not read".
  debug: z.boolean().default(false),
  // Restrict the run to these channels. Absent → whatever the server has enabled.
  //
  // The server INTERSECTS this with its own list rather than obeying it: a request
  // must never be able to spend money on a channel the operator deliberately parked
  // (an empty DeepInfra balance, say). Narrowing is allowed, widening is not.
  channels: z.array(z.string()).optional(),
  // 4-15s is what DeepInfra's Seedance 2.0 schema accepts (their `duration: -1`
  // "model decides" range). The catalog sells 5/10/15; the page allows the whole
  // band because an operator probing a price curve wants the in-between points too.
  durationSeconds: z.number().int().min(4).max(15).default(5),
  // Drives BOTH channels identically — the whole point is that neither side gets a
  // cheaper tier by accident. 1080p costs ~2× 720p on both, so a mismatch here
  // would produce exactly the bogus comparison this page exists to kill.
  resolution: z.enum(['480p', '720p', '1080p']).default('720p'),
})
export type CompareVideoInput = z.infer<typeof compareVideoInputSchema>

// One channel's outcome. Never a thrown error: a channel that fails still has to
// render its panel, because "this provider refused the job" IS a comparison result.
export const compareVideoPanelSchema = z.object({
  // Which pipe ran it — 'deepinfra' | 'kie'. Kept as a plain string so adding a
  // third contender is a server-side array entry, not a contract migration.
  channel: z.string(),
  // Human label for the panel header (the model's public name + the pipe).
  label: z.string(),
  status: z.enum(['success', 'error']),
  // Hosted provider URL (both channels return one; kie.ai's expires in 24h, which
  // is fine for a measurement page that never persists the asset).
  videoUrl: z.string().nullable(),
  // The provider's OWN figure for this exact job, in USD. null when the provider
  // omitted it — the panel then shows no cost chip rather than a guess.
  costUsd: z.number().nullable(),
  // kie.ai only: the raw credit count they deducted, shown next to the USD so the
  // conversion is auditable instead of trusted.
  creditsConsumed: z.number().nullable(),
  // Server-measured wall time from submit to terminal state — the second axis of
  // the comparison, since a channel that is cheaper but 4× slower is not cheaper.
  durationMs: z.number().int().nonnegative(),
  // MACHINE-READABLE failure category, never prose. The SPA renders it through the
  // shared `errorCodeMessageKey` → i18n layer like every other failure in the app.
  //
  // This replaced a free-text `error` field, and the reason is worth keeping: that
  // field put strings like "kie.ai rejected the job (HTTP 200)" and "DeepInfra
  // balance is empty (HTTP 402)" straight on screen. Both leak a provider name and a
  // status code, both are untranslated, and neither told the operator the ONE thing
  // that mattered — that the account needed topping up. The provider's own words now
  // stay in the server log (`compare.channel_failed`), where they belong.
  //
  // Reuses the app-wide closed enum rather than inventing page-local vocabulary, so
  // a new code cannot be added without copy existing for it.
  errorCode: apiErrorCodeSchema.nullable(),
  // The provider's RAW terminal envelope, JSON-stringified — diagnostics only.
  //
  // WHY A PAGE THAT REFUSES TO SHOW SERVER TEXT NOW SHIPS SERVER TEXT: because on a
  // channel whose success shape has never been observed, "success, no video" and
  // "success, video under a key we did not look for" are indistinguishable without
  // it, and telling them apart costs a $2.27 render each time. This field is NOT the
  // failure copy — that stays `errorCode` → i18n. It renders in a collapsed <details>
  // block on the operator page and nowhere else.
  //
  // Null unless the route was asked for it (`debug: true`), so the ordinary compare
  // page keeps its no-raw-text guarantee intact.
  rawResponse: z.string().nullable(),
})
export type CompareVideoPanel = z.infer<typeof compareVideoPanelSchema>

export const compareVideoResultSchema = z.object({
  // Echoed back so a screenshot of the page is self-describing — a cost table
  // without its settings is the thing that started this whole confusion.
  prompt: z.string(),
  durationSeconds: z.number().int(),
  resolution: z.string(),
  panels: z.array(compareVideoPanelSchema),
})
export type CompareVideoResult = z.infer<typeof compareVideoResultSchema>
