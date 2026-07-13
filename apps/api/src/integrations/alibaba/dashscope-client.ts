// Alibaba Cloud Model Studio (DashScope) adapter — the DIRECT Wan channel, no
// Runware in the path. Implements the neutral VideoProvider: submit POSTs an
// async task and returns its id; poll GETs the task and folds their six-state
// status enum into our three-state union.
//
// WHY DIRECT, since we already reach Wan through Runware: PRICE, and the size of
// the gap is the whole point. Runware's markup is NOT flat across models — it is
// ~0.8% on Seedance (measured: they billed $0.26136 where ByteDance lists
// $0.2592) but ~51% on Wan 2.7: a 5s 720p clip cost us $0.7557 against Alibaba's
// published $0.10/second, i.e. $0.50. On a product that generates cartoons in
// volume, that difference is the margin.
//
// Failure model mirrors the other providers exactly, because the service's money
// path depends on the distinction: a TRANSPORT failure (unset key, 5xx, network)
// THROWS a sanitized DashscopeError (→ provider_error envelope, the row stays
// processing and the poll retries); a terminal EXECUTION failure maps to the
// neutral error STATE (→ the service fails the row and refunds).
//
// EVERYTHING BELOW THAT LOOKS ARBITRARY IS LOAD-BEARING. Verified against the
// Model Studio API reference (2026-07-12); each one silently breaks or overcharges:
//   · `resolution` DEFAULTS TO 1080P on their side, and 1080P costs $0.15/second
//     against 720P's $0.10 — leaving it implicit would silently bill us 50% more
//     on every clip. It is always sent explicitly, derived from the real pixels.
//   · the workspace id lives IN THE HOST (`{id}.ap-southeast-1.maas.aliyuncs.com`),
//     not in a header — a key alone cannot even form a URL.
//   · `X-DashScope-Async: enable` is REQUIRED on submit; without it the call
//     blocks and no task id comes back.
//   · the model id carries the MODE: `wan2.7-t2v` vs `wan2.7-i2v`. The catalog
//     stores the family (`alibaba:wan2.7`) and the suffix is chosen here from
//     whether a seed frame is present — one catalog row, both modes.
//   · finished videos are HARD-DELETED after 24h and live on OSS
//     (*.oss-*.aliyuncs.com), NOT on the API's *.maas.aliyuncs.com host —
//     storage.saveFromUrl must copy them out, which the shared settle path does.
//   · there is NO audio switch: Wan 2.7 always generates its own soundtrack and
//     the $0.10/second rate already includes it. Unlike the Runware path (where
//     `settings.audio: false` halves the bill), there is nothing to turn off here.
import type { VideoPollResult, VideoProvider, VideoSubmitInput } from '../video-provider'

// Sanitized provider error, shaped like RunwareError/ArkError so app.ts's central
// handler maps it straight to an { error: { code, … } } envelope. `providerDetail`
// carries the upstream's own code+message for the LOG only — never the client:
// app.ts serializes `message` verbatim, and a provider body can name internals.
export class DashscopeError extends Error {
  statusCode: number
  apiCode: string
  providerDetail?: string
  constructor(
    message: string,
    opts?: { statusCode?: number; apiCode?: string; providerDetail?: string },
  ) {
    super(message)
    this.name = 'DashscopeError'
    this.statusCode = opts?.statusCode ?? 502
    this.apiCode = opts?.apiCode ?? 'provider_error'
    if (opts?.providerDetail !== undefined) this.providerDetail = opts.providerDetail
  }
}

const REGION_HOST = 'ap-southeast-1.maas.aliyuncs.com'
const SYNTHESIS_PATH = '/api/v1/services/aigc/video-generation/video-synthesis'
const TASKS_PATH = '/api/v1/tasks'

// Control-plane JSON round-trips only — the render itself is poll-driven and
// never awaited here, so a hung socket must not pin a request handler.
const REQUEST_TIMEOUT_MS = 30_000

// Their six task states (API reference). Anything outside this set is treated as
// still-running rather than invented into a terminal state.
type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN'

type DashscopeTask = {
  output?: {
    task_id?: string
    task_status?: string
    video_url?: string
    message?: string
    code?: string
  }
  code?: string
  message?: string
}

