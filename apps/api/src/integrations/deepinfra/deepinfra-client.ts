// DeepInfra adapter — Seedance 2.0 WITHOUT ByteDance's resource-pack wall.
//
// WHY THIS PROVIDER EXISTS. The direct ByteDance channel (ark-client.ts) is
// blocked by `ModelNotOpen`: the account must first BUY a resource pack — $30.10
// minimum, 90-day expiry, non-refundable, and not purchasable in the console at
// all (it lives on a marketing page). DeepInfra resells the same model at the same
// price, with no activation, no prepay and no minimum.
//
// SAME PRICE — verified, not assumed. Their headline "$4.30 / 1M tokens" is the
// WITH-VIDEO-INPUT rate; their own pricing string reads "$4.3/M with video, $7/M
// without for 480p and 780p; $4.7/M with video, $7.7/M without for 1080p". We send
// text or an image, never a video, so we are on the $7/M row — which is exactly
// ByteDance's own $0.0070/1k. Nobody is cheaper here; the win is that nobody has
// to buy anything first.
//
// ── THE HARD PART: THEY HAVE NO POLLING ENDPOINT ─────────────────────────────
// DeepInfra's inference API is SYNCHRONOUS (one HTTP call blocks for the whole
// ~60s render) or webhook-driven. Their docs are explicit that there is no way to
// fetch a queued result by request_id. Our seam is submit → jobId → poll, and the
// service's whole money path (charge at submit, 202, SPA polls, settle once) is
// built on it.
//
// So: submit() fires the request DETACHED, mints its own jobId, and records the
// eventual outcome in an in-process map; poll() reads that map. The service, the
// ledger and the SPA are untouched.
//
// THE COST OF THAT, stated plainly rather than discovered later: in-flight jobs
// live in MEMORY. An API restart loses them, and the row then sits 'processing'
// until the existing stale reaper fails and refunds it (STALE_PROCESSING_MS). A
// deploy therefore kills in-flight Seedance jobs — survivable, because the money
// always comes back, but real. A webhook (public callback URL + signature
// verification) is the correct long-term answer; this is the honest one that works
// today, and it is confined to this file.
import { randomUUID } from 'node:crypto'
import type { VideoPollResult, VideoProvider, VideoSubmitInput } from '../video-provider'

// Sanitized provider error, shaped like RunwareError/ArkError/DashscopeError so
// app.ts's central handler maps it straight to the { error: { code, … } } envelope.
export class DeepinfraError extends Error {
  statusCode: number
  apiCode: string
  // The upstream's own words, kept OFF `message` — app.ts serializes `message`
  // verbatim to the browser, and a provider body can name an account or a balance.
  providerDetail?: string
  constructor(
    message: string,
    opts?: { statusCode?: number; apiCode?: string; providerDetail?: string },
  ) {
    super(message)
    this.name = 'DeepinfraError'
    this.statusCode = opts?.statusCode ?? 502
    this.apiCode = opts?.apiCode ?? 'provider_error'
    if (opts?.providerDetail !== undefined) this.providerDetail = opts.providerDetail
  }
}

const BASE = 'https://api.deepinfra.com/v1/inference'

// A whole render happens inside ONE request here, so this is not a control-plane
// timeout like the other adapters' 30s — it has to outlast the generation itself.
// Seedance takes ~60-120s for a 5-10s clip; 10 minutes is far beyond any real one
// and still bounds a hung socket.
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000

// Their response envelope (out_schema, fetched from the model's own metadata).
type DeepinfraReply = {
  video_url?: string
  status?: 'ok' | 'error' | 'cancelled'
  out_tokens?: number
  detail?: string
  inference_status?: { status?: string; cost?: number; runtime_ms?: number }
}

// What the in-process map holds while a detached request is in flight or done.
type Job =
  | { state: 'running' }
  | { state: 'done'; result: VideoPollResult }

// The catalog `air` is `deepinfra:ByteDance/Seedance-2.0` — the synthetic provider
// prefix exists only to satisfy the shared AIR regex. Strip it back off; what
// follows IS DeepInfra's model path.
export function toDeepinfraModelId(air: string): string {
  const colon = air.indexOf(':')
  return colon === -1 ? air : air.slice(colon + 1)
}

// Pixels → their resolution enum ('480p' | '720p' | '1080p'). The SHORT edge names
// the tier (720p portrait is 720×1280: the 720 is the WIDTH). Keying off the long
// edge would read every portrait clip as 1080p and buy it at $7.7/M instead of $7/M.
export function resolutionFor(width: number, height: number): '480p' | '720p' | '1080p' {
  const shortEdge = Math.min(width, height)
  if (shortEdge >= 1080) return '1080p'
  if (shortEdge >= 720) return '720p'
  return '480p'
}

// Pixels → their `aspect_ratio` enum. They take a ratio + a tier, not a pixel pair.
function ratioFor(width: number, height: number): string {
  if (width === height) return '1:1'
  return width > height ? '16:9' : '9:16'
}

type DeepinfraOptions = {
  // config.deepinfraApiKey. null/undefined = provider not configured: submit
  // returns a clean provider_error instead of crashing boot, and the catalog route
  // hides its models so nobody can select one whose backend cannot run.
  apiKey?: string | null
}

