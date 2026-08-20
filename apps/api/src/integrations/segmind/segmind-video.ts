// Segmind adapter — the CHEAPEST verified channel for Seedance 2.0.
//
// WHY THIS PROVIDER EXISTS. Seedance 2.0 is billed by token everywhere, and the
// token count is fixed by the output (see TOKENS_PER_SECOND below), so the ONLY
// thing that varies between channels is the rate per million. Surveyed 2026-08-02:
//
//   Segmind            $7.00/M flat on every resolution
//   ByteDance direct   $7.00/M at 480p/720p, $7.70/M at 1080p
//   DeepInfra          $7.70/M — MEASURED on our own invoice, see deepinfra-client
//   ofox.ai            $7.00/M at 1080p, $7.41/M at 720p
//   kie.ai             ~$9.5-10.5/M
//   fal / Replicate    ~$14/M
//
// $7.00/M is the floor: it is ByteDance's own no-video-input rate, and three
// independent resellers sit exactly on it. Segmind is notable for holding that flat
// rate at 1080p, where the manufacturer itself charges $7.70 — i.e. 1080p here is
// cheaper than buying it from ByteDance directly, and with no $29.40 resource pack.
//
// ── WHAT IS VERIFIED AND WHAT IS NOT ─────────────────────────────────────────
// VERIFIED by free probes on 2026-08-02 (no credits spent):
//   · POST /v2/{model} is the ASYNC submit — answered 402 "Insufficient credits"
//     with a valid body, so the route exists and parsed our payload.
//   · GET /v2/requests/{id} is the poll — answered 404 "Request … not found".
//   · GET /v1/requests/{id} serves the finished OUTPUT ("Output for this request
//     ID … Not Found").
//   · `x-api-key` is the auth header (the v1 route names it in its 401 body).
//   · An empty balance is 402 on /v2 and 406 on /v1.
//
// ALSO VERIFIED, accidentally, on 2026-08-02. A probe meant to be rejected by
// validation (`{prompt:"", duration:0}`) was ACCEPTED into the queue instead, and the
// job then failed at validation with `inference_time: 0.003s` — no render ran. That
// mistake is documented rather than hidden because it pinned the envelope exactly:
//
//   submit 200 → { request_id, poll_url, response_url, status_url, status: "QUEUED" }
//   poll   422 → { status: "FAILED", error: "…", metrics: { inference_time, … } }
//
// WORTH KNOWING: their API validates AFTER queueing, so an invalid body still mints a
// request id. Never treat "submit returned 200" as "the request was well-formed".
//
// STILL NOT VERIFIED — no successful render has been paid for, by the owner's
// instruction. Unknown: where the video URL sits in a COMPLETED envelope, and whether
// a billed figure appears at all. Both are read tolerantly below and logged raw on
// first contact. Guessing one name and hard-coding it is how an adapter silently
// returns "success with no asset" and refunds a clip the user actually received.
import type { ApiErrorCode } from '@opencreate/contracts'
import type { VideoPollResult, VideoProvider, VideoSubmitInput } from '../video-provider'

// Sanitized provider error, shaped like KieError/DeepinfraError so app.ts's central
// handler maps it straight to the { error: { code, … } } envelope.
export class SegmindError extends Error {
  statusCode: number
  apiCode: ApiErrorCode
  // The upstream's own words, kept OFF `message` — app.ts serializes `message`
  // verbatim to the browser, and a provider body can name an account or a balance.
  providerDetail?: string
  constructor(
    message: string,
    opts?: { statusCode?: number; apiCode?: ApiErrorCode; providerDetail?: string },
  ) {
    super(message)
    this.name = 'SegmindError'
    this.statusCode = opts?.statusCode ?? 502
    this.apiCode = opts?.apiCode ?? 'provider_error'
    if (opts?.providerDetail !== undefined) this.providerDetail = opts.providerDetail
  }
}

const BASE = 'https://api.segmind.com'

// Control-plane timeout: both calls here are submit/status, the render happens
// between them. 30s matches the other polling adapters — NOT DeepInfra's 10 minutes,
// which exists only because that channel blocks for the whole generation.
const REQUEST_TIMEOUT_MS = 30_000

// Cap on the diagnostic body. Their envelopes are small, but a provider that one day
// inlines base64 could otherwise push megabytes through a JSON response and into a
// browser that only ever renders the first screenful of it.
const RAW_MAX_CHARS = 4_000

