// HTTP layer for the /compare utility — thin, mirroring the other module
// routes: require a session, parse with the SHARED contracts schema at the
// boundary, delegate to the integration. DeepinfraImageError carries its own
// statusCode + apiCode (502 provider_error), so it falls straight through to
// app.ts's central error handler — no local mapping needed.
//
// WHY THIS ROUTE EXISTS AT ALL (instead of the SPA calling DeepInfra): the
// DEEPINFRA_TOKEN is a server secret — shipping it to the browser would hand
// every visitor the operator's balance. The SPA compares THROUGH us.
//
// WHY IT BLOCKS for the whole render (~10-40s) instead of the submit/poll seam
// every paid generation uses: there is no charge to protect with settlement,
// no gallery row to reconcile, and exactly one caller (the hidden /compare
// page) that WANTS the wall time as its measurement. A synchronous call IS the
// benchmark.
import type { FastifyInstance } from 'fastify'
import type { ApiErrorCode, CompareVideoPanel } from '@opencreate/contracts'
import {
  apiErrorCodeSchema,
  compareGenerateInputSchema,
  compareVideoInputSchema,
} from '@opencreate/contracts'
import {
  DeepinfraImageError,
  generateQwenImage,
} from '../../integrations/deepinfra/deepinfra-image'
import { KIE_CREDIT_USD } from '../../integrations/kie/kie-video'
import type { VideoProvider, VideoSubmitInput } from '../../integrations/video-provider'

// Every call spends real provider money (7.5¢/image) on an endpoint that
// bypasses the credit ledger, so it gets a strict bucket: 10/min lets an
// operator iterate while capping a scripted drain of the DeepInfra balance.
const COMPARE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }

// A video render is minutes, not seconds, so the cost page gets its own tighter
// bucket: 3/min still lets an operator iterate, while capping how fast a script
// could drain TWO provider balances at once.
const COMPARE_VIDEO_RATE_LIMIT = { max: 3, timeWindow: '1 minute' }

// How long the request will wait for a channel before calling it inconclusive.
// Seedance 1.5 Pro measured ~76s end-to-end on kie.ai (2026-07-30), so 6 minutes is
// far beyond any real render and still bounds a hung provider. A channel that blows
// through it becomes an error PANEL, not a failed request — the other channel's
// receipt is still worth showing.
// 11 minutes, deliberately just OUTSIDE the DeepInfra adapter's own 10-minute
// request budget. It used to be 6, which was strictly worse than useless: the page
// gave up while the render was still running and still billing, printed
// "inconclusive", and the operator paid for a measurement they never saw. A
// comparison page must be the LAST thing to give up, not the first.
const VIDEO_DEADLINE_MS = 11 * 60 * 1000
const VIDEO_POLL_INTERVAL_MS = 5_000

// 16:9 pixel pairs per tier. The adapters derive their own resolution enum from the
// SHORT edge, so these have to be the real frame sizes rather than a ratio — and
// both channels get the SAME pair, which is the entire point of the endpoint.
const DIMENSIONS: Record<string, { width: number; height: number }> = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
}

// The channels this page can race. Exported so app.ts and the tests name them from
// ONE definition — a page whose channel list drifts from the contenders table would
// silently drop a provider from a comparison that still looks complete.
export type CompareChannel = 'segmind' | 'deepinfra' | 'kie'

// How each channel spells the SAME model. This table is the single place the
// translation lives, and both sides are read from ONE entry per request — a switch
// that half-applied would leave the page comparing two different models while
// looking exactly as trustworthy as a real measurement.
//
// The prefixes are carried deliberately: both adapters strip their own
// (`toDeepinfraModelId` / `toKieModelId`), so handing them a bare id produces a URL
// with no vendor path and an unreadable 404.
//
// 1.5 Pro is here for one reason: verifying that this page works costs ~$1.86 a run
// on Seedance 2.0, and about a tenth of that on 1.5 Pro. An operator should not have
// to buy the expensive question to check the machinery. DeepInfra's handle was
// confirmed live — it answers 402 (empty balance) rather than 404.
const MODEL_SPELLINGS = {
  'seedance-2-0': {
    label: 'Seedance 2.0',
    deepinfra: 'deepinfra:ByteDance/Seedance-2.0',
    kie: 'kie:bytedance/seedance-2',
    // Segmind's slug IS the endpoint's last path segment (POST /v2/seedance-2.0).
    segmind: 'segmind:seedance-2.0',
  },
  'seedance-1-5-pro': {
    label: 'Seedance 1.5 Pro',
    deepinfra: 'deepinfra:ByteDance/Seedance-1.5-Pro',
    kie: 'kie:bytedance/seedance-1.5-pro',
    segmind: 'segmind:seedance-1.5-pro',
  },
} as const