// Their content-moderation refusals share this stem across input and output. Same
// treatment as ByteDance's: a refusal is the USER's to fix, so it settles as a
// refundable content_blocked rather than a mystifying 502 the service retries.
const isModerationCode = (code: string | undefined): boolean =>
  typeof code === 'string' && /DataInspection|ContentRisk|Sensitive/i.test(code)

// The three modes are three DIFFERENT model ids on their side, and the catalog
// stores only the FAMILY (`alibaba:wan2.7`) — one row, all three modes. Which one
// runs is decided by what the caller attached:
//
//   references          → r2v  (reference-to-video: the same CHARACTER, any scene)
//   seed frame only     → i2v  (image-to-video: that literal picture, animated)
//   neither             → t2v  (text-to-video)
//
// r2v BEATS i2v when both are present: a caller who tagged a character and also
// supplied a first frame wants the character — identity is the stronger intent,
// and r2v is the only mode that honours it at all (it accepts `first_frame` too,
// so nothing is thrown away). All three bill identically ($0.10/s at 720P), so
// the choice costs the user nothing.
//
// Sending the bare family (`wan2.7`) 404s.
export type DashscopeMode = 't2v' | 'i2v' | 'r2v'

export function modeFor(hasInputImage: boolean, referenceCount: number): DashscopeMode {
  if (referenceCount > 0) return 'r2v'
  return hasInputImage ? 'i2v' : 't2v'
}

export function toDashscopeModelId(air: string, mode: DashscopeMode): string {
  const colon = air.indexOf(':')
  const family = colon === -1 ? air : air.slice(colon + 1)
  return `${family}-${mode}`
}

// Pixels → their resolution tier. The SHORT edge names the tier (720P portrait is
// 720×1280: the 720 is the width). Never left to their default, which is 1080P —
// a 50% higher rate for a size the user did not ask for.
export function resolutionFor(width: number, height: number): '720P' | '1080P' {
  return Math.min(width, height) >= 1080 ? '1080P' : '720P'
}

// Pixels → their `ratio` enum. They take a ratio + a tier, not a pixel pair.
export function ratioFor(width: number, height: number): string {
  if (width === height) return '1:1'
  return width > height ? '16:9' : '9:16'
}

type DashscopeOptions = {
  // config.dashscopeApiKey / config.dashscopeWorkspaceId. Either null = provider
  // not configured: submit returns a clean provider_error instead of crashing
  // boot, exactly like an unset ARK_API_KEY. The catalog route hides alibaba
  // models in that state, so in practice nobody can even select one.
  apiKey?: string | null
  workspaceId?: string | null
}

