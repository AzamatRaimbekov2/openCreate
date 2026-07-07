// Generation lifecycle service (plan Task 10) — the core of the product.
// One place owns the whole money-touching sequence: charge credits at submit
// (the ADR's hold→settle collapsed), call Runware, persist state transitions,
// download finished assets into our storage (Runware URLs expire in 7 days),
// and refund exactly once on failure. Injected deps (db/runware/storage) keep
// it fully testable with the scripted fake in test/helpers/build-test-app.ts.
import { randomUUID } from 'node:crypto'
import { and, desc, eq, lt, or } from 'drizzle-orm'
import type { CreateGenerationInput, Generation } from '@opencreate/contracts'
import type { Db } from '../../db/client'
import type { RunwareClient } from '../../integrations/runware/client'
import type { StorageProvider } from '../../storage/local'
import { generation } from '../../db/schema'
import { chargeCredits, logCharge, logRefund, refundCredits, type MoneyLog } from '../credits/ledger'
import { creditsFor, getModel, resolutionFor } from '../catalog/catalog'

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
  runware: RunwareClient
  storage: StorageProvider
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

// DB row → wire DTO (contracts generationSchema). JSON columns are parsed here
// and dates leave as ISO strings — the wire contract is JSON, not Date objects.
function toDto(row: typeof generation.$inferSelect): Generation {
  return {
    id: row.id,
    type: row.type,
    mode: row.mode,
    status: row.status,
    prompt: row.prompt,
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
  storage,
  log: baseLog,
  pollMinIntervalMs = DEFAULT_POLL_MIN_INTERVAL_MS,
}: Deps) {
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
    input: CreateGenerationInput,
    reqLog?: MoneyLog,
  ): Promise<{ dto: Generation; created: boolean }> {
    const log = reqLog ?? baseLog
    // Catalog-level validation BEFORE charging: zod already validated the
    // shape, but only the catalog knows which combinations are real.
    const model = getModel(input.modelId)
    if (!model) throw new ValidationError(`unknown model ${input.modelId}`)
    if (!model.aspectRatios.includes(input.aspectRatio))
      throw new ValidationError(`aspect ${input.aspectRatio} unsupported for ${model.id}`)
    if (input.inputImage && !model.supportsImageInput)
      throw new ValidationError(`${model.id} does not support image input`)
    let cost: number
    try {
      cost = creditsFor(model, input.duration)
    } catch (err) {
      // creditsFor throws plain Errors (missing/unsupported duration) — those
      // are caller mistakes, so surface as 400, not 500.
      throw new ValidationError(err instanceof Error ? err.message : 'invalid duration')
    }
    const { width, height } = resolutionFor(model, input.aspectRatio)
    const id = randomUUID()
    const taskUUID = randomUUID()
    const now = new Date()
    const mode = input.inputImage ? 'image' : 'text'

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
          prompt: input.prompt,
          modelId: model.id,
          paramsJson: JSON.stringify({ aspectRatio: input.aspectRatio, duration: input.duration }),
          costCredits: cost,
          createdAt: now,
        })
        .run()
    })
    logCharge(log, userId, id, cost)

    if (model.type === 'image') {
      // Images are synchronous: one provider call resolves to a URL we
      // immediately copy into our own storage.
      try {
        const res = await runware.imageInference({
          taskUUID,
          positivePrompt: input.prompt,
          model: model.air,
          width,
          height,
        })
        // Safety gate BEFORE the download: an NSFW-flagged asset must never
        // reach our storage or be served to the user (spec §2/§9.4). Throwing
        // here routes through the catch below → failed + refund + 422 envelope.
        if (res.NSFWContent) throw new ContentBlockedError()
        const mediaUrl = await storage.saveFromUrl(res.imageURL, id, 'webp')
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
              runwareCostUsd: res.cost?.toString(),
              completedAt: new Date(),
              paramsJson: JSON.stringify({ aspectRatio: input.aspectRatio, seed: res.seed }),
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
              runwareCostUsd: res.cost ?? null,
            },
            'generation settled',
          )
        // Row already settled elsewhere (failed + refunded) → the user was
        // made whole; discard the downloaded asset instead of delivering it.
        if (!settled) await storage.remove(id, 'webp')
      } catch (err) {
        // Provider, safety, or download failure → guarded fail + refund, then
        // rethrow so the route surfaces the matching error envelope
        // (provider_error / content_blocked). The errorCode is persisted so
        // the gallery card can localize the safety block later — the envelope
        // alone only reaches whoever made the POST.
        // Money-path log: the operator may still be paying Runware for this
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

    // Video is async: submit and return 202; progress arrives via get() polls.
    try {
      await runware.submitVideo({
        taskUUID,
        positivePrompt: input.prompt,
        model: model.air,
        width,
        height,
        duration: input.duration!,
        ...(input.inputImage
          ? { frameImages: [{ image: input.inputImage, frame: 'first' as const }] }
          : {}),
      })
      // Publish the task uuid ONLY now that Runware has acknowledged the task.
      // Before this point get() refuses to poll (null uuid → no provider call),
      // which closes the submit-window race: a concurrent poll can no longer
      // ask Runware about a not-yet-registered task, read the resulting error
      // as a failure, and refund a job the operator still pays Runware for.
      // Status-guarded so a row settled elsewhere is never resurrected.
      db.update(generation)
        .set({ runwareTaskUuid: taskUUID })
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
      failGeneration(
        db,
        userId,
        id,
        err instanceof Error ? err.message : 'submit failed',
        null,
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
    // finished the provider submit — the task does not exist on Runware's side
    // yet, so polling it would misread "unknown task" as a terminal failure
    // (and refund a job that is about to succeed). Return the row as-is; the
    // SPA's next poll will find the uuid once the submit completes.
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

    const poll = await runware.getResponse(row.runwareTaskUuid)
    if (poll.status === 'processing') {
      db.update(generation).set({ progress: poll.progress }).where(eq(generation.id, id)).run()
      return toDto({ ...row, progress: poll.progress })
    }
    if (poll.status === 'success') {
      // Safety gate BEFORE the download (spec §2/§9.4): NSFW-flagged output
      // is never stored or served — settle as failed with the machine-readable
      // 'content_blocked' code (the SPA shows a localized safety message) and
      // give the credits back.
      if (poll.NSFWContent) {
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
      const src = poll.videoURL ?? poll.imageURL
      if (!src) {
        // 'success' with no asset URL is unrecoverable: every future poll of
        // this task would return the same payload, so "leave it processing
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
      const mediaUrl = await storage.saveFromUrl(src, id, row.type === 'video' ? 'mp4' : 'webp')
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
            runwareCostUsd: poll.cost?.toString(),
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
            runwareCostUsd: poll.cost ?? null,
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
      failGeneration(db, userId, id, poll.message, null, log)
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
    await storage.remove(id, row.type === 'video' ? 'mp4' : 'webp')
    db.delete(generation).where(eq(generation.id, id)).run()
  }

  return { create, get, list, remove }
}