// The contenders. Same MODEL on both sides, because a comparison
// between different models measures the models, not the channels — and the question
// on the table is which pipe is cheaper for identical output.
type VideoContender = {
  channel: string
  label: string
  // Backend model handle in each channel's own spelling, carried WITH its synthetic
  // provider prefix: both adapters strip it themselves (`toDeepinfraModelId` /
  // `toKieModelId`), so handing them the bare id would silently produce a URL like
  // `…/seedance-2` with no vendor path and a 404 nobody could read.
  model: string
  provider: VideoProvider | null
  // Does this channel bill in its own credit denomination? kie.ai does ($0.005 a
  // credit), DeepInfra does not — it quotes USD directly. Drives whether the panel
  // shows the auditable credit count next to the dollars, and nothing else: the USD
  // figure always comes from the provider, never from this flag.
  creditDenominated: boolean
}

export type CompareRouteOptions = {
  // config.deepinfraToken. null = provider not configured: the route answers a
  // clean 502 provider_error instead of crashing boot — same optional-secret
  // discipline as the prompt enhancer and the Seedance channel.
  deepinfraToken: string | null
  // The two pipes the video cost page races. Injected (rather than constructed
  // here) so the wiring stays in app.ts with every other provider decision, and so
  // a test can hand in scripted providers instead of spending real money. A null /
  // absent channel becomes an ERROR PANEL, never a failed request — the realistic
  // state of this page is one key configured and one not, and an operator must
  // still be able to measure the half they have.
  kieProvider?: VideoProvider | null
  deepinfraProvider?: VideoProvider | null
  segmindProvider?: VideoProvider | null
  // Poll cadence and give-up deadline. Overridable so the suite can drive the loop
  // to its timeout branch in milliseconds instead of six real minutes.
  videoPollIntervalMs?: number
  videoDeadlineMs?: number
  // WHICH channels actually run. Defaults to both, which is what the tests exercise
  // and what the page is for.
  //
  // Production currently passes ['kie'] alone (see app.ts): the DeepInfra account
  // has no balance, so its panel could only ever render the same 402, and an error
  // that cannot change is noise rather than a measurement. Parked as a LIST rather
  // than deleted code — restoring the comparison is one word once the account is
  // funded, and the contender table, the label plumbing and every test stay alive
  // in the meantime.
  channels?: readonly CompareChannel[]
}

