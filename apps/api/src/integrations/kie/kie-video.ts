// kie.ai adapter — a Seedance reseller with a REAL async task API.
//
// WHY THIS PROVIDER EXISTS. Two reasons, and the second matters more than the price.
//
// 1) PRICE, measured rather than quoted. Their published rates were verified live
//    2026-07-30 against a real generation on this key: `bytedance/seedance-1.5-pro`,
//    5s / 720p / silent → `creditsConsumed: 17.5`, balance 80 → 62.5, i.e. exactly
//    17.5 × $0.005 = $0.0875. Their own prayer (3.5 credits/second for the
//    without-audio 720p row) is therefore accurate to the cent, with no hidden fee.
//
//    THE COLUMN TRAP, because every comparison blog falls into it: their price table
//    carries TWO rows per resolution — "with video input" (cheaper unit price, billed
//    over INPUT + OUTPUT duration) and "no video input" (dearer unit price, billed
//    over output only). We send text or an image, never a VIDEO, so we are always on
//    the "no video" row. Third-party comparisons quote the "with video" row and
//    conclude kie.ai undercuts everyone; on our actual row it does not. Same trap the
//    DeepInfra header documents for their $4.3-vs-$7 headline.
//
//    On Seedance 2.0 they are DEARER than DeepInfra ($0.205/s vs a measured
//    $0.1518/s at 720p) — that model must stay on the existing chain. Their win is
//    Seedance 1.5 Pro silent, where the without-audio row is what CinemaStudio always
//    buys (`generate_audio: false` everywhere, since the ffmpeg render mixes our own
//    voiceover over the clip).
//
// 2) THEY HAVE A POLLING ENDPOINT — which DeepInfra does not. `deepinfra-client.ts`
//    has to fire its request DETACHED and hold outcomes in an in-process Map, so a
//    deploy loses every in-flight job and the row sits 'processing' until the stale
//    reaper refunds it. kie.ai mints a `taskId` we persist and poll like every other
//    well-behaved backend, so THIS adapter is stateless and survives a restart. For
//    the money path that is worth more than the per-second rate.
import type { VideoPollResult, VideoProvider, VideoSubmitInput } from '../video-provider'

// Sanitized provider error, shaped like RunwareError/ArkError/DeepinfraError so
// app.ts's central handler maps it straight to the { error: { code, … } } envelope.
export class KieError extends Error {
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
    this.name = 'KieError'
    this.statusCode = opts?.statusCode ?? 502
    this.apiCode = opts?.apiCode ?? 'provider_error'
    if (opts?.providerDetail !== undefined) this.providerDetail = opts.providerDetail
  }
}

const BASE = 'https://api.kie.ai/api/v1'

// Control-plane timeout only. Both calls here are submit/status — the render itself
// happens between them — so this is the 30s the other polling adapters use, NOT
// DeepInfra's 10 minutes (that one blocks for the whole generation).
const REQUEST_TIMEOUT_MS = 30_000

// Their documented ceiling for `input_urls` (Seedance 1.5 Pro, docs 2026-08-19).
const MAX_INPUT_URLS = 2

// Their fixed credit→USD rate, read off the pricing table under the operator's own
// login: claude-opus-5 output is listed as 2000 credits AND $10 per million tokens,
// which pins one credit at half a cent. Verified independently by the live
// generation above (17.5 credits billed, $0.0875 at this rate).
export const KIE_CREDIT_USD = 0.005

// NOTE: the finished clip's host (`tempfile.aiquickdraw.com`, NOT api.kie.ai) lives
// in config.ts as `KIE_ASSET_HOST` alongside the Ark/Dashscope/DeepInfra ones — one
// definition, because a second copy here would drift from the SSRF allowlist that
// actually gates the download.

// Their task envelope. `state` is the discriminator; `resultJson` is a JSON STRING
// (not an object) that has to be parsed a second time.
type KieTaskData = {
  state?: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'
  resultJson?: string | null
  failCode?: string | null
  failMsg?: string | null
  // The actual number of credits deducted — their own figure for this task, the
  // same class of fact as DeepInfra's `inference_status.cost`. Turned into USD
  // below so margin dashboards compare like with like across providers.
  creditsConsumed?: number | null
}

