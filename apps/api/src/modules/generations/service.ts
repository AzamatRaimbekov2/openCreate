// Generation lifecycle service (plan Task 10) — the core of the product.
// One place owns the whole money-touching sequence: charge credits at submit
// (the ADR's hold→settle collapsed), call Runware, persist state transitions,
// download finished assets into our storage (Runware URLs expire in 7 days),
// and refund exactly once on failure. Injected deps (db/runware/storage) keep
// it fully testable with the scripted fake in test/helpers/build-test-app.ts.
import { randomUUID } from 'node:crypto'
import { and, desc, eq, lt, or } from 'drizzle-orm'
import { applyPromptPreset, resolveBuiltinStyle } from '@opencreate/contracts'
import type { CreateGenerationInput, Generation, PromptPreset } from '@opencreate/contracts'
import type { Db } from '../../db/client'
import type { RunwareClient } from '../../integrations/runware/client'
import { createRunwareVideoAdapter } from '../../integrations/runware/video-adapter'
import { createRunwareImageAdapter } from '../../integrations/runware/image-adapter'
import { createRunwareAudioAdapter } from '../../integrations/runware/audio-adapter'
import { createRunwareMeshAdapter } from '../../integrations/runware/mesh-adapter'
import type { VideoProvider, VideoProviderId } from '../../integrations/video-provider'
import type {
  ImageProvider,
  ImageProviderId,
  ImageReference,
} from '../../integrations/image-provider'
import type { AudioProvider } from '../../integrations/audio-provider'
import type { Mesh3dProvider } from '../../integrations/mesh-provider'
import type { StorageProvider } from '../../storage/local'
import { generation, generationEntity } from '../../db/schema'
import { chargeCredits, logCharge, logRefund, refundCredits, type MoneyLog } from '../credits/ledger'
import { composePrompt } from '../entities/mentions'
import type { MentionEntities } from '../entities/mentions'
import type { EntityService } from '../entities/service'
// Type-only, and the direction matters: styles → generations is the runtime
// dependency (the registry never imports this file), so naming its result type
// here closes no cycle.
import type { ResolvedStyle } from '../styles/service'
import { creditsFor, getModel, resolutionFor } from '../catalog/catalog'

// Server-only create() input (ADR modular-3d-assets, Task 4). The wire contract
// `createGenerationInputSchema` is unchanged; this widens ONLY the service-level
// input an in-process orchestrator may build directly, adding a raw reference
// image data-URI channel (`referenceImages`). It is intentionally NOT on the zod
// schema the generation route parses, so a client body can never carry it (zod
// strips unknown keys) — only code in this process (assets3d.extract) can set it.
export type CreateGenerationServiceInput = CreateGenerationInput & { referenceImages?: string[] }

// Domain errors carry statusCode + apiCode so the central error handler in
// app.ts maps them straight to the ApiError envelope — no per-route mapping.
export class NotFoundError extends Error {
  statusCode = 404
  apiCode = 'not_found'
}
export class ValidationError extends Error {
  statusCode = 400
  apiCode = 'validation_failed'
}
// 409: the request is well-formed but the resource's current state forbids it
// (contracts 'conflict'). Used when deleting a still-processing generation —
// see remove() for why that must be refused rather than honored.
export class ConflictError extends Error {
  statusCode = 409
  apiCode = 'conflict'
}
// Runware flagged the produced asset NSFW (safety.checkContent). The spec's
// moderation stance (risk §9.4): flagged content is NEVER stored or served,
// the user gets a clear safety message, and the charge is refunded. 422 —
// the request was well-formed; the CONTENT was rejected.
export class ContentBlockedError extends Error {
  statusCode = 422
  apiCode = 'content_blocked'
  constructor() {
    super('Blocked by the content safety filter')
  }
}

// `log` is the BASE app logger — the fallback for money-path events. Routes
// additionally pass their per-request child logger (req.log) into create/get
// so charge/refund/settle/provider-error lines carry the request's reqId.
// `pollMinIntervalMs` (default DEFAULT_POLL_MIN_INTERVAL_MS) throttles how
// often ONE generation may hit Runware getResponse — injectable so tests can
// disable (0) or exercise it without real clocks.
type Deps = {
  db: Db
  // Still the client every OTHER Runware-backed path is built from (video,
  // audio and 3D adapters are derived from it below), and the source of the
  // image seam's own fallback when no registry is injected.
  runware: RunwareClient
  // IMAGE provider (ImageProvider seam). Optional: when absent it is derived
  // from `runware`, which keeps every direct-service unit test constructing
  // { db, runware, storage } on exactly the synchronous path it always had.
  // buildApp injects the real chain — Seedream on kie.ai, with Runware behind it.
  imageProvider?: ImageProvider
  // Where OUR stored media is publicly reachable (config.mediaPublicBaseUrl).
  // Only reference images need it, and only for providers that fetch by URL
  // rather than taking bytes inline. Absent → references carry no public URL and
  // a URL-only backend refuses the job, which the failover chain answers by
  // running it on a backend that takes data URIs.
  mediaPublicBaseUrl?: string | undefined
  // VIDEO provider registry (VideoProvider seam). Optional: when absent the
  // service derives a single-entry { runware } registry from `runware`, so the
  // existing direct-service unit tests (poll-throttle/stale/atomicity) keep
  // working with just { db, runware, storage }. buildApp injects the full
  // registry (runware adapter + wan-runpod ComfyUI client).
  videoProviders?: Record<VideoProviderId, VideoProvider>
  // AUDIO provider (CinemaStudio music/voiceover). Optional: when absent it is
  // derived from `runware` (createRunwareAudioAdapter), mirroring the video
  // registry fallback so existing { db, runware, storage } callers keep working.
  // Audio submits through this; it POLLS through the video registry (an audio
  // row is provider:'runware', and the runware video adapter now maps audioURL).
  audioProvider?: AudioProvider
  // MESH provider (Studio3D photo→3D). Optional, derived from `runware` when
  // absent (createRunwareMeshAdapter) exactly like the audio fallback, so the
  // direct-service unit tests that construct { db, runware, storage } keep a
  // working 3D path. A single adapter rather than a registry: 'runware' is the
  // only backend built ('comfy-3d' is the designed-but-unbuilt self-host seam).
  // A 3D job submits AND polls through this — never through the video registry,
  // whose videoInference task could never produce a mesh.
  meshProvider?: Mesh3dProvider
  storage: StorageProvider
  // Entity library. Optional so the many direct-service unit tests that predate
  // tagging keep constructing the service with { db, runware, storage }: without
  // it, a request carrying entityRefs is rejected rather than silently untagged.
  entities?: EntityService
  // Style registry lookup (ADR style-studio D1/D3). A FUNCTION, not the style
  // service: this path needs exactly one question answered — "what fragments
  // does this styleId mean for this user, if any?" — and taking the whole
  // service would hand the money path a create/update/delete surface it has no
  // business holding.
  //
  // Optional, and its absence is a real mode rather than an oversight: without
  // it the service falls back to BUILTIN-ONLY resolution, which is exactly what
  // the many direct-service unit tests constructing { db, runware, storage }
  // need (they predate user styles and must keep composing builtins). buildApp
  // always injects the registry, so the product path is never builtin-only.
  //
  // It answers the WHOLE style — fragments AND the stored paths of its reference
  // images (ADR style-studio A2) — because the two always travel together and a
  // second lookup would be a second place for the ownership rule to be forgotten.
  // PATHS, not bytes: this service decides what its model can honour and reads
  // only what it will actually send, so a style with three images costs nothing
  // to resolve on a model that takes no references at all.
  resolveStyle?: (userId: string, styleId: string) => ResolvedStyle | null
  log?: MoneyLog
  pollMinIntervalMs?: number
}