export function registerCompareRoutes(app: FastifyInstance, opts: CompareRouteOptions) {
  app.post(
    '/api/compare/generate',
    { config: { rateLimit: COMPARE_RATE_LIMIT } },
    async (req, reply) => {
      await app.requireUser(req)
      const parsed = compareGenerateInputSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'validation_failed',
            message: parsed.error.issues[0]?.message ?? 'invalid input',
          },
        })
      }
      if (!opts.deepinfraToken) {
        // Thrown (not replied) so the central handler shapes the envelope and
        // logs it as a provider_error like every other unconfigured backend.
        throw new DeepinfraImageError('qwen image is not configured (DEEPINFRA_TOKEN unset)')
      }
      // Wall time measured HERE, around the provider call only — request
      // parsing and auth must not pollute the number the page exists to show.
      const startedAt = Date.now()
      const { imageUrl, costUsd } = await generateQwenImage(opts.deepinfraToken, parsed.data.prompt)
      return { imageUrl, costUsd, durationMs: Date.now() - startedAt }
    },
  )

  app.post(
    '/api/compare/video',
    { config: { rateLimit: COMPARE_VIDEO_RATE_LIMIT } },
    async (req, reply) => {
      await app.requireUser(req)
      const parsed = compareVideoInputSchema.safeParse(req.body ?? {})
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'validation_failed',
            message: parsed.error.issues[0]?.message ?? 'invalid input',
          },
        })
      }
      const { prompt, durationSeconds, resolution, model, debug, channels } = parsed.data
      const size = DIMENSIONS[resolution] ?? DIMENSIONS['720p']!
      const spelling = MODEL_SPELLINGS[model]

      // ONE input object shared by BOTH channels, constructed once. Building it twice
      // is how a comparison quietly starts measuring two different jobs: a drifting
      // duration or resolution moves the price by 2-3× and the receipt still LOOKS
      // valid. The test asserts the two submits receive deep-equal input for exactly
      // this reason.
      const submitInput: VideoSubmitInput = {
        prompt,
        width: size.width,
        height: size.height,
        durationSeconds,
        // Explicitly OFF rather than omitted: ByteDance bills Seedance at exactly 2×
        // with audio, so leaving this to an adapter default would double one side of
        // the comparison. It is also what the product always buys — CinemaStudio
        // mixes its own voiceover over the clip.
        audio: false,
        // Filled per contender below; every OTHER field is identical by construction.
        model: '',
      }

      const contenders: VideoContender[] = [
        {
          // FIRST because it is the cheapest surveyed rate — flat $7.00/M on every
          // resolution, where DeepInfra bills a measured $7.70/M even at 720p.
          channel: 'segmind',
          label: `${spelling.label} · Segmind`,
          model: spelling.segmind,
          provider: opts.segmindProvider ?? null,
          creditDenominated: false,
        },
        {
          channel: 'deepinfra',
          label: `${spelling.label} · DeepInfra`,
          model: spelling.deepinfra,
          provider: opts.deepinfraProvider ?? null,
          creditDenominated: false,
        },
        {
          channel: 'kie',
          label: `${spelling.label} · kie.ai`,
          model: spelling.kie,
          provider: opts.kieProvider ?? null,
          creditDenominated: true,
        },
      ]

      // Filtered, not sliced: the order of `contenders` above stays the on-screen
      // order, and an unknown channel name in the option simply matches nothing
      // rather than shifting the panels around.
      // INTERSECTION, not replacement: the server's list is the ceiling and the
      // request may only narrow it. Obeying a request outright would let a caller
      // spend money on a channel the operator deliberately parked — an empty
      // DeepInfra balance today, a rate-limited account tomorrow.
      const enabled = opts.channels ?? ['segmind', 'deepinfra', 'kie']
      const active = contenders.filter(
        (contender) =>
          enabled.includes(contender.channel as CompareChannel) &&
          (channels === undefined || channels.includes(contender.channel)),
      )

      // Promise.all, not a loop with await: a serial race would report the SUM of two
      // renders as each one's wall time, and wall time is the second axis of the
      // comparison (a channel that is cheaper but 4× slower is not cheaper).
      const panels = await Promise.all(
        active.map((contender) =>
          runVideoChannel(contender, { ...submitInput, model: contender.model }, {
            pollIntervalMs: opts.videoPollIntervalMs ?? VIDEO_POLL_INTERVAL_MS,
            deadlineMs: opts.videoDeadlineMs ?? VIDEO_DEADLINE_MS,
            log: app.log,
            debug,
          }),
        ),
      )

      return { prompt, durationSeconds, resolution, panels }
    },
  )
}

