// Runware REST client (plan Task 8) — plain fetch, no SDK. One POST endpoint,
// an array of task objects in, { data, errors } out. Injected into the app via
// AppDeps so tests can swap in a fake (see plan Task 10's fakeRunware).
import type {
  RunwareImageRequest,
  RunwareImageResult,
  RunwarePollResult,
  RunwareVideoRequest,
} from './types'

const ENDPOINT = 'https://api.runware.ai/v1'
// Every outbound call gets a hard timeout: a hung provider socket must never
// pin one of our request handlers forever. 120s covers slow sync image jobs.
const REQUEST_TIMEOUT_MS = 120_000
// Single bounded retry, only for transient statuses. Mutating tasks carry a
// caller-supplied taskUUID, so a duplicate submit after a timed-out first try
// is deduplicated provider-side (idempotency key).
const RETRYABLE_STATUSES = [429, 503, 504]
const RETRY_DELAY_MS = 1500

export class RunwareError extends Error {
  // 502 Bad Gateway + our stable ApiError code: the app error handler maps
  // this straight to { error: { code: 'provider_error', … } }.
  statusCode = 502
  apiCode = 'provider_error'
  constructor(
    message: string,
    public runwareCode?: string,
  ) {
    super(message)
    this.name = 'RunwareError'
  }
}

export type RunwareClient = {
  imageInference(req: RunwareImageRequest): Promise<RunwareImageResult>
  submitVideo(req: RunwareVideoRequest): Promise<void>
  getResponse(taskUUID: string): Promise<RunwarePollResult>
}

type Raw = {
  data?: Array<Record<string, unknown>>
  errors?: Array<{ code?: string; message?: string }>
}

export function createRunwareClient(opts: { apiKey: string; endpoint?: string }): RunwareClient {
  const post = async (tasks: Array<Record<string, unknown>>): Promise<Raw> => {
    const attempt = async (): Promise<globalThis.Response> =>
      fetch(opts.endpoint ?? ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify(tasks),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    let res = await attempt()
    if (RETRYABLE_STATUSES.includes(res.status)) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      res = await attempt()
    }
    // On non-2xx, surface only the STRUCTURED runware error fields (code +
    // message) if the body parses — never the raw body text or auth header:
    // provider bodies are unvetted and our key must never leak into logs.
    // Runware returns 4xx with a JSON {errors:[...]} envelope (e.g.
    // unsupportedParameter) whose message is essential for diagnosis.
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as Raw | null
      const err = body?.errors?.[0]
      if (err?.message) throw new RunwareError(err.message, err.code)
      throw new RunwareError(`Runware HTTP ${res.status}`)
    }
    return (await res.json()) as Raw
  }

  const firstOrThrow = (raw: Raw): Record<string, unknown> => {
    const err = raw.errors?.[0]
    if (err) throw new RunwareError(err.message ?? 'Runware task failed', err.code)
    const item = raw.data?.[0]
    if (!item) throw new RunwareError('Empty Runware response')
    return item
  }

  return {
    async imageInference(req) {
      const raw = await post([
        {
          taskType: 'imageInference',
          deliveryMethod: 'sync',
          includeCost: true,
          numberResults: 1,
          outputType: 'URL',
          outputFormat: 'WEBP',
          safety: { checkContent: true },
          ...req,
        },
      ])
      const item = firstOrThrow(raw)
      return item as unknown as RunwareImageResult
    },

    async submitVideo(req) {
      // frameImages must be nested under `inputs` in the task envelope; the
      // rest of the request spreads flat. omitSafety is client-internal
      // routing metadata (catalog.supportsSafetyParam === false — ByteDance
      // models 400 on the `safety` param) and MUST be destructured out so it
      // never leaks into the task payload.
      const { frameImages, omitSafety, ...rest } = req
      const raw = await post([
        {
          taskType: 'videoInference',
          deliveryMethod: 'async',
          includeCost: true,
          outputFormat: 'MP4',
          ...(omitSafety ? {} : { safety: { checkContent: true, mode: 'fast' } }),
          ...(frameImages ? { inputs: { frameImages } } : {}),
          ...rest,
        },
      ])
      firstOrThrow(raw) // async ack — or an immediate submit error
    },

    async getResponse(taskUUID) {
      const raw = await post([{ taskType: 'getResponse', taskUUID }])
      // Polling maps provider errors to a *state*, not an exception: the poll
      // caller (generation service) must mark the row failed + refund, which is
      // control flow, not a 5xx of our own.
      const err = raw.errors?.[0]
      if (err) return { status: 'error', message: err.message ?? 'generation failed' }
      const item = raw.data?.[0]
      if (!item) return { status: 'error', message: 'empty poll response' }
      if (item.status === 'processing')
        return {
          status: 'processing',
          progress: typeof item.progress === 'number' ? item.progress : null,
        }
      if (item.status === 'success' || item.videoURL || item.imageURL)
        return {
          status: 'success',
          videoURL: item.videoURL as string | undefined,
          imageURL: item.imageURL as string | undefined,
          cost: item.cost as number | undefined,
          NSFWContent: item.NSFWContent as boolean | undefined,
        }
      return { status: 'error', message: 'unexpected poll payload' }
    },
  }
}
