// DeepInfra Qwen-Image-Max client — the /compare utility's candidate model.
//
// WHY A SEPARATE FILE from deepinfra-client.ts: that adapter implements the
// VideoProvider seam (submit → jobId → poll, detached, in-process job map)
// because the money path REQUIRES async settlement. This endpoint has no money
// path — /compare charges nothing and nobody polls — so the honest shape is a
// single synchronous call that blocks for the render (~10-40s) and returns the
// image inline. Reusing the video adapter here would drag the jobId/map
// machinery into a page that exists to measure one number: wall time.
//
// CONTRACT VERIFIED LIVE (2026-07-29) against api.deepinfra.com/models/
// Qwen/Qwen-Image-Max — NOT copied from the plan doc, whose guessed shape
// (`resolution`/`aspect_ratio` in, `image_url` out) does not exist:
//   in : { prompt (required), size "W*H" (default 1280*1280), num_images,
//          negative_prompt, prompt_extend (default true), watermark, seed }
//   out: { images: [data-URL png], nsfw_content_detected: [bool], seed,
//          inference_status: { cost (USD), runtime_ms } }
// Pricing: image_units at 7.5¢/image.

const BASE = 'https://api.deepinfra.com/v1/inference'
const MODEL_ID = 'Qwen/Qwen-Image-Max'
// The whole render happens inside this ONE request (same rationale as the
// Seedance adapter's long timeout) — but images are ~10-40s, so 120s bounds a
// hung socket while never cutting off a slow-but-live render. This is also the
// number the /compare UI shows as the countdown ceiling.
export const QWEN_IMAGE_TIMEOUT_MS = 120_000
// 1280*1280 = their documented default tier; pinned explicitly so the size we
// benchmarked is the size we keep benchmarking even if their default moves.
const SIZE = '1280*1280'

// Sanitized provider error, shaped like DeepinfraError/RunwareError (statusCode
// + apiCode) so app.ts's central handler maps it straight to the { error:
// { code, … } } envelope. The upstream's own words stay OFF `message` (they can
// name an account or a balance) and travel on `providerDetail`, which the
// handler logs but never serializes to the browser.
export class DeepinfraImageError extends Error {
  statusCode: number
  apiCode: string
  providerDetail?: string
  constructor(
    message: string,
    opts?: { statusCode?: number; apiCode?: string; providerDetail?: string },
  ) {
    super(message)
    this.name = 'DeepinfraImageError'
    this.statusCode = opts?.statusCode ?? 502
    this.apiCode = opts?.apiCode ?? 'provider_error'
    if (opts?.providerDetail !== undefined) this.providerDetail = opts.providerDetail
  }
}

// Their reply envelope (out_schema, fetched from the model's own metadata).
type QwenImageReply = {
  images?: string[]
  inference_status?: { cost?: number }
  detail?: string
}

export type QwenImageResult = {
  // data:image/png;base64,… — returned inline to the caller, never persisted.
  imageUrl: string
  // DeepInfra's own USD figure for THIS request; null when omitted.
  costUsd: number | null
}

// One synchronous inference call. THROWS DeepinfraImageError for every failure
// (unlike the video adapter's never-throw poll union) because the compare route
// has no settlement to protect — the central error handler is exactly the right
// place for a utility endpoint's failures to land.
//
// `fetchImpl` is injected for tests (same seam as createGroqCompleter).
export async function generateQwenImage(
  apiKey: string,
  prompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<QwenImageResult> {
  let res: Response
  try {
    res = await fetchImpl(`${BASE}/${MODEL_ID}`, {
      method: 'POST',
      headers: {
        // lowercase 'bearer' is what their own curl example sends
        Authorization: `bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        size: SIZE,
        // Explicitly off — an evaluation image with a watermark would poison
        // the visual comparison the page exists for.
        watermark: false,
        // prompt_extend stays at their default (true): that is how the model
        // ships in production, and the page compares production behaviors.
      }),
      signal: AbortSignal.timeout(QWEN_IMAGE_TIMEOUT_MS),
    })
  } catch (err) {
    // AbortSignal.timeout aborts with a DOMException named 'TimeoutError' —
    // distinguish it so the UI can say "timed out" instead of "network error".
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new DeepinfraImageError('image generation timed out (120s limit)')
    }
    throw new DeepinfraImageError('DeepInfra request failed', {
      providerDetail: err instanceof Error ? err.message : String(err),
    })
  }

  const parsed = (await res.json().catch(() => null)) as QwenImageReply | null

  if (!res.ok) {
    // Their `detail` can name an account id or a balance; it never reaches the
    // browser — logged via providerDetail only.
    throw new DeepinfraImageError(`DeepInfra HTTP ${res.status}`, {
      ...(parsed?.detail !== undefined ? { providerDetail: parsed.detail } : {}),
    })
  }

  const imageUrl = parsed?.images?.[0]
  if (!imageUrl) {
    throw new DeepinfraImageError('DeepInfra returned no image')
  }

  return { imageUrl, costUsd: parsed?.inference_status?.cost ?? null }
}
