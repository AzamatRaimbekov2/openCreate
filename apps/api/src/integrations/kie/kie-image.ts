// Seedream 5 on kie.ai — the image half of the same vendor the video adapter
// already talks to, and the default backend for every picture this product makes.
//
// WHY IT IS THE DEFAULT AND NOT AN ALTERNATIVE. Runware ran images through an
// aggregator's markup on models chosen for what Runware happened to carry.
// Seedream 5 is one model family that covers the whole ladder we actually sell —
// a cheap draft tier, a quality tier, and reference conditioning (up to 14
// reference images, where FLUX.1 Kontext capped at 2) — from one vendor whose
// task API we already poll correctly.
//
// THREE THINGS THEIR SCHEMA DOES DIFFERENTLY, each of which is a bug if ignored:
//
// 1. NO NEGATIVE PROMPT FIELD. Our style and framing presets compose one
//    anyway ("cartoon, anime, illustration" is what pushes a cinematic preset
//    off the wrong medium), and the catalogue cannot simply declare these models
//    negative-less: the same entry still has a Runware link where the channel is
//    real. So the negative is FOLDED INTO THE PROMPT here as an avoidance
//    clause, which is the only form this backend can act on. Dropping it
//    silently was the alternative, and that is how a preset stops working
//    without anyone noticing.
//
// 2. REFERENCES ARE URLS, NEVER DATA URIS. `image_urls` takes fetchable links —
//    the same constraint their video schema puts on `input_urls`. Our seam
//    carries both forms (ImageReference); this adapter uses `publicUrl` and
//    REFUSES the job when it is missing, rather than sending a picture of nobody.
//
// 3. SIZE IS A RATIO PLUS A QUALITY TIER, NOT A PIXEL PAIR. They take
//    `aspect_ratio` + `quality` (basic 2K / high 3K / ultra 4K) and pick the
//    dimensions themselves, so width/height from our resolution table are unused
//    here. That is a real, stated divergence: what the composer promises the user
//    is the Runware fallback's size, and Seedream's own output may differ.
import type {
  ImageProvider,
  ImagePollResult,
  ImageSubmitInput,
  ImageSubmitResult,
} from '../image-provider'
// One vendor, one envelope, one credit rate — imported rather than copied so a
// change to kie.ai's rate card or error shape lands in exactly one place. The
// module is named for the modality that got there first, not for the video path.
import { KIE_CREDIT_USD, KieError, firstResultUrl } from './kie-video'

const BASE = 'https://api.kie.ai/api/v1'

// Control-plane timeout only: both calls here are submit/status, the render
// happens between them. Same 30s every polling adapter in this codebase uses.
const REQUEST_TIMEOUT_MS = 30_000

// Their documented prompt bounds. Checked BEFORE the HTTP call so an over-long
// composed prompt fails at submit — which is the one moment the failover chain
// can still route the job to Runware instead of it dying with the user charged.
const PROMPT_MIN = 3
const PROMPT_MAX = 3000

// How a negative prompt is expressed to a model that has no negative channel.
// Plain instruction rather than a weighting syntax: Seedream reads the prompt as
// language, and an invented "((no: x))" notation would be text it renders.
function foldNegative(prompt: string, negative: string | undefined): string {
  const neg = negative?.trim()
  if (!neg) return prompt
  const folded = prompt + '. Avoid: ' + neg
  // Never let the fold be what breaks the length limit: the positive prompt is
  // what the user actually asked for, and losing the whole generation to keep an
  // avoidance clause would be the wrong trade.
  return folded.length <= PROMPT_MAX ? folded : prompt
}

// png rather than jpeg: these images are re-encoded downstream (film covers,
// reference sheets, 3D concept art) and a jpeg's artefacts compound each time.
// The choice is echoed in the stored extension so /media/* serves the right mime.
const OUTPUT_FORMAT = 'png' as const

type KieTaskData = {
  state?: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'
  resultJson?: string | null
  failCode?: string | null
  failMsg?: string | null
  creditsConsumed?: number | null
}
type KieReply = { code?: number; msg?: string; data?: KieTaskData & { taskId?: string } }

type KieImageOptions = {
  // config.kieApiKey. null/undefined = provider not configured: submit throws a
  // clean provider error, which in a failover chain simply means the next link
  // (Runware) runs — no boot crash, no half-configured state.
  apiKey?: string | null
}