// Minimum wall-clock gap between two Runware getResponse calls for the SAME
// generation (review finding): get() doubles as the poll, so N open tabs (or
// a scripted client) polling one processing row translated 1:1 into provider
// calls. 3s stays under the SPA's own 4s poll cadence — a single well-behaved
// client is never throttled — while capping what any number of concurrent
// pollers can do to the provider. Polls inside the window are answered from
// the DB state, which is at most one interval stale.
export const DEFAULT_POLL_MIN_INTERVAL_MS = 3000

// How long a row may stay 'processing' before it counts as abandoned. There
// are no background workers in the MVP — settlement is driven entirely by the
// SPA's polls — so a row nobody can settle (expired 7-day Runware asset URL,
// persistent download failure, crash between insert and submit) would hold
// the user's credits forever. Runware video jobs finish in minutes; one hour
// is far beyond any legitimate in-flight generation.
export const STALE_PROCESSING_MS = 60 * 60 * 1000

// Guarded terminal transition shared by EVERY failure path (image catch,
// video submit catch, poll error, NSFW, no-asset, stale sweep): a single
// check-and-set transaction in which ONLY a row still 'processing' is flipped
// to failed, and ONLY that flip triggers the refund. A row that raced to
// 'succeeded' is left completely alone — refunding it would hand the user the
// asset AND the money. refundCredits stays idempotent on top (once-per-
// generation guard in the ledger), so no combination of callers can
// double-refund or resurrect a row.
function failGeneration(
  db: Db,
  userId: string,
  id: string,
  errorMessage: string,
  // Machine-readable reason for failures the SPA localizes specially
  // ('content_blocked'); null for ordinary provider/timeout failures where
  // the errorMessage itself is shown.
  errorCode: 'content_blocked' | null = null,
  log?: MoneyLog,
) {
  let failed = false
  let refunded = 0
  // Fail-flip AND refund in ONE transaction (review finding): they used to be
  // two transactions in flip-then-refund order, so a crash between them left a
  // permanently failed row whose charge was never given back — unrecoverable,
  // because the stale sweep only rescues rows still 'processing'. Now either
  // both commit or neither does: a refund failure aborts the flip too, the row
  // stays processing, and the next poll (or the sweep) re-runs the settlement.
  db.transaction((tx) => {
    // Check-and-set guards the WHOLE settlement, refund included (review
    // finding: refund-after-success race). The refund used to run
    // unconditionally here while only the flip was status-guarded — a row a
    // concurrent settler had already flipped to 'succeeded' stayed succeeded
    // but was REFUNDED anyway: the user kept both the asset and the money.
    // Only the processing → failed transition may trigger the refund; any
    // other current status (succeeded, or already failed = already refunded,
    // since flip+refund commit together) means there is nothing to settle.
    const fresh = tx.select().from(generation).where(eq(generation.id, id)).get()
    if (fresh?.status !== 'processing') return
    tx.update(generation)
      .set({ status: 'failed', errorMessage, errorCode, completedAt: new Date() })
      .where(eq(generation.id, id))
      .run()
    failed = true
    // Refund joins the same transaction (idempotent inside the ledger — the
    // once-per-generation guard runs on this tx too, so concurrent settlers
    // still cannot double-credit).
    refunded = refundCredits(db, userId, id, undefined, tx)
  })
  // Money-path logs strictly AFTER the commit — an aborted settlement must
  // never leave phantom fail/refund lines in the audit trail. Only the call
  // that actually flipped the row logs — losers of the concurrent-settle race
  // stay silent, and the refund line is gated on a real balance mutation.
  if (failed)
    log?.warn(
      { event: 'generation.fail', userId, generationId: id, errorMessage, errorCode },
      'generation failed',
    )
  if (refunded > 0) logRefund(log, userId, id, refunded)
}

// Boot-time sweep (wired in app.ts): settles processing rows older than the
// staleness threshold even if their owner never polls again — the spec's
// hold→settle/refund guarantee must not depend on the SPA staying open.
export function settleStaleGenerations(db: Db, now = Date.now(), log?: MoneyLog): number {
  const cutoff = new Date(now - STALE_PROCESSING_MS)
  const rows = db
    .select()
    .from(generation)
    .where(and(eq(generation.status, 'processing'), lt(generation.createdAt, cutoff)))
    .all()
  for (const row of rows) failGeneration(db, row.userId, row.id, 'generation timed out', null, log)
  return rows.length
}

// The on-disk extension for a finished asset of each media type. Video → mp4,
// audio → mp3 (CinemaStudio), model3d → glb (Studio3D), everything else (image)
// → webp. One place owns the mapping so the download (get), the discard-on-race
// cleanup (image path), and remove() can never disagree about a generation's file
// name — and so a mesh can never be written under an image extension, which would
// produce a file no GLB loader on the web side can open.
function assetExt(type: 'image' | 'video' | 'audio' | 'model3d'): 'mp4' | 'mp3' | 'glb' | 'webp' {
  if (type === 'video') return 'mp4'
  if (type === 'audio') return 'mp3'
  if (type === 'model3d') return 'glb'
  return 'webp'
}

// A stored '/media/<key>.<ext>' path → a URL a PROVIDER can fetch, or null when
// it cannot be one. Null is the honest answer in two ordinary cases: no public
// base is configured (local dev), or the reference never was a stored asset (raw
// bytes handed in by an in-process orchestrator). A backend that only takes URLs
// refuses such a job, and the failover chain runs it on one that takes bytes —
// which is why this returns null rather than inventing a localhost URL that
// would fail at the vendor, after the charge, with a confusing message.
function publicMediaUrl(base: string | undefined, path: string | null): string | null {
  if (!base || !path) return null
  // Already absolute (an R2 public domain, say) → hand it over untouched.
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return path.startsWith('/') ? base + path : base + '/' + path
}

// DB row → wire DTO (contracts generationSchema). JSON columns are parsed here
// and dates leave as ISO strings — the wire contract is JSON, not Date objects.
function toDto(row: typeof generation.$inferSelect): Generation {
  return {
    id: row.id,
    type: row.type,
    mode: row.mode,
    status: row.status,
    prompt: row.prompt,
    // CinemaStudio (ADR §3): the model-facing composed prompt (null on preset-
    // less/legacy rows → the client falls back to `prompt`) and the structured
    // preset echoed back so the composer can pre-fill pickers on Regenerate.
    composedPrompt: row.composedPrompt,
    promptPreset: row.promptPresetJson
      ? (JSON.parse(row.promptPresetJson) as Generation['promptPreset'])
      : null,
    modelId: row.modelId,
    params: JSON.parse(row.paramsJson) as Generation['params'],
    costCredits: row.costCredits,
    mediaUrls: JSON.parse(row.mediaJson) as string[],
    progress: row.progress,
    errorMessage: row.errorMessage,
    // The column stores only values from the contracts ApiErrorCode enum
    // (writes go through failGeneration / the ContentBlockedError path).
    errorCode: row.errorCode as Generation['errorCode'],
    createdAt: new Date(row.createdAt).toISOString(),
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
  }
}

export type GenerationService = ReturnType<typeof createGenerationService>

