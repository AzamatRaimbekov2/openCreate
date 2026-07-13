// ByteDance ModelArk adapter (ADR: seedance-direct-bytedance). Implements the
// neutral VideoProvider against ByteDance's OWN API — no Runware in the path.
// submit POSTs an async task and returns its `cgt-…` id; poll GETs the task and
// folds ModelArk's six-state status enum into our three-state neutral union.
//
// Failure model mirrors the other two providers exactly, because the service's
// money path depends on the distinction: a TRANSPORT failure (unset key, 5xx,
// network) THROWS a sanitized ArkError (→ provider_error envelope, row stays
// processing on poll and retries); a genuine CONTENT or terminal EXECUTION
// failure maps to the neutral error STATE (→ the service fails + refunds).
//
// EVERYTHING BELOW THAT LOOKS ARBITRARY IS LOAD-BEARING. Verified against the
// ModelArk docs (2026-07-11), each one silently breaks the integration:
//   · the model id MUST keep its `dreamina-` prefix (2.0 has it, 1.x does not) —
//     without it the API 404s InvalidEndpointOrModel.NotFound;
//   · Seedance 2.0 REJECTS seed / camera_fixed / frames / service_tier under the
//     strict parameter method, so they are never sent (a caller seed is dropped);
//   · generate_audio DEFAULTS TO TRUE on their side — left implicit we would pay
//     for and ship a soundtrack CinemaStudio never asked for;
//   · finished assets live on *.volces.com (NOT the API's *.bytepluses.com) and
//     are HARD-DELETED after 24h — storage.saveFromUrl must copy them out, which
//     it already does on the shared settle path;
//   · Seedance is served from ap-southeast-1 ONLY, so the host is a constant
//     rather than a configurable region.
import type { VideoPollResult, VideoProvider, VideoSubmitInput } from '../video-provider'

// Sanitized provider error, shaped like RunwareError/ComfyError so app.ts's
// central handler maps it straight to an { error: { code, … } } envelope. The
// apiCode is deliberately part of the contract: 'content_blocked' (400) is a
// USER-fixable rejection, 'provider_error' (502) is ours to fix.
export class ArkError extends Error {
  statusCode: number
  apiCode: string
  // ModelArk's own error code + text, kept OFF `message` because app.ts sends
  // `message` straight to the browser for any apiCode-carrying error and the
  // provider's body names our account id. Operators read this in the logs; the
  // user reads the mapped provider_error copy. Never serialize it to a client.
  providerDetail?: string
  constructor(
    message: string,
    opts?: { statusCode?: number; apiCode?: string; providerDetail?: string },
  ) {
    super(message)
    this.name = 'ArkError'
    this.statusCode = opts?.statusCode ?? 502
    this.apiCode = opts?.apiCode ?? 'provider_error'
    if (opts?.providerDetail !== undefined) this.providerDetail = opts.providerDetail
  }
}

// Seedance lives in ap-southeast-1 only (eu-west-1 serves other models), so the
// endpoint is pinned, not configured — a configurable region here could only
// ever be set wrong.
const ARK_BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3'
const TASKS_PATH = '/contents/generations/tasks'

// Control-plane JSON round-trips only — the render itself is poll-driven and
// never awaited here, so a hung ByteDance socket must not pin a request handler.
const REQUEST_TIMEOUT_MS = 30_000

// ModelArk's six terminal/transient states (doc 1521309). Anything outside this
// set is treated as still-running rather than invented into a terminal state.
type ArkStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'

type ArkTask = {
  id?: string
  status?: string
  content?: { video_url?: string }
  usage?: { total_tokens?: number; completion_tokens?: number }
  resolution?: string
  error?: { code?: string; message?: string }
}

// USD per token, for the operator margin dashboard only — this figure never
// touches credit correctness (the user is charged from the catalog, at submit).
//
// THE RATE DEPENDS ON WHETHER THE INPUT CONTAINED A VIDEO, and this is the
// single most expensive detail to get wrong: ByteDance bills 2.0 at $0.0043/1k
// tokens WITH a video input but $0.0070/1k WITHOUT one. We only ever send text
// or an image, so we always pay the higher no-video rate — the cheaper number is
// the one every price comparison quotes, and using it here would understate our
// true cost by ~63% on every clip. (Confirmed by their own deduction ratio:
// 4.3 × 1.6279 = 7.00.)
const USD_PER_TOKEN_NO_VIDEO_INPUT: Record<string, number> = {
  '480p': 0.0070 / 1000,
  '720p': 0.0070 / 1000,
  '1080p': 0.0077 / 1000,
}