type KieReply = { code?: number; msg?: string; data?: KieTaskData & { taskId?: string } }

// The catalog `air` is `kie:bytedance/seedance-1.5-pro` — the synthetic provider
// prefix exists only to satisfy the shared AIR regex. Strip it back off; what
// follows IS kie.ai's model id.
export function toKieModelId(air: string): string {
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

// Pixels → their `aspect_ratio` enum (they take a ratio + a tier, not a pixel pair).
function ratioFor(width: number, height: number): string {
  if (width === height) return '1:1'
  return width > height ? '16:9' : '9:16'
}

type KieOptions = {
  // config.kieApiKey. null/undefined = provider not configured: submit returns a
  // clean provider_error instead of crashing boot, and the catalog route hides its
  // models so nobody can select one whose backend cannot run.
  apiKey?: string | null
}

export function createKieClient(opts: KieOptions = {}): VideoProvider {
  const submit = async (input: VideoSubmitInput): Promise<{ providerJobId: string }> => {
    const apiKey = opts.apiKey
    if (!apiKey) throw new KieError('kie provider is not configured (KIE_API_KEY unset)')

    // REFUSE BEFORE SPENDING, for the reason the Segmind adapter spells out at
    // length: a backend that takes URLs and is handed bytes does not bounce the
    // request, it accepts and fails later — which is a charge, a refund, and no
    // clip. Submit is the last moment the failover chain can still act.
    if (input.inputImage && !input.inputImageUrl) {
      throw new KieError('this channel needs a public URL for the seed frame')
    }
    if (input.referenceImages?.length && !input.referenceImageUrls?.length) {
      throw new KieError('this channel needs public URLs for reference images')
    }

    const body = {
      model: toKieModelId(input.model),
      input: {
        prompt: input.prompt,
        // EVERY ONE OF THESE IS A BILL, and their schema defaults are not ours:
        //   · duration defaults to 5 and drives billing linearly.
        //   · resolution defaults to 720p — leaving it unset would silently buy the
        //     720p row for a clip the user paid the 480p price for.
        duration: input.durationSeconds,
        resolution: resolutionFor(input.width, input.height),
        aspect_ratio: ratioFor(input.width, input.height),
        // OFF unless the service explicitly priced audio, for the same reason it is
        // off on every other provider here: CinemaStudio generates its own voiceover
        // and music and the ffmpeg render mixes those OVER the clip, so a model-made
        // soundtrack is paid-for waste. ByteDance bills audio at 2×, and on kie.ai
        // the with-audio row is likewise double — so this flag IS the price.
        generate_audio: input.audio === true,
        // image→video seed frame and reference photos. Their schema takes URLs,
        // max 2 — the refusal for a missing URL happens ABOVE, before this body is
        // built, so the chain can still route the job somewhere that takes bytes.
        // Capped rather than truncated-by-them: over the limit they reject the
        // WHOLE job, which would kill a generation for the sake of a third
        // reference the model was never going to read.
        ...(() => {
          const urls = [
            ...(input.inputImageUrl ? [input.inputImageUrl] : []),
            ...(input.referenceImageUrls ?? []),
          ].slice(0, MAX_INPUT_URLS)
          return urls.length > 0 ? { input_urls: urls } : {}
        })(),
      },
    }

    let res: Response
    try {
      res = await fetch(`${BASE}/jobs/createTask`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (err) {
      throw new KieError(`kie.ai request failed: ${err instanceof Error ? err.name : 'network error'}`)
    }

    const parsed = (await res.json().catch(() => null)) as KieReply | null
    // They answer HTTP 200 with a non-200 `code` for business failures (insufficient
    // credits being the one an operator will actually meet), so the envelope code is
    // as load-bearing as the status line.
    if (!res.ok || parsed?.code !== 200) {
      // INSUFFICIENT CREDITS IS NOT A GENERIC PROVIDER FAILURE, and treating it as
      // one cost three runs' worth of confusion: the operator saw "kie.ai rejected
      // the job (HTTP 200)" — a sentence that names a vendor, quotes a status line
      // that says SUCCESS, and hides the only actionable fact. Their business
      // failures all arrive as HTTP 200 with a non-200 envelope code, so the
      // envelope's own words are the only signal available; matched here ONCE, and
      // turned into a category every caller can render localized copy from.
      const detail = parsed?.msg ?? ''
      const outOfCredits = /insufficient|balance/i.test(detail)
      throw new KieError(`kie.ai rejected the job (HTTP ${res.status})`, {
        ...(outOfCredits ? { apiCode: 'insufficient_credits' } : {}),
        ...(detail ? { providerDetail: detail } : {}),
      })
    }
    const taskId = parsed.data?.taskId
    if (!taskId) throw new KieError('kie.ai returned no taskId')
    return { providerJobId: taskId }
  }

  // Never throws for a provider outcome — an unreachable kie.ai, a moderation
  // refusal and a finished render all come back as a VideoPollResult the service
  // knows how to settle (and refund).
  const poll = async (providerJobId: string): Promise<VideoPollResult> => {
    const apiKey = opts.apiKey
    if (!apiKey) return { status: 'error', message: 'kie provider is not configured' }

    let res: Response
    try {
      res = await fetch(`${BASE}/jobs/recordInfo?taskId=${encodeURIComponent(providerJobId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      // A transient status-call failure must NOT settle the row: the render is very
      // likely still running, and answering 'error' here would refund a job that
      // then succeeds and bills us anyway. Report it as still processing and let the
      // stale reaper be the backstop.
      return { status: 'processing', progress: null }
    }

    const parsed = (await res.json().catch(() => null)) as KieReply | null
    if (!res.ok || parsed?.code !== 200) return { status: 'processing', progress: null }

    const data = parsed.data
    switch (data?.state) {
      case 'success': {
        const assetUrl = firstResultUrl(data.resultJson)
        // Their own credit figure → USD, so `costUsd` means the same thing here as
        // DeepInfra's provider-reported cost. Absent = leave it unset rather than
        // guess a rate card.
        const costUsd =
          typeof data.creditsConsumed === 'number'
            ? data.creditsConsumed * KIE_CREDIT_USD
            : undefined
        return {
          status: 'success',
          ...(assetUrl !== undefined ? { assetUrl } : {}),
          ...(costUsd !== undefined ? { costUsd } : {}),
          // They run an OPTIONAL `nsfw_checker` we leave at its default (off), so
          // this provider reports no moderation verdict of its own. Documented gap,
          // stated rather than defaulted to a comfortable `false`… which is what it
          // has to be for the §9.4 gate to let a legitimate clip through.
          nsfw: false,
        }
      }
      case 'fail':
        return {
          status: 'error',
          // failMsg can name an account or a balance — it never reaches the browser.
          message: `kie.ai failed this generation${data.failCode ? ` (${data.failCode})` : ''}`,
        }
      // waiting / queuing / generating — and an ABSENT state, which their API
      // returns briefly right after createTask before the task is picked up.
      // Treating unknown as processing is the safe half of the union: the stale
      // reaper bounds it, whereas a premature 'error' refunds a live job.
      default:
        return { status: 'processing', progress: null }
    }
  }

  return { submit, poll }
}

// `resultJson` is a JSON STRING inside the JSON body: {"resultUrls":["https://…"]}.
// Returns undefined for anything unparseable or empty — the service already treats a
// success with no asset as a failure and refunds it, so this must not invent a URL.
export function firstResultUrl(resultJson: string | null | undefined): string | undefined {
  if (!resultJson) return undefined
  try {
    const parsed = JSON.parse(resultJson) as { resultUrls?: unknown }
    const first = Array.isArray(parsed.resultUrls) ? parsed.resultUrls[0] : undefined
    return typeof first === 'string' && first.length > 0 ? first : undefined
  } catch {
    return undefined
  }
}