export function createGenerationService({
  db,
  runware,
  videoProviders,
  audioProvider,
  meshProvider,
  imageProvider,
  mediaPublicBaseUrl,
  storage,
  entities,
  resolveStyle,
  log: baseLog,
  pollMinIntervalMs = DEFAULT_POLL_MIN_INTERVAL_MS,
}: Deps) {
  // Image provider fallback. The seam is new; this line is what makes it a
  // refactor rather than a rewrite — a caller injecting only { db, runware,
  // storage } gets the Runware adapter, whose submit is the same synchronous
  // imageInference call that used to be inline here, settled in the same request.
  const images: ImageProvider = imageProvider ?? createRunwareImageAdapter(runware)
  // Audio provider fallback (mirrors the video registry fallback below): a
  // caller that injects only { db, runware, storage } still gets a working
  // audio submit path via the runware audioInference adapter.
  const audio: AudioProvider = audioProvider ?? createRunwareAudioAdapter(runware)
  // Mesh provider fallback, same contract as audio's: a caller that injects only
  // { db, runware, storage } still gets a working photo→3D path via the runware
  // 3dInference adapter. Not a registry — see the Deps note.
  const mesh: Mesh3dProvider = meshProvider ?? createRunwareMeshAdapter(runware)
  // Resolve the VIDEO provider registry. Fallback keeps direct-service callers
  // (unit tests passing only { db, runware, storage }) working: they get the
  // runware adapter wrapping their scripted RunwareClient, so submitVideo/
  // getResponse are still exercised exactly as before. Production/buildApp
  // injects the full registry including the wan-runpod ComfyUI client.
  const providers: Partial<Record<VideoProviderId, VideoProvider>> = videoProviders ?? {
    runware: createRunwareVideoAdapter(runware),
  }
  // A video job always polls the backend it was SUBMITTED to (durable state on
  // the row), so an unknown/legacy provider string safely resolves to runware.
  const resolveProvider = (id: string): VideoProvider => {
    const provider = providers[id as VideoProviderId] ?? providers.runware
    if (!provider) {
      // Registry misconfigured (no runware entry) — surface as a provider error
      // so the guarded fail+refund settles the row instead of a raw 500.
      throw Object.assign(new Error(`no video provider registered for '${id}'`), {
        statusCode: 502,
        apiCode: 'provider_error',
      })
    }
    return provider
  }
  // Per-generation timestamp of the last REAL Runware poll. In-memory on
  // purpose (MVP is a single process): losing it on restart merely allows one
  // extra provider call per generation, which is harmless. Entries are
  // dropped on every terminal transition observed by get() so the map only
  // ever holds currently-processing generations.
  const lastPolledAt = new Map<string, number>()
  // `created: true` → the asset is final (image, sync) → route answers 201.
  // `created: false` → accepted for async processing (video) → route answers 202.
  // `reqLog` is the caller's request-scoped logger (req.log) so every money
  // event of this call carries the reqId; baseLog covers non-request callers.
  async function create(
    userId: string,
    input: CreateGenerationServiceInput,
    reqLog?: MoneyLog,
  ): Promise<{ dto: Generation; created: boolean }> {
    const log = reqLog ?? baseLog
    // Catalog-level validation BEFORE charging: zod already validated the
    // shape, but only the catalog knows which combinations are real.
    const model = getModel(input.modelId)
    if (!model) throw new ValidationError(`unknown model ${input.modelId}`)
    // Aspect ratio is required for image/video and enforced against the model's
    // list; audio has none (CinemaStudio) and NEITHER DOES A MESH (Studio3D) —
    // both skip resolution entirely, so both skip this gate. (The model3d catalog
    // entries carry a throwaway '1:1' only because catalogBase demands >=1; the
    // service never reads it.)
    if (model.type !== 'audio' && model.type !== 'model3d') {
      if (!input.aspectRatio) throw new ValidationError(`aspectRatio required for ${model.id}`)
      if (!model.aspectRatios.includes(input.aspectRatio))
        throw new ValidationError(`aspect ${input.aspectRatio} unsupported for ${model.id}`)
    }
    if (input.inputImage && !model.supportsImageInput)
      throw new ValidationError(`${model.id} does not support image input`)
    // v1 Studio3D is image→3D ONLY. Text→3D exists on the provider (Tripo) but the
    // composer UX for it does not, and a model3d row with no photo would submit a
    // 3dInference task with an empty `inputs.images` and fail AFTER the charge.
    // Like every guard above it, this runs BEFORE chargeCredits: a job we already
    // know cannot succeed must cost the user nothing.
    if (model.type === 'model3d' && !input.inputImage)
      throw new ValidationError(`${model.id} requires a photo`)
    // Hoisted above its use in composition because the STYLE inside it is
    // resolved here, with the other pre-charge guards.
    const preset: PromptPreset | undefined = input.promptPreset
    // STYLE RESOLUTION (ADR style-studio D1/D3), and it sits up here with the
    // other capability guards for the same reason they do: it runs before the
    // charge, before any provider call, and before the reference-image reads
    // below — a request we already know cannot compose correctly must cost the
    // user nothing and must not do work on their behalf.
    //
    // The registry answers builtin OR the caller's own row. `null` covers three
    // situations that must stay INDISTINGUISHABLE at the boundary — an id that
    // never existed, one that belongs to someone else, and one the user deleted
    // — so a generation request can never be used to discover which style ids
    // exist, and a foreign style's fragments can never leak into an error.
    //
    // Deleted is worth naming: deleting a style deliberately does not rewrite
    // the films and shots that cited it (ADR D4), so this 400 is exactly how an
    // old shot reports "the style you used is gone" — honestly, and for free.
    let resolvedStyle: ResolvedStyle | null = null
    if (preset?.styleId) {
      if (resolveStyle) resolvedStyle = resolveStyle(userId, preset.styleId)
      else {
        // No registry injected (direct-service unit tests): builtin-only, and a
        // builtin can never carry images — it is code, and code has nowhere to
        // keep a file — so the path list is empty by construction, not by
        // omission.
        const builtin = resolveBuiltinStyle(preset.styleId)
        resolvedStyle = builtin
          ? { fragment: builtin.fragment, negative: builtin.negative, referenceImagePaths: [] }
          : null
      }
      if (!resolvedStyle) throw new ValidationError(`unknown style ${preset.styleId}`)
    }
    // Canvas chain edge (ADR canvas-mode D2). Capability first, resolution
    // second — a citation the model cannot honour must cost nothing and fail
    // with the reason, not with a confusing reference-count error.
    if (input.inputGenerationId) {
      if (model.type === 'image' && !model.referenceMode)
        throw new ValidationError(`${model.id} cannot condition on a reference image`)
      if (model.type === 'video' && !model.supportsImageInput)
        throw new ValidationError(`${model.id} does not support image input`)
      if (model.type !== 'image' && model.type !== 'video')
        throw new ValidationError(`${model.id} cannot take a generation as input`)
    }
    // Resolve the citation to the caller's OWN stored media. Four default-deny
    // checks share ONE error (copyGeneratedAsset precedent): a foreign id, a
    // missing id, a failed run and a video source must all be
    // indistinguishable — nothing about other users' rows may leak.
    let chainImage: string | undefined
    // The /media path the seed frame was read from — kept because a URL-taking
    // backend (Segmind) needs the address, and readAsDataUri below turns the path
    // into bytes from which no address can be recovered.
    let chainImagePath: string | undefined
    if (input.inputGenerationId) {
      const cited = db
        .select()
        .from(generation)
        .where(eq(generation.id, input.inputGenerationId))
        .get()
      const mediaUrl =
        cited && cited.userId === userId && cited.status === 'succeeded' && cited.type === 'image'
          ? ((JSON.parse(cited.mediaJson) as string[])[0] ?? null)
          : null
      if (!mediaUrl)
        throw new ValidationError(
          'inputGenerationId must cite your own succeeded image generation',
        )
      // readAsDataUri re-guards the disk read (raster-only MIME table) and
      // hands the provider a data URI — /media is not reachable from outside.
      chainImage = await storage.readAsDataUri(mediaUrl)
      chainImagePath = mediaUrl
      if (model.type === 'image') {
        // Into the SAME server-only channel entity photos and shot references
        // use — so the referenceMode/maxReferenceImages gates below count it,
        // and the provider call needs no new plumbing at all.
        input = { ...input, referenceImages: [...(input.referenceImages ?? []), chainImage] }
      }
    }
    // Native generation audio is a CAPABILITY (catalog `nativeAudio`), and the
    // API decides — the composer filters the toggle, but a capability the client
    // can lie about is not one (same law as referenceMode). Runs BEFORE the
    // charge: on models without a switch the request would silently render a
    // silent clip at whatever price we guessed.
    if (input.audio === true && (model.type !== 'video' || !model.nativeAudio))
      throw new ValidationError(`${model.id} has no native audio`)
    // Whether THIS clip will carry a soundtrack — provenance for the film render
    // (it maps a clip's audio stream only when the row says one exists) and the
    // pricing input below. 'always' models (Wan 2.7 direct) ship audio in every
    // clip whether or not the request asked.
    const nativeAudio =
      model.type === 'video' &&
      (model.nativeAudio === 'always' || (input.audio === true && model.nativeAudio === 'switchable'))

    // ── Tagged entities ──────────────────────────────────────────────────────
    // Everything here runs BEFORE the charge. A tag the model cannot honour, or
    // an entity with no photo, must cost the user nothing: the provider would
    // happily return a plausible image of a stranger for full price.
    const refs = input.entityRefs ?? []
    let referenceImages: string[] | undefined
    // Index-aligned with referenceImages: the /media path each reference came
    // from, or null when it never had one (a caller-supplied data URI that is
    // not a stored asset). Exists because kie.ai's Seedream takes reference
    // images as URLS ONLY, and a data URI is not convertible into one — the
    // path has to be remembered at the moment we still have it, not
    // reconstructed later from bytes.
    const referencePaths: Array<string | null> = []
    let mentionEntities: MentionEntities = {}

    // Server-only DIRECT reference channel (ADR modular-3d-assets, Task 4). An
    // in-process orchestrator (assets3d.extract) may hand create() a raw reference
    // image data URI that is NOT an entity — the concept image a part is redrawn
    // from. It rides `input.referenceImages`, which is DELIBERATELY absent from the
    // client-facing `createGenerationInputSchema`: the generation route zod-parses
    // the body and zod strips unknown keys, so no client can ever inject it — only
    // code that builds the input object directly (in this process) can set it.
    //
    // The capability gate below runs on the TOTAL ref count and is NOT nested under
    // `if (refs.length > 0)`: a pure concept extraction has zero entityRefs, so a
    // gate hidden inside the entity block would be skipped and a model without
    // referenceMode would be charged for a job it cannot honour. Like every other
    // guard here it runs BEFORE the charge — an impossible job costs nothing.
    const directRefs = input.referenceImages ?? []
    if (directRefs.length > 0) {
      const total = refs.length + directRefs.length
      if (!model.referenceMode) throw new ValidationError(`${model.id} cannot use reference images`)
      if (total > (model.maxReferenceImages ?? 1))
        throw new ValidationError(
          `${model.id} accepts at most ${model.maxReferenceImages ?? 1} reference image(s)`,
        )
    }

    if (refs.length > 0) {
      if (!entities) throw new ValidationError('entity tagging is unavailable')
      // The client filters the model list on `referenceMode`; the API decides.
      // A capability the client can lie about is not a capability.
      if (!model.referenceMode)
        throw new ValidationError(`${model.id} cannot use reference images`)
      if (refs.length > (model.maxReferenceImages ?? 1))
        throw new ValidationError(
          `${model.id} accepts at most ${model.maxReferenceImages ?? 1} reference image(s)`,
        )
      // Scoped to this user and to alive rows: a foreign or deleted id simply does
      // not come back, and composePrompt below turns the miss into a 400 without
      // ever revealing whether that id exists for someone else.
      mentionEntities = await entities.loadForMentions(
        userId,
        refs.map((ref) => ref.entityId),
      )
    }

    // ALWAYS compose, even with zero refs, and BEFORE fetching any photo.
    // · Skipping the pass when refs are empty let a prompt carrying a stray
    //   `[[e1]]` sail through to the text encoder, which reads it as words —
    //   the exact silent poisoning this protocol exists to prevent.
    // · Composing before the photo lookup means an unauthorized entityId fails
    //   as "unknown entity" here, rather than leaking through a not-found on a
    //   subsequent get() that names someone else's row.
    let composedPrompt: string
    try {
      composedPrompt = composePrompt(input.prompt, refs, mentionEntities)
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : 'invalid entity refs')
    }

    if (refs.length > 0 && entities) {
      // The photo is the whole point of the tag: with none, the generation is
      // indistinguishable from an untagged one — and just as expensive.
      const urls: string[] = []
      for (const ref of refs) {
        const dto = await entities.get(userId, ref.entityId)
        const url = entities.referenceImageUrl(dto)
        if (!url) throw new ValidationError(`entity ${dto.name} has no photo to use as a reference`)
        // Runware conditions on data URIs. Our /media paths are not publicly
        // reachable in dev (or behind a private asset host), so handing over a
        // URL would fail exactly where we test it. (ADR: reference delivery.)
        urls.push(await storage.readAsDataUri(url))
        // The same asset, as the path a URL-taking provider can be pointed at.
        referencePaths.push(url)
      }
      referenceImages = urls
    }

    // Fold the server-supplied direct refs in AFTER any entity-derived ones, so a
    // mixed call (an entity tag PLUS a concept image) delivers both. Unconditional
    // — NOT nested under the entity block above, which a concept-only extraction
    // never enters; without this the concept ref would be dropped silently and the
    // extractor would redraw from the prompt alone at full price.
    if (directRefs.length > 0) {
      referenceImages = [...(referenceImages ?? []), ...directRefs]
      // Raw bytes from an in-process orchestrator: no stored path exists, so no
      // public URL can. Recorded as nulls to keep the arrays aligned — a
      // URL-only provider refuses such a job and the chain runs it elsewhere.
      referencePaths.push(...directRefs.map(() => null))
    }

    // ── The style package's reference images (ADR style-studio A2/A3) ─────────
    // LAST, and that position is the whole design. A style is AMBIENT: the user
    // picked an atmosphere, not these specific pictures, whereas an entity tag
    // and a shot attachment are things they explicitly put in this shot. So the
    // style's images are appended after everything else, and they are the ones
    // that give way when the model cannot take them all.
    //
    // Three rules, and every one of them is "the style must never make a request
    // that would have worked fail":
    //
    //  1. NO CAPABILITY REFUSAL (A3). A model with no `referenceMode` — every
    //     image model that is not an edit model, every video model without r2v,
    //     and audio/3D by construction — simply does not get them. It is the
    //     owner's 2026-07-24 shot-reference precedent verbatim ("refs are simply
    //     dropped silently for such models"), and it is what lets a user keep one
    //     style and generate with it on ANY model: the fragments always apply,
    //     the pictures apply where they can.
    //
    //  2. THE COUNT GATE ABOVE NEVER SEES THEM. That gate throws a 400, and it
    //     runs on entity + direct refs only. If style images were folded in
    //     before it, attaching a third picture to a style would start rejecting
    //     kontext generations that tag a character — a failure the user could not
    //     possibly connect to the style they edited last week. Instead the budget
    //     is computed here and the overflow is TRIMMED, silently.
    //
    //  3. A DEAD FILE IS NOT A FAILED GENERATION. A missing stored file (a
    //     half-restored backup, a manual media cleanup) drops that one reference
    //     with a warn line for the operator and lets the paid request continue.
    //     Failing here would refuse a generation over a picture the user did not
    //     ask for in this request.
    //
    // Runs BEFORE the charge like every other reference read, so the I/O happens
    // in the same phase as the rest and nothing here can fail after money moved.
    const stylePaths = resolvedStyle?.referenceImagePaths ?? []
    if (stylePaths.length > 0 && model.referenceMode) {
      // What is left after the refs the user explicitly asked for. `?? 1` is the
      // catalog's own default for a reference-capable model, the same fallback
      // the gates above use, so one model can never be read two ways.
      const budget = (model.maxReferenceImages ?? 1) - (referenceImages?.length ?? 0)
      const styleImages: string[] = []
      // The paths of the images that actually READ — collected here rather than
      // sliced off stylePaths afterwards, because a read that fails in the MIDDLE
      // would leave the two lists misaligned and hand a provider the wrong URL
      // for a reference it was given the right bytes for.
      const styleImagePaths: string[] = []
      for (const path of stylePaths) {
        if (styleImages.length >= budget) break
        try {
          styleImages.push(await storage.readAsDataUri(path))
          styleImagePaths.push(path)
        } catch (err) {
          // Not a failure of THIS request — a fact about our storage. Logged so
          // the operator can find the dangling row; the generation goes on.
          log?.warn(
            { event: 'style.reference.missing', userId, styleId: preset?.styleId, path, err },
            'style reference image could not be read; dropping it',
          )
        }
      }
      if (styleImages.length > 0) {
        referenceImages = [...(referenceImages ?? []), ...styleImages]
        // Style references ARE stored assets, so they keep their paths.
        for (const path of styleImagePaths) referencePaths.push(path)
      }
    }

    let cost: number
    try {
      // Audio-on prices from the with-audio table on 'switchable' models — the
      // provider bills sound at ~2×, and the owner chose honest margin over a
      // flat price (2026-07-15). 'always' models price identically either way.
      cost = creditsFor(model, input.duration, input.audio === true)
    } catch (err) {
      // creditsFor throws plain Errors (missing/unsupported duration) — those
      // are caller mistakes, so surface as 400, not 500.
      throw new ValidationError(err instanceof Error ? err.message : 'invalid duration')
    }
    // Resolution is derived for image/video only; audio has no aspect ratio and a
    // MESH has no 2D resolution at all. (The 0,0 placeholders are never sent — the
    // audio and model3d submit branches ignore them. Calling resolutionFor here
    // with a model3d row would mean passing the `aspectRatio!` the guard above
    // deliberately does not require.)
    const { width, height } =
      model.type === 'audio' || model.type === 'model3d'
        ? { width: 0, height: 0 }
        : resolutionFor(model, input.aspectRatio!)

    // CinemaStudio preset composition (ADR §3). The entity substitution above
    // produced `composedPrompt` (the model-facing text with [[e1]] resolved);
    // applyPromptPreset wraps the structured style/camera/motion/quality
    // fragments around it. With NO preset this returns composedPrompt unchanged
    // and an empty negative, so every existing (preset-less) request is byte-for-
    // byte identical. `modelPrompt` is what the provider actually receives.
    //
    // The style fragments were RESOLVED far above (with the pre-charge guards)
    // and are merely passed in here, because applyPromptPreset no longer owns a
    // style table (ADR style-studio D3). A builtin resolves to exactly the
    // strings the composer used to look up itself, which is what keeps every
    // pre-existing styled generation composing to the identical prompt; a user
    // style arrives as the same two strings and is therefore indistinguishable
    // from here on — no branch, no second code path, no new money code.
    const { positivePrompt: modelPrompt, negativePrompt } = applyPromptPreset(
      composedPrompt,
      preset,
      // ResolvedStyle IS a StyleFragments plus paths, so composition reads the
      // two strings it always did and never learns that images exist.
      resolvedStyle ?? undefined,
    )
    // Stored only when a preset was supplied: composed_prompt is the debugging/
    // provenance record of the fully-composed text; a preset-less row leaves it
    // NULL and the DTO falls back to `prompt`.
    const composedPromptCol = preset ? modelPrompt : null
    const promptPresetJson = preset ? JSON.stringify(preset) : null

    const id = randomUUID()
    const taskUUID = randomUUID()
    const now = new Date()
    // A cited generation conditions the run just as much as an uploaded frame
    // does, so a chain run is image-mode too (the gallery/DTO read it as such).
    const mode = input.inputImage || input.inputGenerationId ? 'image' : 'text'
    // Which backend runs this job, persisted so the poll path resolves the same
    // one it submitted to. Video reads the catalog `provider`; an IMAGE row now
    // records where its chain STARTS ('kie' when the entry has a Seedream
    // mapping) — the link that actually ran is encoded into the job id by the
    // failover chain, so this column is the intent and that id is the fact.
    const providerId: VideoProviderId | ImageProviderId =
      model.type === 'video'
        ? (model.provider ?? 'runware')
        : model.type === 'image' && model.kie
          ? 'kie'
          : 'runware'

    // Charge + row insert in ONE transaction (review finding): as two separate
    // transactions, a crash between them charged the user for a generation row
    // that never existed — nothing to poll, settle, or refund, credits gone.
    // Atomic, either both exist (every failure path from here on refunds) or
    // neither does. InsufficientCredits still throws 402 BEFORE any provider
    // call and rolls the whole unit back. The charge audit line is emitted
    // only after the commit (logCharge below) so a rolled-back submit never
    // fabricates a 'credits.charge' entry.
    // runwareTaskUuid is deliberately NOT set yet: the row must not be
    // pollable before Runware knows the task. A concurrent GET /:id during the
    // in-flight provider call would otherwise ask Runware about an unknown
    // task, get an error, mark the row failed AND refund — while the provider
    // call still succeeds (free-generation double-spend).
    db.transaction((tx) => {
      chargeCredits(db, userId, cost, id, undefined, tx)
      tx.insert(generation)
        .values({
          id,
          userId,
          type: model.type,
          mode,
          status: 'processing',
          // The COMPOSED prompt: what the model actually saw. Storing the raw
          // "[[e1]] у окна" would make every gallery card show a placeholder.
          // Provenance (which entity, which placeholder) lives in generation_entity.
          prompt: composedPrompt,
          // CinemaStudio (ADR §3): composed_prompt = the fully-composed model-
          // facing text (entity + preset), stored only when a preset was used;
          // prompt_preset_json echoes the structured preset for Regenerate.
          composedPrompt: composedPromptCol,
          promptPresetJson,
          modelId: model.id,
          provider: providerId,
          // `audio: true` is stamped for ANY clip that will carry a soundtrack
          // (asked-for on switchable models, unconditional on 'always' ones) —
          // the render maps the clip's audio stream into the export mix off this
          // flag, so it never probes files. JSON.stringify drops the undefined.
          paramsJson: JSON.stringify({
            aspectRatio: input.aspectRatio,
            duration: input.duration,
            audio: nativeAudio || undefined,
          }),
          costCredits: cost,
          createdAt: now,
        })
        .run()
      // Provenance in the SAME transaction as the row: a citation without its
      // generation (or the reverse) is a record that can never be reconciled.
      for (const ref of refs) {
        tx.insert(generationEntity)
          .values({ generationId: id, entityId: ref.entityId, placeholder: ref.placeholder })
          .run()
      }
    })
    logCharge(log, userId, id, cost)

    if (model.type === 'image') {
      // Images used to be Runware-only AND synchronous; only the second half is
      // still guaranteed. The ImageProvider seam answers "done" (Runware — one
      // call, settled inside this request, byte-for-byte the behaviour every
      // existing image test pins) or "pending" (Seedream on kie.ai — a task id,
      // parked as a processing row for the same poll path video/audio/3D use).
      //
      // Every money rule that lived here still lives here: the charge happened
      // above, the safety gate runs BEFORE the asset reaches storage, the settle
      // is status-guarded, and any failure refunds exactly once.
      try {
        const submitted = await images.submit({
          // The preset-composed prompt (== composedPrompt when no preset).
          prompt: modelPrompt,
          // Style/framing preset negative — omitted for a model with no negative
          // channel, because a provider does not IGNORE a parameter it cannot
          // take, it rejects the whole task, and the user paid for that task.
          ...(negativePrompt && model.supportsNegativePrompt !== false
            ? { negativePrompt }
            : {}),
          // One handle per backend. Which links can run this generation is read
          // off these keys, so a model with no Seedream equivalent costs no
          // failed kie call — it simply is not part of that chain.
          models: { runware: model.air, ...(model.kie ? { kie: model.kie.model } : {}) },
          ...(model.kie ? { quality: model.kie.quality } : {}),
          width,
          height,
          // Non-null for the same reason width/height above are: the guard at the
          // top of create() rejects an image request without a ratio before any
          // money moves, so by here it exists.
          aspectRatio: input.aspectRatio!,
          // BOTH forms of every reference: the bytes, for a backend that inlines
          // them, and a public URL for one that fetches them. Assembled here
          // because this is the last place that still knows which /media path
          // each reference came from (referencePaths, index-aligned above).
          ...(referenceImages
            ? {
                referenceImages: referenceImages.map(
                  (dataUri, i): ImageReference => ({
                    dataUri,
                    publicUrl: publicMediaUrl(mediaPublicBaseUrl, referencePaths[i] ?? null),
                  }),
                ),
              }
            : {}),
        })

        if (submitted.kind === 'pending') {
          // Asynchronous backend. Publish the job id ONLY now that the provider
          // has acknowledged the job: before this point get() refuses to poll (a
          // null id means no provider call), which is what closes the submit-
          // window race where a concurrent poll asks about a job the provider has
          // not registered yet, reads the error as a failure, and refunds a
          // generation we are already paying for. Status-guarded so a row settled
          // elsewhere is never resurrected.
          db.update(generation)
            .set({ runwareTaskUuid: submitted.providerJobId })
            .where(and(eq(generation.id, id), eq(generation.status, 'processing')))
            .run()
          const pending = db.select().from(generation).where(eq(generation.id, id)).get()
          return { dto: toDto(pending!), created: true }
        }

        // Synchronous backend: the picture already exists, so this request
        // settles it — the shape images have always had.
        //
        // Safety gate BEFORE the download (spec §2/§9.4): an NSFW-flagged asset
        // must never reach our storage or be served to the user. Throwing here
        // routes through the catch below → failed + refund + 422 envelope.
        if (submitted.nsfw) throw new ContentBlockedError()
        // The provider’s own format, not an assumption: a PNG written as .webp
        // is served with the wrong mime by @fastify/static.
        const ext = submitted.ext ?? assetExt('image')
        const mediaUrl = await storage.saveFromUrl(submitted.assetUrl, id, ext)
        // Status-guarded settle: ONLY a processing row may become succeeded.
        // Without the guard a row that some other path already failed+refunded
        // (e.g. the stale-generation reaper) would be flipped back to
        // succeeded and deliver the asset for free — the ledger would show
        // charge + refund = 0 while the user keeps the image.
        let settled = false
        db.transaction((tx) => {
          const fresh = tx.select().from(generation).where(eq(generation.id, id)).get()
          if (fresh?.status !== 'processing') return
          tx.update(generation)
            .set({
              status: 'succeeded',
              mediaJson: JSON.stringify([mediaUrl]),
              runwareCostUsd: submitted.costUsd?.toString(),
              completedAt: new Date(),
              paramsJson: JSON.stringify({ aspectRatio: input.aspectRatio, seed: submitted.seed }),
            })
            .where(eq(generation.id, id))
            .run()
          settled = true
        })
        // Money-path log: settle = the charge is final (no refund will come).
        if (settled)
          log?.info(
            {
              event: 'generation.settle',
              userId,
              generationId: id,
              costCredits: cost,
              runwareCostUsd: submitted.costUsd ?? null,
            },
            'generation settled',
          )
        // Row already settled elsewhere (failed + refunded) → the user was
        // made whole; discard the downloaded asset instead of delivering it.
        if (!settled) await storage.remove(id, ext)
      } catch (err) {
        // Provider, safety, or download failure → guarded fail + refund, then
        // rethrow so the route surfaces the matching error envelope
        // (provider_error / content_blocked). The errorCode is persisted so
        // the gallery card can localize the safety block later — the envelope
        // alone only reaches whoever made the POST.
        // Money-path log: the operator may still be paying the provider for this
        // call — provider failures need their own structured event, with the
        // REAL error detail (the client only ever sees the sanitized envelope).
        log?.error(
          { event: 'provider.error', userId, generationId: id, err },
          'provider call failed',
        )
        failGeneration(
          db,
          userId,
          id,
          err instanceof Error ? err.message : 'generation failed',
          err instanceof ContentBlockedError ? 'content_blocked' : null,
          log,
        )
        throw err
      }
      const row = db.select().from(generation).where(eq(generation.id, id)).get()
      return { dto: toDto(row!), created: true }
    }

    // Video, audio AND model3d are async: submit and return 202; progress arrives
    // via get() polls. Only the provider CALL differs by media type — audio submits
    // through the AudioProvider (audioInference), 3D through the Mesh3dProvider
    // (3dInference), video through the VideoProvider registry (Runware, wan-runpod
    // ComfyUI, or ByteDance). Everything after the submit — the submit-window race
    // guard, the status-guarded job-id publish, the shared poll path, and the
    // guarded failure settlement — is byte-for-byte the same for all three, which is
    // exactly why neither audio nor Studio3D is a new subsystem (ADR §1).
    try {
      let providerJobId: string
      if (model.type === 'audio') {
        // Audio has no width/height/duration; the composer's prompt is the music
        // positive prompt or the TTS spoken text (chosen by the model's audioKind).
        const r = await audio.submit({
          prompt: modelPrompt,
          model: model.air,
          audioKind: model.audioKind,
          ...(input.voice ? { voice: input.voice } : {}),
        })
        providerJobId = r.providerJobId
      } else if (model.type === 'model3d') {
        // 3D is async exactly like video — and it must NEVER fall through to the
        // video arm below: a videoInference task cannot produce a mesh, so the
        // user would be charged for a job that can only fail. No width/height/
        // duration (a mesh has none); the photo and the quality knobs are the whole
        // input. Runware requires the CALLER to mint the task id, so we hand it the
        // taskUUID create() already generated — which is also the idempotency key
        // for the client's single bounded retry.
        const r = await mesh.submit({
          taskUUID,
          model: model.air,
          // Non-null: the pre-charge guard above rejected any photo-less 3D request.
          inputImage: input.inputImage!,
          ...(model.pbr !== undefined ? { pbr: model.pbr } : {}),
        })
        providerJobId = r.providerJobId
      } else {
        const videoProvider = resolveProvider(providerId)
        const r = await videoProvider.submit({
          // The preset-composed prompt (== input.prompt when no preset/entities).
          prompt: modelPrompt,
          // Style preset negative (empty → omitted) — GATED on the model's
          // capability exactly like the image path above: Runware rejects the
          // WHOLE task on an unrecognized parameter, and Seedance 1.5 Pro
          // started refusing `negativePrompt` outright ("Unsupported use of
          // 'negativePrompt' parameter", verified live 2026-07-30). Before
          // this gate every styled video on such a model failed and refunded.
          ...(negativePrompt && model.supportsNegativePrompt !== false
            ? { negativePrompt }
            : {}),
          model: model.air,
          width,
          height,
          durationSeconds: input.duration!,
          // The seed frame: the explicit data URI, or the canvas chain's
          // resolved citation. Exclusive by contract, so at most one is set.
          ...(input.inputImage
            ? { inputImage: input.inputImage }
            : chainImage
              ? { inputImage: chainImage }
              : {}),
          // ...and the same frame as a URL, for a backend whose schema takes one.
          // Only the CHAINED frame can have it: an explicit inputImage is raw
          // bytes from the client that were never stored, so there is no address
          // to give. Absent → a URL-only backend refuses at submit and the chain
          // routes the job to one that inlines bytes.
          ...(!input.inputImage && chainImagePath
            ? (() => {
                const url = publicMediaUrl(mediaPublicBaseUrl, chainImagePath)
                return url ? { inputImageUrl: url } : {}
              })()
            : {}),
          // Reference photos as URLs — ALL OR NOTHING. A partial list would let a
          // URL-only backend condition on fewer subjects than the user tagged and
          // charge full price for the wrong cast; the chain failing over to a
          // bytes-taking backend is the honest outcome instead.
          ...(() => {
            if (!referenceImages?.length) return {}
            const urls = referenceImages.map((_, i) =>
              publicMediaUrl(mediaPublicBaseUrl, referencePaths[i] ?? null),
            )
            return urls.every((u): u is string => u !== null)
              ? { referenceImageUrls: urls }
              : {}
          })(),
          // ByteDance models 400 on Runware's `safety` param — the catalog flag
          // routes around it (Runware adapter omits it; other providers ignore it).
          ...(model.type === 'video' && model.supportsSafetyParam === false
            ? { omitSafety: true }
            : {}),
          // The style id (NOT the composed fragment): an adapter whose backend has
          // a native style mode uses it, everyone else ignores it. The prompt still
          // carries the fragment, so this is purely additive.
          ...(preset?.styleId ? { styleId: preset.styleId } : {}),
          // Native audio, already capability-checked and PRICED above — the
          // adapter only translates the flag into its backend's spelling.
          ...(input.audio === true ? { audio: true } : {}),
          // Tagged-character photos, already authorized and turned into data URIs
          // above (and refused, before the charge, if the model cannot use them).
          // This is what makes shot 2 show the SAME character as shot 1.
          ...(referenceImages ? { referenceImages } : {}),
        })
        providerJobId = r.providerJobId
      }
      // Publish the provider job id ONLY now that the provider has acknowledged
      // the job. Before this point get() refuses to poll (null id → no provider
      // call), which closes the submit-window race: a concurrent poll can no
      // longer ask the provider about a not-yet-registered job, read the
      // resulting error as a failure, and refund a job still being paid for.
      // Reuses the runwareTaskUuid column (neutral job-handle store). Status-
      // guarded so a row settled elsewhere is never resurrected.
      db.update(generation)
        .set({ runwareTaskUuid: providerJobId })
        .where(and(eq(generation.id, id), eq(generation.status, 'processing')))
        .run()
    } catch (err) {
      // Money-path log mirrors the image path: provider detail to logs only.
      log?.error(
        { event: 'provider.error', userId, generationId: id, err },
        'video submit failed',
      )
      // Settlement reuses the guarded atomic failGeneration (review finding):
      // this block used to run refundCredits and the failed-status flip as TWO
      // separate transactions in refund-then-flip order — a crash between them
      // committed a refund while the row stayed 'processing' (a later sweep
      // would re-run the settlement and only the ledger's idempotence guard
      // stood between that and a double credit), and the flip itself carried
      // no status check. One transaction now: flip + refund commit or roll
      // back together, and a row that somehow already settled is untouched.
      // A provider can refuse the CONTENT at submit rather than at poll —
      // ByteDance moderates the input image up-front and 400s a real human face
      // before any render starts. Persist that as 'content_blocked' so the failed
      // row explains itself in the gallery, exactly like a poll-time block; every
      // other failure keeps the neutral null code. (The refund is unchanged and
      // unconditional either way — this only decides which message the SPA shows.)
      const apiCode = (err as { apiCode?: unknown } | null)?.apiCode
      failGeneration(
        db,
        userId,
        id,
        err instanceof Error ? err.message : 'submit failed',
        apiCode === 'content_blocked' ? 'content_blocked' : null,
        log,
      )
      throw err
    }
    const row = db.select().from(generation).where(eq(generation.id, id)).get()
    return { dto: toDto(row!), created: false }
  }

  // get() doubles as the poll: while a row is processing, each read asks
  // Runware getResponse and applies the transition — no background workers in
  // the MVP, the SPA's 4s polling drives progress.
  async function get(userId: string, id: string, reqLog?: MoneyLog): Promise<Generation> {
    const log = reqLog ?? baseLog
    const row = db
      .select()
      .from(generation)
      .where(and(eq(generation.id, id), eq(generation.userId, userId)))
      .get()
    if (!row) throw new NotFoundError('generation not found')
    if (row.status !== 'processing') return toDto(row)
    // Reaper: an hour-old processing row is abandoned (see STALE_PROCESSING_MS)
    // — settle it as failed + refund instead of holding the charge forever.
    if (Date.now() - row.createdAt.getTime() > STALE_PROCESSING_MS) {
      failGeneration(db, userId, id, 'generation timed out', null, log)
      lastPolledAt.delete(id)
      const settled = db.select().from(generation).where(eq(generation.id, id)).get()
      return toDto(settled!)
    }
    // A null runwareTaskUuid on a processing row means create() has not yet
    // finished the provider submit — the job does not exist on the provider's
    // side yet, so polling it would misread "unknown job" as a terminal failure
    // (and refund a job that is about to succeed). Return the row as-is; the
    // SPA's next poll will find the id once the submit completes. (The column
    // now holds a neutral provider job id — Runware taskUUID or ComfyUI prompt_id.)
    if (!row.runwareTaskUuid) return toDto(row)

    // Poll throttle: a getResponse call for this generation happened inside
    // the min interval → answer from the DB state (at most one interval
    // stale) without touching Runware. The timestamp is written BEFORE the
    // await, so concurrent handlers racing on the same generation observe it
    // synchronously — N simultaneous GETs still cost exactly one provider
    // call. (If the poll itself then fails, the row simply stays processing
    // and becomes pollable again after the window — no state is lost.)
    const lastPoll = lastPolledAt.get(id)
    const nowMs = Date.now()
    if (lastPoll !== undefined && nowMs - lastPoll < pollMinIntervalMs) return toDto(row)
    lastPolledAt.set(id, nowMs)

    // Poll the SAME backend the job was submitted to. Which REGISTRY to ask is a
    // function of the ROW's media type (durable state, never the live catalog — a
    // catalog edit must never redirect an in-flight job's poll): a 3D job polls the
    // mesh provider, everything else polls the video registry (audio rides it too,
    // as an always-'runware' row). MeshPollResult is a type ALIAS of the neutral
    // VideoPollResult, so every settlement branch below — the NSFW gate, the
    // no-asset guard, the download-before-flip, the guarded refund — is byte-for-
    // byte the pre-Studio3D logic.
    const poll =
      row.type === 'model3d'
        ? await mesh.poll(row.runwareTaskUuid)
        : row.type === 'image'
          ? await images.poll(row.runwareTaskUuid)
          : await resolveProvider(row.provider).poll(row.runwareTaskUuid)
    if (poll.status === 'processing') {
      // Images report no progress percentage — there is no frame count to be a
      // fraction of, and Seedream's task states are queued/generating, not a
      // number. Read defensively rather than defaulted at the seam, so the column
      // keeps meaning "the provider said N%" instead of "some provider said 0".
      const progress =
        'progress' in poll && typeof poll.progress === 'number' ? poll.progress : null
      db.update(generation).set({ progress }).where(eq(generation.id, id)).run()
      return toDto({ ...row, progress })
    }
    if (poll.status === 'success') {
      // Safety gate BEFORE the download (spec §2/§9.4): NSFW-flagged output
      // is never stored or served — settle as failed with the machine-readable
      // 'content_blocked' code (the SPA shows a localized safety message) and
      // give the credits back. Self-hosted wan-runpod has no provider-side
      // moderation and always reports nsfw:false (documented ADR gap) — the
      // gate simply never fires for it until a worker classifier is added.
      if (poll.nsfw) {
        failGeneration(
          db,
          userId,
          id,
          'Blocked by the content safety filter',
          'content_blocked',
          log,
        )
        lastPolledAt.delete(id)
        const settled = db.select().from(generation).where(eq(generation.id, id)).get()
        return toDto(settled!)
      }
      const src = poll.assetUrl
      if (!src) {
        // 'success' with no asset URL is unrecoverable: every future poll of
        // this job would return the same payload, so "leave it processing
        // and retry" loops forever while the user's credits stay held. Treat
        // it as a provider failure and give the money back.
        log?.error(
          { event: 'provider.error', userId, generationId: id, detail: 'no asset url' },
          'provider returned no asset',
        )
        failGeneration(db, userId, id, 'provider returned no asset', null, log)
        lastPolledAt.delete(id)
        const settled = db.select().from(generation).where(eq(generation.id, id)).get()
        return toDto(settled!)
      }
      // Download BEFORE the status flip: if the download throws, the row stays
      // processing and the next poll retries — never a succeeded row without media.
      // The provider's own format when it stated one (Seedream returns png),
      // the media-type default otherwise. Storing a png as .webp would have
      // @fastify/static serve it under the wrong mime.
      const pollExt = 'ext' in poll && poll.ext ? poll.ext : assetExt(row.type)
      const mediaUrl = await storage.saveFromUrl(src, id, pollExt)
      // Guard: only transition if still processing (two browser tabs can poll
      // the same generation concurrently).
      let settled = false
      db.transaction((tx) => {
        const fresh = tx.select().from(generation).where(eq(generation.id, id)).get()
        if (fresh?.status !== 'processing') return
        tx.update(generation)
          .set({
            status: 'succeeded',
            mediaJson: JSON.stringify([mediaUrl]),
            // Neutral cost store (reused column): Runware's invoice figure, or
            // the wan-runpod operator estimate — margin dashboards only.
            runwareCostUsd: poll.costUsd?.toString(),
            progress: 100,
            completedAt: new Date(),
          })
          .where(eq(generation.id, id))
          .run()
        settled = true
      })
      // Money-path log gated on the guard: only the poll that actually flipped
      // the row reports the settle (racing tabs stay silent).
      if (settled)
        log?.info(
          {
            event: 'generation.settle',
            userId,
            generationId: id,
            costCredits: row.costCredits,
            runwareCostUsd: poll.costUsd ?? null,
          },
          'generation settled',
        )
    } else {
      // Guarded fail + idempotent refund — concurrent polls cannot double-settle.
      // The terminal provider error is money-path telemetry too.
      log?.error(
        { event: 'provider.error', userId, generationId: id, detail: poll.message },
        'provider reported failure',
      )
      // `blocked` = the provider refused the CONTENT, not the infrastructure
      // (ByteDance declines any input image carrying a real human face, and kills
      // its own output on a moderation hit). The refund is identical either way —
      // what changes is the code the SPA localizes off, and "your image was
      // refused, here is why" is the difference between a user fixing their input
      // and a user filing a bug against us.
      failGeneration(db, userId, id, poll.message, poll.blocked ? 'content_blocked' : null, log)
    }
    const updated = db.select().from(generation).where(eq(generation.id, id)).get()
    // Terminal transition observed (settle above or failGeneration) → drop the
    // throttle entry; only currently-processing rows may occupy the map.
    if (updated!.status !== 'processing') lastPolledAt.delete(id)
    return toDto(updated!)
  }

  // Compound cursor `<createdAtMs>_<id>` of the last returned row (review
  // finding): a createdAt-only cursor with strict `<` SKIPPED rows sharing
  // the boundary millisecond — sqlite timestamps are ms-resolution, so a
  // burst of generations (or a batch import) lands several rows on the same
  // tick, and whichever ones fell after the page boundary vanished from the
  // library forever. The order and the WHERE now use (createdAt, id) with id
  // as the total-order tiebreaker: same-ms rows resume exactly where the
  // previous page stopped. A bare `<createdAtMs>` cursor (pre-tiebreaker
  // format, possibly still held by an open SPA session) keeps working with
  // the old timestamp-only semantics. Fetch limit+1 to learn whether another
  // page exists without a COUNT query.
  function list(userId: string, limit: number, cursor?: string) {
    let cursorFilter
    if (cursor) {
      const [tsRaw, cursorId] = cursor.split('_')
      const ts = new Date(Number(tsRaw))
      cursorFilter = cursorId
        ? or(
            lt(generation.createdAt, ts),
            and(eq(generation.createdAt, ts), lt(generation.id, cursorId)),
          )
        : lt(generation.createdAt, ts)
    }
    const rows = db
      .select()
      .from(generation)
      .where(
        cursorFilter
          ? and(eq(generation.userId, userId), cursorFilter)
          : eq(generation.userId, userId),
      )
      .orderBy(desc(generation.createdAt), desc(generation.id))
      .limit(limit + 1)
      .all()
    const items = rows.slice(0, limit).map(toDto)
    const last = rows.length > limit ? rows[limit - 1]! : null
    const nextCursor = last ? `${last.createdAt.getTime()}_${last.id}` : null
    return { items, nextCursor }
  }

  async function remove(userId: string, id: string) {
    const row = db
      .select()
      .from(generation)
      .where(and(eq(generation.id, id), eq(generation.userId, userId)))
      .get()
    if (!row) throw new NotFoundError('generation not found')
    // A processing row must NOT be deletable (review finding): deleting it
    // mid-flight would (a) forfeit the user's refund — every failure
    // settlement path (poll error, NSFW, stale sweep) needs the row to flip
    // and refund against, and refundCredits keyed on a vanished generation
    // would still work but nothing would ever trigger it — and (b) orphan the
    // Runware task the operator keeps paying for with no record of it.
    // 409 'conflict': the request is fine, the state isn't; the SPA tells the
    // user to wait for the generation to finish (or fail) first.
    if (row.status === 'processing')
      throw new ConflictError('generation is still processing — wait for it to finish')
    // Remove the media file first (idempotent), then the row — a re-run after
    // a crash between the two steps is harmless.
    await storage.remove(id, assetExt(row.type))
    db.delete(generation).where(eq(generation.id, id)).run()
  }

  return { create, get, list, remove }
}