export function createKieImageClient(opts: KieImageOptions = {}): ImageProvider {
  const submit = async (input: ImageSubmitInput): Promise<ImageSubmitResult> => {
    const apiKey = opts.apiKey
    if (!apiKey) throw new KieError('kie provider is not configured (KIE_API_KEY unset)')

    const handle = input.models.kie
    if (!handle) throw new KieError('this model has no kie.ai equivalent')

    const prompt = foldNegative(input.prompt.trim(), input.negativePrompt)
    if (prompt.length < PROMPT_MIN || prompt.length > PROMPT_MAX) {
      throw new KieError(
        `prompt must be ${PROMPT_MIN}-${PROMPT_MAX} characters for this model (got ${prompt.length})`,
        { statusCode: 422, apiCode: 'validation_error' },
      )
    }

    // A reference we cannot express as a URL is a job we must not send: Seedream
    // would render a perfectly good picture of the wrong subject and bill for it.
    // Throwing at submit keeps the failover chain's promise — Runware takes data
    // URIs, so the request still succeeds, just on the other link.
    const refs = input.referenceImages ?? []
    const urls: string[] = []
    for (const ref of refs) {
      if (!ref.publicUrl) {
        throw new KieError(
          'reference images need a publicly reachable media URL for this provider',
          { statusCode: 422, apiCode: 'validation_error' },
        )
      }
      urls.push(ref.publicUrl)
    }

    const body = {
      model: handle,
      input: {
        prompt,
        aspect_ratio: input.aspectRatio,
        // Defaulting rather than demanding: an entry without a quality is a
        // catalogue mistake, and 'basic' is the cheap end — the safe direction to
        // be wrong in when the alternative is silently buying 4K.
        quality: input.quality ?? 'basic',
        output_format: OUTPUT_FORMAT,
        ...(urls.length > 0 ? { image_urls: urls } : {}),
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
      throw new KieError(
        `kie.ai request failed: ${err instanceof Error ? err.name : 'network error'}`,
      )
    }

    const parsed = (await res.json().catch(() => null)) as KieReply | null
    // Their business failures arrive as HTTP 200 with a non-200 envelope code, so
    // the envelope is as load-bearing as the status line — the same trap the video
    // adapter documents, and insufficient credits is the one an operator meets.
    if (!res.ok || parsed?.code !== 200) {
      const detail = parsed?.msg ?? ''
      const outOfCredits = /insufficient|balance/i.test(detail)
      throw new KieError(`kie.ai rejected the job (HTTP ${res.status})`, {
        ...(outOfCredits ? { apiCode: 'insufficient_credits' } : {}),
        ...(detail ? { providerDetail: detail } : {}),
      })
    }

    const taskId = parsed.data?.taskId
    if (!taskId) throw new KieError('kie.ai returned no taskId')
    return { kind: 'pending', providerJobId: taskId }
  }

  // Never throws for a provider outcome — an unreachable kie.ai, a moderation
  // refusal and a finished image all come back as an ImagePollResult the service
  // already knows how to settle and refund.
  const poll = async (providerJobId: string): Promise<ImagePollResult> => {
    const apiKey = opts.apiKey
    if (!apiKey) return { status: 'error', message: 'kie provider is not configured' }

    let res: Response
    try {
      res = await fetch(`${BASE}/jobs/recordInfo?taskId=${encodeURIComponent(providerJobId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      // A transient status-call failure must NOT settle the row: the image is
      // very likely still rendering, and answering 'error' here would refund a
      // job that then succeeds and bills us anyway. The stale reaper is the
      // backstop for the case where it never finishes.
      return { status: 'processing' }
    }

    const parsed = (await res.json().catch(() => null)) as KieReply | null
    if (!res.ok || parsed?.code !== 200) return { status: 'processing' }

    const data = parsed.data
    switch (data?.state) {
      case 'success': {
        const assetUrl = firstResultUrl(data.resultJson)
        // A success with no asset is a failure: say so here rather than handing
        // the service an empty success it would have to invent a rule for.
        if (assetUrl === undefined) {
          return { status: 'error', message: 'kie.ai reported success with no image' }
        }
        const costUsd =
          typeof data.creditsConsumed === 'number'
            ? data.creditsConsumed * KIE_CREDIT_USD
            : undefined
        return {
          status: 'success',
          assetUrl,
          ...(costUsd !== undefined ? { costUsd } : {}),
          // Their `nsfw_checker` is optional and we leave it at its default (off),
          // so this provider returns no moderation verdict of its own. Stated as a
          // documented gap rather than defaulted to a comfortable false — which is
          // nonetheless what it must be for the safety gate to pass a legitimate
          // image through.
          nsfw: false,
          ext: OUTPUT_FORMAT,
        }
      }
      case 'fail': {
        // Their moderation refusals surface in failMsg, which can also name an
        // account or a balance — so it is matched here and never forwarded.
        const detail = data.failMsg ?? ''
        const blocked = /nsfw|sensitive|policy|moderat|content/i.test(detail)
        return {
          status: 'error',
          message: `kie.ai failed this generation${data.failCode ? ` (${data.failCode})` : ''}`,
          ...(blocked ? { blocked: true, code: 'content_blocked' as const } : {}),
        }
      }
      // waiting / queuing / generating — and an ABSENT state, which their API
      // returns briefly right after createTask. Unknown counts as processing: the
      // stale reaper bounds it, whereas a premature 'error' refunds a live job.
      default:
        return { status: 'processing' }
    }
  }

  return { submit, poll }
}
