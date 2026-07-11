// Runware REST client (plan Task 8) — plain fetch, no SDK. One POST endpoint,
// an array of task objects in, { data, errors } out. Injected into the app via
// AppDeps so tests can swap in a fake (see plan Task 10's fakeRunware).
import type {
  Runware3dRequest,
  RunwareAudioRequest,
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
  // CinemaStudio audio: same async submit-then-poll contract as submitVideo —
  // audioInference is acked immediately and settled via getResponse (which now
  // also surfaces audioURL). See the CinemaStudio ADR §1 (audio rides the video
  // lifecycle).
  submitAudio(req: RunwareAudioRequest): Promise<void>
  // Studio3D: 3dInference, async — same submit-then-poll contract as submitVideo.
  // The finished GLB arrives via getResponse under outputs.files[0].url.
  submit3d(req: Runware3dRequest): Promise<void>
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

    async submitAudio(req) {
      // audioInference, async: differentiate TTS vs music by which fields we
      // send (Runware keys the workflow off the model + payload, not a separate
      // task type). TTS → `speech.{text,voice}`; music → `positivePrompt` plus
      // `settings.instrumental` for a clean background bed. Same async ack as
      // submitVideo — the row is settled later via getResponse.
      const task =
        req.audioKind === 'tts'
          ? {
              taskType: 'audioInference' as const,
              deliveryMethod: 'async' as const,
              includeCost: true,
              outputType: 'URL' as const,
              outputFormat: 'MP3' as const,
              taskUUID: req.taskUUID,
              model: req.model,
              speech: { text: req.text ?? '', voice: req.voice ?? '' },
            }
          : {
              taskType: 'audioInference' as const,
              deliveryMethod: 'async' as const,
              includeCost: true,
              outputType: 'URL' as const,
              outputFormat: 'MP3' as const,
              taskUUID: req.taskUUID,
              model: req.model,
              positivePrompt: req.positivePrompt ?? '',
              settings: { instrumental: true },
            }
      const raw = await post([task])
      firstOrThrow(raw) // async ack — or an immediate submit error
    },

    async submit3d(req) {
      // Studio3D image→3D. inputImage / pbr / faceLimit are destructured out
      // because they do NOT belong flat on the task envelope: the image nests
      // under `inputs.images` (a flat `inputImage` is silently ignored by
      // Runware — you get a task that never produces a mesh), and the quality
      // knobs nest under `settings`. Everything else (taskUUID, model) spreads.
      const { inputImage, pbr, faceLimit, ...rest } = req
      const raw = await post([
        {
          taskType: '3dInference',
          deliveryMethod: 'async',
          includeCost: true,
          outputFormat: 'GLB',
          // NO `safety` param. 3dInference documents no safety filter, and Runware
          // returns 400 unsupportedParameter on params a model does not know —
          // exactly how ByteDance and Wan 2.7 broke. Do not add one speculatively.
          inputs: { images: [inputImage] },
          settings: {
            // Let the provider segment the subject: every image→3D model produces a
            // materially better mesh from a clean cutout, and Tripo/Hunyuan ship
            // their own matting. Cheaper and better than us doing it badly.
            imageAutoFix: true,
            texture: true,
            // Spread-if-present, never `pbr: undefined`: an explicit undefined key
            // still serializes as a param on some paths, and an unknown param is a
            // 400. Absent means absent.
            ...(pbr !== undefined ? { pbr } : {}),
            ...(faceLimit !== undefined ? { faceLimit } : {}),
          },
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
      // Studio3D: 3dInference does NOT use the flat imageURL/videoURL/audioURL
      // shape — it returns outputs.files[0].url. Reading it HERE (rather than in
      // an adapter) keeps ONE place that knows Runware's response envelope. If
      // this were missed, every 3D poll would read as "success with no asset" and
      // the generation service would fail the row and REFUND a job that actually
      // succeeded, while we still paid Runware for the mesh.
      const files = (item.outputs as { files?: Array<{ url?: unknown }> } | undefined)?.files
      const meshURL = typeof files?.[0]?.url === 'string' ? files[0].url : undefined
      if (item.status === 'success' || item.videoURL || item.imageURL || item.audioURL || meshURL)
        return {
          status: 'success',
          videoURL: item.videoURL as string | undefined,
          imageURL: item.imageURL as string | undefined,
          // CinemaStudio audio: audioInference returns audioURL on success.
          audioURL: item.audioURL as string | undefined,
          meshURL,
          cost: item.cost as number | undefined,
          NSFWContent: item.NSFWContent as boolean | undefined,
        }
      return { status: 'error', message: 'unexpected poll payload' }
    },
  }
}