// Every ModelArk moderation refusal, input or output, shares this stem
// (InputImageSensitiveContentDetected.PrivacyInformation — "may contain a real
// person" — is the one Seedance 2.0 users will actually hit). Matching the stem
// rather than enumerating the ~15 documented variants means a new suffix still
// lands the user on "fix your input + here are your credits back" instead of a
// mystifying 502.
const MODERATION_CODE = 'SensitiveContentDetected'
const isModerationCode = (code: string | undefined): boolean =>
  typeof code === 'string' && code.includes(MODERATION_CODE)

// The catalog `air` must satisfy the shared provider:model AIR regex, so the
// real ModelArk id is carried behind a synthetic `bytedance:` prefix (same trick
// wan-runpod uses). Strip it back off — and note we do NOT normalize the
// `dreamina-` part: 2.0 carries that prefix, 1.x does not, and "helpfully"
// unifying them would 404 one generation or the other.
function toArkModelId(air: string): string {
  const colon = air.indexOf(':')
  return colon === -1 ? air : air.slice(colon + 1)
}

// ModelArk takes a ratio + a resolution tier, not pixels; the service speaks
// pixels (it resolved them from the catalog so the composer could promise the
// user an exact size). Map back. At 720p Seedance 2.0's own dimension table IS
// our `hd` table (1280×720 / 960×960 / 720×1280), so this round-trip is lossless
// and the size shown in the composer is the size that renders.
//
// The ratio is ALWAYS sent explicitly: 2.0 defaults to `adaptive`, which would
// let the model pick an aspect the user never chose.
function ratioFor(width: number, height: number): string {
  if (width === height) return '1:1'
  return width > height ? '16:9' : '9:16'
}

// Resolution tier from the short edge — the dimension that actually names the
// tier in ByteDance's table (720p 9:16 is 720×1280: the 720 is the WIDTH).
function resolutionFor(width: number, height: number): string {
  const shortEdge = Math.min(width, height)
  if (shortEdge >= 1080) return '1080p'
  if (shortEdge >= 720) return '720p'
  return '480p'
}

type ArkOptions = {
  // config.arkApiKey. null/undefined = provider not configured: submit returns a
  // clean provider_error instead of crashing boot, exactly like an unset
  // COMFY_BASE_URL. The catalog route hides bytedance models in that state, so
  // in practice nobody can even select one.
  apiKey?: string | null
}