// Runs ONE channel end to end and folds every outcome — including its own crash —
// into a panel. NEVER throws: a rejected promise here would take the sibling
// channel's receipt down with it via Promise.all, and "this provider refused the
// job" is a comparison result worth showing next to the one that succeeded.
async function runVideoChannel(
  contender: VideoContender,
  input: VideoSubmitInput,
  timing: {
    pollIntervalMs: number
    deadlineMs: number
    // Fastify's logger. Load-bearing on THIS route specifically: every other
    // provider failure in the app reaches the central error handler, which logs
    // `providerDetail` on its way to shaping the envelope. This route answers 200
    // and folds failures into panels, so it BYPASSES that handler entirely — with
    // no logging here a refusal leaves literally no trace, and the operator is left
    // staring at a panel that cost real money and explains nothing. Learned the
    // hard way on the first real run.
    log?: { warn: (obj: object, msg: string) => void }
    // Attach each channel's raw terminal envelope to its panel. OFF unless the
    // caller asked: the ordinary compare page must keep its guarantee that no
    // provider prose reaches the browser, while the operator verification page needs
    // exactly that prose to pin down an unobserved response shape.
    debug?: boolean
  },
): Promise<CompareVideoPanel> {
  const startedAt = Date.now()
  const base = { channel: contender.channel, label: contender.label }
  const errorPanel = (errorCode: ApiErrorCode, raw?: string): CompareVideoPanel => ({
    ...base,
    status: 'error',
    videoUrl: null,
    costUsd: null,
    creditsConsumed: null,
    durationMs: Date.now() - startedAt,
    errorCode,
    rawResponse: timing.debug === true ? (raw ?? null) : null,
  })

  if (!contender.provider) {
    timing.log?.warn(
      { event: 'compare.channel_failed', channel: contender.channel, phase: 'config' },
      'compare channel not configured',
    )
    return errorPanel('provider_error')
  }

  try {
    const { providerJobId } = await contender.provider.submit(input)
    const deadline = startedAt + timing.deadlineMs

    for (;;) {
      const result = await contender.provider.poll(providerJobId)

      if (result.status === 'success') {
        // The provider's OWN figure or NOTHING. Filling an absent cost from a rate
        // card is the exact substitution this endpoint exists to eliminate — a
        // missing number is information ("they did not bill us a stated amount"),
        // a guessed one is a lie that looks like a measurement.
        const costUsd = result.costUsd ?? null
        return {
          ...base,
          status: 'success',
          videoUrl: result.assetUrl ?? null,
          costUsd,
          // Derived back from their own USD at their published rate so the number on
          // screen can be checked against the balance in their dashboard, rather
          // than trusted. Rounded because 1.025 / 0.005 lands on 204.99999999999997.
          creditsConsumed:
            contender.creditDenominated && costUsd !== null
              ? Math.round((costUsd / KIE_CREDIT_USD) * 1000) / 1000
              : null,
          durationMs: Date.now() - startedAt,
          errorCode: null,
          rawResponse: timing.debug === true ? (result.raw ?? null) : null,
        }
      }

      if (result.status === 'error') {
        // The adapter's PROSE goes to the log; the panel gets a CATEGORY. Order
        // matters: a content refusal and an empty balance both arrive as "the
        // provider said no", but they demand opposite fixes — rewrite the prompt
        // versus top up the account — so `blocked` is checked before the generic
        // fallback rather than folded into it.
        timing.log?.warn(
          {
            event: 'compare.channel_failed',
            channel: contender.channel,
            phase: 'poll',
            blocked: result.blocked === true,
            detail: result.message,
          },
          'compare channel failed',
        )
        if (result.blocked === true) return errorPanel('content_blocked', result.raw)
        return errorPanel(result.code ?? 'provider_error', result.raw)
      }

      if (Date.now() >= deadline) {
        // 'conflict' is the app's existing "still processing, wait for it" category,
        // and that is the honest reading here: the render is probably still going
        // and will still bill us. Calling it a failure would put a $0 next to a job
        // that costs real money — the worst possible error on a cost page.
        timing.log?.warn(
          {
            event: 'compare.channel_failed',
            channel: contender.channel,
            phase: 'deadline',
            deadlineMs: timing.deadlineMs,
          },
          'compare channel did not settle',
        )
        return errorPanel('conflict')
      }

      await new Promise((resolve) => setTimeout(resolve, timing.pollIntervalMs))
    }
  } catch (err) {
    // The provider's OWN words (`providerDetail`) go to the LOG and never to the
    // browser — they can name an account or a balance. The panel gets the adapter's
    // sanitized `message`, which is exactly the split these error classes were built
    // for.
    timing.log?.warn(
      {
        event: 'compare.channel_failed',
        channel: contender.channel,
        phase: 'submit',
        message: err instanceof Error ? err.message : String(err),
        providerDetail: providerDetailOf(err),
      },
      'compare channel failed',
    )
    return errorPanel(channelErrorCode(err))
  }
}

// The adapter error classes all carry an `apiCode` for exactly this purpose — the
// same field app.ts's central handler reads when it shapes an envelope. Reading it
// here keeps ONE definition of "what kind of failure was that" instead of a second
// one derived by matching the prose in `message`, which is how a page ends up
// printing "kie.ai rejected the job (HTTP 200)" at a human.
//
// Anything without an apiCode is an unexpected crash in OUR code, not a provider
// verdict, so it degrades to the generic category — the real text was logged.
function channelErrorCode(err: unknown): ApiErrorCode {
  if (typeof err === 'object' && err !== null && 'apiCode' in err) {
    const code = (err as { apiCode?: unknown }).apiCode
    if (typeof code === 'string' && API_ERROR_CODES.has(code)) return code as ApiErrorCode
  }
  return 'provider_error'
}

const API_ERROR_CODES = new Set<string>(apiErrorCodeSchema.options)

function providerDetailOf(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'providerDetail' in err) {
    const detail = (err as { providerDetail?: unknown }).providerDetail
    return typeof detail === 'string' ? detail : undefined
  }
  return undefined
}