export function createDashscopeClient(opts: DashscopeOptions = {}): VideoProvider {
  const base = (): string | null => {
    if (!opts.apiKey || !opts.workspaceId) return null
    return `https://${opts.workspaceId}.${REGION_HOST}`
  }

  const submit = async (input: VideoSubmitInput): Promise<{ providerJobId: string }> => {
    const root = base()
    if (!root || !opts.apiKey)
      throw new DashscopeError(
        'alibaba provider is not configured (DASHSCOPE_API_KEY / DASHSCOPE_WORKSPACE_ID unset)',
      )

    // `input.media[]` carries every attachment, each tagged with its role. The
    // allowed types are 'reference_image' | 'reference_video' | 'first_frame'
    // (their validator's own words). Data URIs are accepted directly, so a user's
    // character photo never has to be published to a public URL to be used.
    //
    // References come FIRST: the prompt names the character, and the model binds
    // the name to the reference. (Verified live: a fox photographed in a snowy
    // forest, prompted onto a tropical beach, came back as the same fox — and the
    // prompt used the plain "Name (description)" form our composePrompt already
    // produces, so no `Image1` convention is needed.)
    const refs = input.referenceImages ?? []
    const mode = modeFor(Boolean(input.inputImage), refs.length)
    const media = [
      ...refs.map((url) => ({ type: 'reference_image' as const, url })),
      ...(input.inputImage ? [{ type: 'first_frame' as const, url: input.inputImage }] : []),
    ]

    const body = {
      model: toDashscopeModelId(input.model, mode),
      input: {
        prompt: input.prompt,
        // Their negative prompt caps at 500 chars; our preset negatives are far
        // shorter, but truncate rather than earn a 400 on a long one.
        ...(input.negativePrompt ? { negative_prompt: input.negativePrompt.slice(0, 500) } : {}),
        // Omit the key entirely when there is nothing to attach: t2v rejects an
        // empty `media` array, and r2v answers "Field required: input.media" —
        // either way a stray `media: []` is a dead generation.
        ...(media.length > 0 ? { media } : {}),
      },
      parameters: {
        // ALWAYS explicit — see the file header. Their default is 1080P at 1.5×
        // the price, and a silent 50% overcharge is exactly the bug class we just
        // spent a day removing from the Runware path.
        resolution: resolutionFor(input.width, input.height),
        ratio: ratioFor(input.width, input.height),
        duration: input.durationSeconds,
        // Their default is TRUE: the model rewrites the user's prompt before
        // rendering. We compose prompts from structured presets (ADR §3) and the
        // stored prompt must be what actually ran — a silent rewrite would make
        // "Regenerate" produce something the row cannot explain.
        prompt_extend: false,
        // Their default is already false; pinned so a default flip cannot start
        // burning "AI Generated" into paid output.
        watermark: false,
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      },
    }

    const raw = await request(`${root}${SYNTHESIS_PATH}`, opts.apiKey, {
      method: 'POST',
      body,
      async: true,
    })
    const id = (raw as DashscopeTask).output?.task_id
    if (typeof id !== 'string' || !id) throw new DashscopeError('Model Studio returned no task id')
    return { providerJobId: id }
  }

  const poll = async (providerJobId: string): Promise<VideoPollResult> => {
    const root = base()
    // Defensive: submit would have thrown, so no processing row should reach
    // here. Map to a terminal error rather than throwing — a row that can never
    // be polled must settle and refund, not spin forever.
    if (!root || !opts.apiKey)
      return { status: 'error', message: 'alibaba provider is not configured' }

    const task = (await request(
      `${root}${TASKS_PATH}/${encodeURIComponent(providerJobId)}`,
      opts.apiKey,
      { method: 'GET' },
    )) as DashscopeTask

    const status = task.output?.task_status as TaskStatus | undefined

    if (status === 'SUCCEEDED') {
      // A succeeded task with no URL is not success — the service settles it as a
      // failure and refunds. Reporting success-with-no-asset would charge the user
      // for nothing.
      return { status: 'success', assetUrl: task.output?.video_url }
    }

    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      const code = task.output?.code
      if (isModerationCode(code))
        return {
          status: 'error',
          message: 'Content was blocked by the provider’s safety filter.',
          blocked: true,
        }
      return { status: 'error', message: task.output?.message ?? `task ${status}` }
    }

    // PENDING / RUNNING — and anything unrecognised, which is treated as still
    // running rather than invented into a terminal state. Model Studio exposes no
    // progress percentage, so it is explicitly null rather than a made-up number.
    return { status: 'processing', progress: null }
  }

  return { submit, poll }
}

async function request(
  url: string,
  apiKey: string,
  init: { method: 'GET' | 'POST'; body?: unknown; async?: boolean },
): Promise<unknown> {
  const res = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // REQUIRED on submit: without it the call runs synchronously, blocks for
      // the whole render, and never returns a task id.
      ...(init.async ? { 'X-DashScope-Async': 'enable' } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch((err) => {
    throw new DashscopeError(
      `Model Studio request failed: ${err instanceof Error ? err.name : 'network error'}`,
    )
  })

  if (!res.ok) {
    const parsed = (await res.json().catch(() => null)) as DashscopeTask | null
    const code = parsed?.code ?? parsed?.output?.code
    const message = parsed?.message ?? parsed?.output?.message
    if (isModerationCode(code))
      throw new DashscopeError('Content was blocked by the provider’s safety filter.', {
        statusCode: 400,
        apiCode: 'content_blocked',
      })
    // Client message stays generic; the upstream's own words ride on
    // `providerDetail`, which the error handler logs and never serializes.
    const detail = [code, message].filter(Boolean).join(': ')
    throw new DashscopeError(`Model Studio HTTP ${res.status}`, {
      ...(detail ? { providerDetail: detail } : {}),
    })
  }

  return res.json().catch(() => {
    throw new DashscopeError('Model Studio returned a non-JSON response')
  })
}