export function createArkClient(opts: ArkOptions = {}): VideoProvider {
  const submit = async (input: VideoSubmitInput): Promise<{ providerJobId: string }> => {
    const apiKey = opts.apiKey
    if (!apiKey) throw new ArkError('bytedance provider is not configured (ARK_API_KEY unset)')

    // content[] is ModelArk's multimodal input array. Text first, then the
    // optional seed frame — an image→video request is literally "the same task
    // with one more element", which is why i2v needs no separate code path.
    //
    // A data URI is accepted directly (their docs require the format token to be
    // lowercase, which ours always is — we mint them ourselves). That matters:
    // it means we never have to publish the user's source image to a public URL
    // just to animate it.
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: input.prompt }]
    if (input.inputImage)
      content.push({ type: 'image_url', image_url: { url: input.inputImage } })

    // NOTE: input.negativePrompt is DROPPED. Seedance has no negative-prompt
    // field (the docs' only negative-ish lever is the legacy --flag prompt
    // encoding, which does not carry one either). Silently appending it to the
    // positive prompt would steer the model TOWARD what the preset meant to push
    // it away from — strictly worse than ignoring it. Same documented gap as the
    // wan-runpod adapter.
    const body = {
      model: toArkModelId(input.model),
      content,
      resolution: resolutionFor(input.width, input.height),
      ratio: ratioFor(input.width, input.height),
      duration: input.durationSeconds,
      // Never let the model choose the length: `duration: -1` is legal here and
      // duration drives BILLING, so a model-picked 15s clip would silently cost
      // 3× what the user was charged for at submit.
      watermark: false,
      // Explicitly OFF (their default is true) — see the file header.
      generate_audio: false,
      // Deliberately absent: seed, camera_fixed, frames, service_tier. All four
      // are documented as unsupported by the 2.0 series and ERROR if sent.
      // input.seed is therefore dropped on purpose, not overlooked.
    }

    const raw = await request(`${ARK_BASE}${TASKS_PATH}`, apiKey, { method: 'POST', body })
    const id = (raw as ArkTask).id
    if (typeof id !== 'string' || !id) throw new ArkError('ModelArk returned no task id')
    return { providerJobId: id }
  }

  const poll = async (providerJobId: string): Promise<VideoPollResult> => {
    const apiKey = opts.apiKey
    // Defensive: submit would have thrown, so no processing row should reach
    // here. Map to a terminal error rather than throwing — a row that can never
    // be polled must settle and refund, not spin.
    if (!apiKey) return { status: 'error', message: 'bytedance provider is not configured' }

    const task = (await request(
      `${ARK_BASE}${TASKS_PATH}/${encodeURIComponent(providerJobId)}`,
      apiKey,
      { method: 'GET' },
    )) as ArkTask
    const status = task.status as ArkStatus | undefined

    if (status === 'succeeded') {
      const tokens = task.usage?.total_tokens ?? task.usage?.completion_tokens
      const rate = USD_PER_TOKEN_NO_VIDEO_INPUT[task.resolution ?? '720p']
      return {
        status: 'success',
        // Absent → the service's no-asset guard fails + refunds (never loops).
        assetUrl: task.content?.video_url,
        ...(tokens !== undefined && rate !== undefined ? { costUsd: tokens * rate } : {}),
        // ByteDance moderates its own output by FAILING the task (see the
        // OutputVideoSensitiveContentDetected branch below) rather than handing
        // back a flagged asset, so a succeeded task is by construction safe. The
        // §9.4 nsfw gate simply never fires on this provider.
        nsfw: false,
      }
    }

    if (status === 'failed') {
      const code = task.error?.code
      const message = task.error?.message ?? 'ModelArk reported a failed task'
      // A moderation kill mid-flight is the user's content, not our outage —
      // route it to the same refundable content_blocked the input rejection gets.
      return isModerationCode(code)
        ? { status: 'error', message, blocked: true }
        : { status: 'error', message }
    }

    // cancelled/expired are terminal and produce nothing: settle + refund rather
    // than leave the user's credits held against a job that will never return.
    if (status === 'cancelled') return { status: 'error', message: 'ModelArk task was cancelled' }
    if (status === 'expired') return { status: 'error', message: 'ModelArk task expired' }

    // queued | running | anything unrecognized → still working. ModelArk exposes
    // no percentage, so progress is coarse (null) exactly like wan-runpod. An
    // UNKNOWN status deliberately lands here too: inventing a terminal state from
    // a status we do not understand would refund a job that is still rendering.
    return { status: 'processing', progress: null }
  }

  return { submit, poll }
}

// One hard timeout spans the request. A non-2xx is inspected ONLY to separate a
// content refusal (user-actionable, 400) from everything else (ours, 502) — the
// raw body is never surfaced, only the stable documented `error.code`.
async function request(
  url: string,
  apiKey: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<unknown> {
  const res = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch((err) => {
    throw new ArkError(
      `ModelArk request failed: ${err instanceof Error ? err.name : 'network error'}`,
    )
  })

  if (!res.ok) {
    // Read the documented error envelope to classify. A body we cannot parse is
    // not a reason to fail differently — it just stays a generic provider error.
    const parsed = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string }
    } | null
    const code = parsed?.error?.code
    if (isModerationCode(code))
      throw new ArkError(
        // Deliberately specific: the overwhelmingly common cause on Seedance 2.0
        // is a real human face in the seed frame, and a user told "sensitive
        // content" will simply retry the same portrait and lose credits again.
        'ByteDance refused this input. Seedance 2.0 does not accept images or video containing real human faces.',
        { statusCode: 400, apiCode: 'content_blocked' },
      )
    // The client-facing message stays sanitized ON PURPOSE: app.ts sends
    // `err.message` verbatim for any error carrying an apiCode, and ModelArk's
    // body names our BytePlus ACCOUNT ID ("Your account 3003474417 has not
    // activated the model…"). That must never reach a browser.
    //
    // But throwing a bare `ModelArk HTTP 404` and dropping the body is what made
    // this undiagnosable: 404 reads identically for "wrong host", "wrong model
    // id" and the one that actually happens — ModelNotOpen, i.e. nobody bought
    // the Seedance resource package. So the provider's own code+text rides along
    // in `providerDetail`, which the error handler LOGS and never serializes.
    const detail = [code, parsed?.error?.message].filter(Boolean).join(': ')
    throw new ArkError(`ModelArk HTTP ${res.status}`, {
      ...(detail ? { providerDetail: detail } : {}),
    })
  }

  return res.json().catch(() => {
    throw new ArkError('ModelArk returned a non-JSON response')
  })
}