// Seedance's token count, published by OpenRouter and CONFIRMED against our own
// DeepInfra invoice to 0.28% (15s at 1280×720 → formula 324 000, billed 324 900):
//
//   tokens = width × height × duration × 24 / 1024
//
// Kept here because Segmind bills in CREDITS and (as far as the docs go) reports no
// figure at all, so `costUsd` has to be derived. Everything downstream must treat
// that number as an ESTIMATE — see the comment at its use site.
const TOKENS_PER_PIXEL_SECOND = 24 / 1024
const USD_PER_TOKEN = 7.0 / 1_000_000

// The catalog `air` is `segmind:seedance-2.0` — the synthetic provider prefix exists
// only to satisfy the shared AIR regex. Strip it back off; what follows IS Segmind's
// model slug, which is also the last path segment of the endpoint.
export function toSegmindModelId(air: string): string {
  const colon = air.indexOf(':')
  return colon === -1 ? air : air.slice(colon + 1)
}

// Pixels → their resolution enum. The SHORT edge names the tier (720p portrait is
// 720×1280: the 720 is the WIDTH), so keying off the long edge would read every
// portrait clip as 1080p and buy it at more than twice the price.
export function resolutionFor(width: number, height: number): '480p' | '720p' | '1080p' {
  const shortEdge = Math.min(width, height)
  if (shortEdge >= 1080) return '1080p'
  if (shortEdge >= 720) return '720p'
  return '480p'
}

// Pixels → their aspect_ratio enum (they take a ratio + a tier, not a pixel pair).
function ratioFor(width: number, height: number): string {
  if (width === height) return '1:1'
  return width > height ? '16:9' : '9:16'
}

// Estimated operator cost. NOT a receipt — Segmind bills in credits and appears to
// report no figure, unlike DeepInfra (`inference_status.cost`) and kie.ai
// (`creditsConsumed`). Callers that display money must label this as an estimate;
// the /compare-video page deliberately shows "provider stated no figure" rather than
// a computed number, because substituting arithmetic for a receipt is the exact
// failure that page exists to eliminate.
export function estimateCostUsd(width: number, height: number, durationSeconds: number): number {
  return width * height * durationSeconds * TOKENS_PER_PIXEL_SECOND * USD_PER_TOKEN
}

type SegmindOptions = {
  // config.segmindApiKey. null/undefined = provider not configured: submit returns a
  // clean provider_error instead of crashing boot, and the catalog route hides its
  // models so nobody can select one whose backend cannot run.
  apiKey?: string | null
  // Structured logger. Load-bearing on FIRST CONTACT: the success shape has never
  // been observed, so the raw envelope is logged once per terminal state. Without it
  // the first paid run would tell us nothing and would have to be repeated.
  log?: { warn: (obj: object, msg: string) => void }
}

// Their queue states. 'QUEUED' and 'FAILED' are OBSERVED (see the header); the rest
// come from their docs and are treated as hints. Anything unlisted falls through to
// 'processing' in `readStatus` — the safe half of the union, since a premature
// 'error' refunds a job that is still rendering and will still bill us.
const DONE = ['completed', 'succeeded', 'success']
const FAILED = ['failed', 'error', 'cancelled', 'canceled', 'expired']