export function createDeepinfraClient(opts: DeepinfraOptions = {}): VideoProvider {
  // jobId → outcome. Lives for the lifetime of the process; see the file header for
  // why that is acceptable and what it costs.
  const jobs = new Map<string, Job>()

  const submit = async (input: VideoSubmitInput): Promise<{ providerJobId: string }> => {
    const apiKey = opts.apiKey
    if (!apiKey) throw new DeepinfraError('deepinfra provider is not configured (DEEPINFRA_TOKEN unset)')

    const body = {
      prompt: input.prompt,
      // EVERY ONE OF THESE IS A BILL. Their schema defaults each to "unset", and
      // what the model then picks is not what the user paid for:
      //   · duration accepts -1 = "model decides" (4-15s), and duration drives
      //     BILLING — a model-picked 15s clip costs 3× a 5s one.
      //   · resolution unset means we do not know whether we bought the $7/M row
      //     (480p/720p) or the $7.7/M one (1080p).
      duration: input.durationSeconds,
      resolution: resolutionFor(input.width, input.height),
      aspect_ratio: ratioFor(input.width, input.height),
      // OFF, for the same reason it is off on every other provider here:
      // CinemaStudio generates its own voiceover and music and the ffmpeg render
      // mixes those OVER the clip, so a model-made soundtrack is paid-for waste.
      generate_audio: false,
      watermark: false,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      // image→video seed frame. Their schema types this as a binary image field,
      // which their JSON API takes as a data URI — the same shape every other
      // adapter here already receives.
      ...(input.inputImage ? { first_frame_image: input.inputImage } : {}),
      // Character references (up to 9 — MORE than ByteDance's own 5). NOTE: their
      // schema says "URLs (or asset:// IDs)", NOT data URIs, so a locally-stored
      // photo has to be reachable or uploaded first. The service hands us whatever
      // it resolved; we forward it unchanged rather than guessing a conversion.
      ...(input.referenceImages?.length ? { reference_images: input.referenceImages } : {}),
    }

    const providerJobId = randomUUID()
    jobs.set(providerJobId, { state: 'running' })

    // DETACHED ON PURPOSE. Awaiting here would block the POST /api/generations
    // handler for the entire ~60s render: the user would sit on a spinner instead
    // of getting their 202, and the whole charge→202→poll→settle path (and the
    // stale reaper that guards it) would stop meaning anything.
    void runInference(`${BASE}/${toDeepinfraModelId(input.model)}`, apiKey, body)
      .then((result) => jobs.set(providerJobId, { state: 'done', result }))
      .catch((err) => {
        // A thrown error here is a bug, not a provider failure — runInference
        // already turns every provider outcome into a VideoPollResult. Settle it
        // anyway: a job that can never answer would hold the user's credits.
        jobs.set(providerJobId, {
          state: 'done',
          result: {
            status: 'error',
            message: err instanceof Error ? err.message : 'deepinfra request failed',
          },
        })
      })

    return { providerJobId }
  }

  const poll = async (providerJobId: string): Promise<VideoPollResult> => {
    const job = jobs.get(providerJobId)

    // Unknown id: either nobody submitted it, or the process restarted and the map
    // went with it. SETTLE it — a row that can never be answered must fail and
    // refund now, not spin until the hour-long stale reaper notices.
    if (!job)
      return {
        status: 'error',
        message: 'this generation was interrupted (the server restarted) — no charge was kept',
      }

    if (job.state === 'running') return { status: 'processing', progress: null }

    // Terminal: hand it over once and forget it. The service settles the row on
    // this answer and never asks again, so holding the entry would only grow the
    // map for the life of the process.
    jobs.delete(providerJobId)
    return job.result
  }

  return { submit, poll }
}

// One synchronous inference call, folded into the neutral poll union. Never throws
// for a provider outcome — an unreachable DeepInfra, a 402, a moderation refusal
// and a successful render all come back as a VideoPollResult the service knows how
// to settle (and refund).
async function runInference(
  url: string,
  apiKey: string,
  body: unknown,
): Promise<VideoPollResult> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        // lowercase 'bearer' is what their own curl example sends
        Authorization: `bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    return {
      status: 'error',
      message: `DeepInfra request failed: ${err instanceof Error ? err.name : 'network error'}`,
    }
  }

  const parsed = (await res.json().catch(() => null)) as DeepinfraReply | null

  if (!res.ok) {
    // Their `detail` can name an account id or a balance; it never reaches the
    // browser. The user sees the mapped provider_error copy.
    return { status: 'error', message: `DeepInfra HTTP ${res.status}` }
  }

  if (!parsed || parsed.status !== 'ok') {
    return { status: 'error', message: `DeepInfra returned status ${parsed?.status ?? 'unknown'}` }
  }

  // `inference_status.cost` is DeepInfra's OWN number for this request, in USD.
  // Every other provider leaves us estimating from a rate card; this one just tells
  // us — so the operator margin figure is a fact rather than an inference.
  return {
    status: 'success',
    assetUrl: parsed.video_url,
    costUsd: parsed.inference_status?.cost,
  }
}