export function createSegmindClient(opts: SegmindOptions = {}): VideoProvider {
  const submit = async (input: VideoSubmitInput): Promise<{ providerJobId: string }> => {
    const apiKey = opts.apiKey
    if (!apiKey) throw new SegmindError('segmind provider is not configured (SEGMIND_API_KEY unset)')

    const body = {
      prompt: input.prompt,
      // EVERY ONE OF THESE IS A BILL, and their defaults are not ours: duration
      // defaults to 10 (we would pay double for a 5s clip) and resolution to 720p.
      duration: input.durationSeconds,
      resolution: resolutionFor(input.width, input.height),
      aspect_ratio: ratioFor(input.width, input.height),
      // OFF, as on every other provider here: CinemaStudio mixes its own voiceover
      // over the clip, so a model-made soundtrack is paid-for waste. Their schema
      // already defaults this to false — sent explicitly so a future default flip
      // cannot silently double the bill.
      generate_audio: input.audio === true,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      // image→video seed frame, as a URL — the only form their schema accepts.
      // The refusal for a missing URL happens ABOVE, before this body is built.
      ...(input.inputImageUrl ? { first_frame_url: input.inputImageUrl } : {}),
      // Up to 9 reference images — MORE than ByteDance's own 5. URLs likewise.
      ...(input.referenceImageUrls?.length
        ? { reference_images: input.referenceImageUrls }
        : {}),
    }

    // REFUSE BEFORE SPENDING. Their API accepts any submit and validates on the
    // render, so bytes where a URL belongs do not bounce — they queue, produce
    // nothing, and come back as a poll failure. That is a charge and a refund for
    // a clip that was never going to exist. Observed in production 2026-08-19:
    // 130 credits out and back, with "the channel refused this job" the only
    // trace, while their actual sentence was "Reference media rejected: URL must
    // be a valid HTTP or HTTPS URL."
    //
    // Throwing HERE is deliberate: submit is the one moment the failover chain
    // can still route the job to DeepInfra or ByteDance, both of which take the
    // bytes inline. A refusal at submit costs nothing and still produces a clip.
    if (input.inputImage && !input.inputImageUrl) {
      throw new SegmindError('this channel needs a public URL for the seed frame')
    }
    if (input.referenceImages?.length && !input.referenceImageUrls?.length) {
      throw new SegmindError('this channel needs public URLs for reference images')
    }

    const model = toSegmindModelId(input.model)
    let res: Response
    try {
      // /v2 is the ASYNC route: it returns a request id immediately instead of
      // holding the socket for the whole render. That is what makes this adapter
      // STATELESS — unlike deepinfra-client.ts, which has to keep in-flight jobs in
      // an in-process Map and loses them on every restart.
      res = await fetch(`${BASE}/v2/${model}`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (err) {
      throw new SegmindError(
        `segmind request failed: ${err instanceof Error ? err.name : 'network error'}`,
      )
    }

    const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null

    if (!res.ok) {
      // 402 (v2) and 406 (v1) both mean an empty balance — the one failure an
      // operator meets routinely and fixes in half a minute, so it gets its own
      // category instead of a generic provider_error.
      const outOfCredits = res.status === 402 || res.status === 406
      throw new SegmindError(`segmind rejected the job (HTTP ${res.status})`, {
        ...(outOfCredits ? { apiCode: 'insufficient_credits' as ApiErrorCode } : {}),
        ...(typeof parsed?.error === 'string' ? { providerDetail: parsed.error } : {}),
      })
    }

    const providerJobId = readRequestId(parsed)
    if (!providerJobId) {
      // FIRST CONTACT LOG. The id field name is unverified, so a miss here is a
      // naming mismatch rather than a provider fault — and the raw body is the only
      // thing that tells us which name to add to `readRequestId`.
      opts.log?.warn(
        { event: 'segmind.unknown_submit_shape', body: JSON.stringify(parsed).slice(0, 500) },
        'segmind submit returned no recognisable request id',
      )
      throw new SegmindError('segmind returned no request id')
    }
    return { providerJobId }
  }

  // Never throws for a provider outcome — an unreachable Segmind, a moderation
  // refusal and a finished render all come back as a VideoPollResult the service
  // knows how to settle (and refund).
  const poll = async (providerJobId: string): Promise<VideoPollResult> => {
    const apiKey = opts.apiKey
    if (!apiKey) return { status: 'error', message: 'segmind provider is not configured' }

    let res: Response
    try {
      res = await fetch(`${BASE}/v2/requests/${encodeURIComponent(providerJobId)}`, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      // A transient status-call failure must NOT settle the row: the render is very
      // likely still running, and answering 'error' here would refund a job that
      // then succeeds and bills us anyway. The stale reaper is the backstop.
      return { status: 'processing', progress: null }
    }

    const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null

    // 404 = unknown OR EXPIRED id. Their results are retained for ONE HOUR — far
    // shorter than kie.ai's 24h — so a late poll legitimately 404s on a job that
    // succeeded. Reported as an error (the asset is genuinely unreachable) rather
    // than looping forever against an id that will never resolve.
    if (res.status === 404) {
      return { status: 'error', message: 'the render result is no longer available' }
    }
    // 422 is how a FAILED request is served, per their docs.
    if (res.status === 422) {
      return { status: 'error', message: 'the channel refused this job' }
    }
    if (!res.ok) return { status: 'processing', progress: null }

    // Diagnostics carried on TERMINAL states only — a poll loop runs dozens of times
    // and attaching the body to every 'processing' tick would be noise.
    const raw = JSON.stringify(parsed).slice(0, RAW_MAX_CHARS)

    const state = readStatus(parsed)
    if (state === 'failed') {
      return { status: 'error', message: 'the channel refused this job', raw }
    }
    if (state === 'processing') return { status: 'processing', progress: null }

    const assetUrl = readAssetUrl(parsed)
    if (assetUrl) {
      // THE ASSET HOST IS THE ONE THING THAT CAN STILL BREAK PRODUCTION. Every other
      // provider here serves finished files from a host UNRELATED to its API —
      // kie.ai's api.kie.ai vs tempfile.aiquickdraw.com, ByteDance's ark.* vs
      // *.volces.com — and `storage.saveFromUrl` refuses anything outside the SSRF
      // allowlist. Segmind's host is not confirmed (no successful render has been
      // paid for through the generation path), so the FIRST one gets logged.
      //
      // The HOST only, never the full URL: these links are commonly signed, and a
      // query string with a token has no business in a log file.
      opts.log?.warn(
        { event: 'segmind.asset_host', host: hostOf(assetUrl) },
        'segmind asset host observed — confirm it is in ASSET_HOST_ALLOWLIST',
      )
    }
    if (!assetUrl) {
      // Terminal-looking but no asset. Logged raw because on a shape we have never
      // observed, "done with no url" is far more likely to be a field-name miss than
      // a provider that genuinely produced nothing.
      opts.log?.warn(
        { event: 'segmind.unknown_poll_shape', body: JSON.stringify(parsed).slice(0, 500) },
        'segmind reported a terminal state with no recognisable asset url',
      )
    }
    return {
      status: 'success',
      raw,
      ...(assetUrl !== undefined ? { assetUrl } : {}),
      // NO costUsd. Segmind appears to report no billed figure, and this seam's
      // `costUsd` means "what the provider charged" everywhere else. Filling it with
      // our own arithmetic would put an estimate on a margin dashboard next to two
      // real receipts and make them indistinguishable. `estimateCostUsd` is exported
      // for callers that explicitly want an estimate and will label it as one.
      //
      // If the first real run shows a figure in the envelope, read it HERE.
      nsfw: false,
    }
  }

  return { submit, poll }
}

// ── TOLERANT READERS ─────────────────────────────────────────────────────────
// The success envelope has never been observed (no credits were spent by request).
// Each reader accepts every plausible spelling rather than betting on one; the raw
// body is logged when they all miss, so the first paid run pins the shape down.

// Hostname only. Never the path or query — asset links are commonly signed, and a
// token in a log file is a credential in a log file.
function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'unparseable'
  }
}

export function readRequestId(body: Record<string, unknown> | null): string | undefined {
  if (!body) return undefined
  for (const key of ['request_id', 'requestId', 'id', 'poll_id', 'job_id']) {
    const value = body[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

export function readStatus(body: Record<string, unknown> | null): 'done' | 'processing' | 'failed' {
  const raw = body?.status ?? body?.state
  if (typeof raw !== 'string') return 'processing'
  const value = raw.toLowerCase()
  if (DONE.includes(value)) return 'done'
  if (FAILED.includes(value)) return 'failed'
  // UNKNOWN maps to processing, not error: the money rule is that a premature
  // 'error' refunds a live job, whereas an over-long 'processing' is bounded by the
  // caller's deadline and the stale reaper.
  return 'processing'
}

export function readAssetUrl(body: Record<string, unknown> | null): string | undefined {
  if (!body) return undefined
  for (const key of ['output', 'video_url', 'url', 'video']) {
    const value = body[key]
    if (typeof value === 'string' && value.startsWith('http')) return value
    // `output` may also be an array of urls, or an object wrapping one.
    if (Array.isArray(value)) {
      const first = value.find((v) => typeof v === 'string' && v.startsWith('http'))
      if (typeof first === 'string') return first
    }
    if (value && typeof value === 'object') {
      const nested = readAssetUrl(value as Record<string, unknown>)
      if (nested) return nested
    }
  }
  return undefined
}
