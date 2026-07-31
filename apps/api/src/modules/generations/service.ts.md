# service.ts — AI component doc

> AI-facing sidecar for `modules/generations/service.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
The generation lifecycle service (plan Task 10) — the core money-touching sequence of the product: charge credits at submit, call Runware, persist state transitions, download finished assets into our own storage, refund exactly once on failure. Everything else (routes, SPA) is a thin shell around this file.

## What it does (for an AI reader)
- Responsibilities: catalog-level validation (model/aspect/duration/i2v support), credit charge before any provider call, generation row persistence, sync image flow (inference → asset download → succeeded), async video flow (submit → 202; `get()` doubles as the Runware poll applying processing/succeeded/failed transitions), refund on every failure path, cursor pagination, owner-scoped reads/deletes, structured money-path logging (`generation.settle` / `generation.fail` / `provider.error` + ledger events via the passed logger).
- Public API / exports / props / endpoints:
  - `createGenerationService({ db, runware, storage, log?, pollMinIntervalMs? })` → `{ create, get, list, remove }` (`GenerationService` type). `log` is the base app logger — fallback for money events when no request logger is passed. `pollMinIntervalMs` (default `DEFAULT_POLL_MIN_INTERVAL_MS` = 3000) throttles per-generation Runware polling; tests inject 0 to disable.
  - `create(userId, input, reqLog?)` → `{ dto: Generation, created: boolean }` — `created: true` = image finished synchronously (route → 201); `false` = video accepted (route → 202). Throws `ValidationError` (400), `InsufficientCreditsError` (402, from ledger), `RunwareError` (502). `reqLog` (routes pass `req.log`) stamps every money-path line of this call with the reqId.
  - `get(userId, id, reqLog?)` → `Generation`; while the row is processing it polls `runware.getResponse` and applies the transition (no background workers in MVP — the SPA's 4s polling drives progress). Rows without a `runwareTaskUuid` are never polled (submit still in flight); rows older than `STALE_PROCESSING_MS` (1h) are settled as failed + refunded instead of polling; polls inside `pollMinIntervalMs` of the last real poll are answered from the DB state without a provider call (throttle).
  - `settleStaleGenerations(db, now?, log?)` → number of settled rows — boot-time sweep called by `app.ts`; fails + refunds processing rows older than `STALE_PROCESSING_MS` so poll-abandoned generations (expired 7-day asset URLs, crashes mid-create) never hold credits forever.
  - `STALE_PROCESSING_MS` — exported staleness threshold (1 hour); `DEFAULT_POLL_MIN_INTERVAL_MS` — exported poll-throttle default (3s).
  - `list(userId, limit, cursor?)` → `{ items, nextCursor }` — newest-first by `(createdAt, id)` DESC; cursor is the compound `<createdAtMs>_<id>` of the last returned row (bare `<createdAtMs>` legacy cursors still accepted with old timestamp-only semantics); fetches `limit + 1` to detect the next page without COUNT.
  - `remove(userId, id)` — refuses processing rows with `ConflictError` (409/conflict — deleting mid-flight would forfeit the refund and orphan the Runware task), otherwise deletes the media file (idempotent) then the row; 404 if not owned.
  - Errors: `NotFoundError` (404/not_found), `ValidationError` (400/validation_failed), `ConflictError` (409/conflict — delete of a processing generation), `ContentBlockedError` (422/content_blocked — NSFW safety filter) — statusCode+apiCode consumed by the app.ts central error handler.
- Inputs → Outputs: `CreateGenerationInput` (contracts) → `Generation` DTO (contracts). DB rows mapped by `toDto` (JSON columns parsed, dates → ISO strings).
- Side effects (I/O, network, state): DB writes (generation rows + ledger rows inside ledger transactions), outbound Runware calls, asset downloads into `StorageProvider`, media file deletions, structured log lines on money-path transitions (settle/fail/provider error — success-guarded so racing pollers never emit duplicates; provider detail goes to logs ONLY, clients get the sanitized envelope).

## Dependencies
- Imports / depends on: `@opencreate/contracts` (input/DTO types), `db/schema` (`generation`), `credits/ledger` (`chargeCredits`/`refundCredits`/`logCharge`/`logRefund`/`MoneyLog`), `catalog/catalog` (`getModel`/`creditsFor`/`resolutionFor`), `integrations/runware/client` (type), `storage/local` (type), drizzle operators, `node:crypto`.
- Used by: `modules/generations/routes.ts` (wired in `app.ts`, Task 11); tested by `test/generations.test.ts`, `test/generations-races.test.ts` (scripted `fakeRunware`), `test/generations-money-atomicity.test.ts` (charge+insert / fail+refund atomicity), `test/generations-delete.test.ts` (409 on processing), `test/generations-pagination.test.ts` (same-ms tiebreaker), `test/generations-poll-throttle.test.ts` (throttle + 3s default) and `test/logging.test.ts` (money-path log lines).

## Diagram
```mermaid
flowchart TD
  P[POST /api/generations] --> V{catalog valid?}
  V -- no --> E400[400 validation_failed]
  V -- yes --> C[ONE tx: chargeCredits 402-guarded]
  C --> R[+ insert processing row, NO task uuid yet]
  R -- image --> I[runware.imageInference] --> S[storage.saveFromUrl] --> GTX[guarded flip → succeeded → 201]
  R -- video --> SV[runware.submitVideo] --> PU[publish runwareTaskUuid, guarded] --> A[202 processing]
  I -- throw --> TF
  SV -- throw --> TF
  G[GET /api/generations/:id] --> Q{processing?}
  Q -- no --> DTO[return row as-is]
  Q -- yes --> ST{older than 1h?}
  ST -- yes --> TF
  ST -- no --> HU{has task uuid?}
  HU -- no --> DTO
  HU -- yes --> PL[runware.getResponse]
  PL -- processing --> UP[update progress]
  PL -- success w/o URL --> TF
  PL -- success --> DL[download asset] --> TX[guarded flip → succeeded]
  PL -- error --> TF[failGeneration: ONE tx check-and-set — only processing → failed, ONLY the flip triggers the refund]
  B[app.ts boot] --> SW[settleStaleGenerations sweep] --> TF
```

## Key decisions / gotchas
- **The style is resolved HERE, with the pre-charge guards, and passed into `applyPromptPreset`**
  (ADR style-studio D1/D3, 2026-07-31). The composer no longer owns a style table. Resolution sits up
  with the model/aspect/capability checks rather than down at composition time, for the reason those
  guards give: it runs before the charge, before any provider call, and before the reference-image
  reads — a request we already know cannot compose correctly must cost the user nothing and must not
  do work on their behalf. Byte-identical builtin output is pinned end-to-end by
  `test/generations-styles.test.ts`, whose expectations are literal strings captured before the
  refactor.
- **`resolveStyle` is injected as a FUNCTION, not as the style service.** This path asks exactly one
  question — "what fragments does this styleId mean for this user, if any?" — and taking the whole
  service would hand the money path a create/update/delete surface it has no business holding.
- **Its absence is a real mode, not an oversight.** Without it the service resolves BUILTIN-ONLY,
  which is what the many direct-service unit tests constructing `{ db, runware, storage }` need
  (they predate user styles and must keep composing builtins). `buildApp` always injects the
  registry, so the product path is never builtin-only.
- **`null` → `400 unknown style <the id the caller sent>`, before the charge.** Unknown, foreign and
  deleted are deliberately indistinguishable: the message echoes back only the caller's own input, so
  the endpoint cannot be used to discover which style ids exist and a foreign style's fragments can
  never leak into an error. "Deleted" is the interesting one — deleting a style does not rewrite the
  films and shots that cited it (ADR D4), so this 400 is exactly how an old shot reports "the style
  you used is gone": honestly, and for free.
- Charge happens BEFORE any provider call: a 402 means Runware was never contacted (asserted in tests).
- **Atomic charge+insert (review finding)**: the credit charge and the processing-row insert run in ONE `db.transaction` (`chargeCredits` in tx mode) — as two transactions, a crash between them charged the user for a row that never existed (nothing to settle or refund). The `credits.charge` audit line is emitted only after the combined commit (`logCharge`). Pinned by `test/generations-money-atomicity.test.ts`.
- **Atomic failure settlement (review finding)**: `failGeneration` runs the processing→failed flip AND the idempotent refund in ONE transaction (`refundCredits` in tx mode). The old flip-then-refund pair could crash in between, leaving a failed row whose charge was kept forever (the stale sweep only rescues 'processing' rows). Now a refund failure aborts the flip too — the row stays processing and the next poll/sweep re-runs the settlement. Fail/refund logs are emitted after the commit, gated on the flip/mutation actually applying.
- **Refund-after-success race (review finding)**: the check-and-set inside `failGeneration`'s transaction guards the WHOLE settlement, refund included — only the processing → failed flip triggers `refundCredits`. Previously the refund ran unconditionally while only the flip was guarded, so a row a concurrent settler had already flipped to 'succeeded' stayed succeeded but was refunded anyway (user keeps asset + money). A non-processing row is now left completely untouched. Pinned by `test/generations-money-atomicity.test.ts` ("raced to succeeded").
- **Atomic video submit settlement (review finding)**: `create()`'s video catch block reuses `failGeneration` instead of running `refundCredits` and an unguarded failed-flip as two separate transactions (refund-then-flip order could commit the refund while the row stayed processing). Pinned by `test/generations-money-atomicity.test.ts` (sabotaged-flip + happy-failure cases).
- **Anti-double-spend (create/poll race)**: the processing row is inserted WITHOUT `runwareTaskUuid`; the uuid is published only after the provider call is acknowledged (video) — and images never need it. `get()` refuses to poll a row with a null uuid. This closes the window where a concurrent GET /:id polled Runware for a task it didn't know yet, misread the error as terminal, refunded, and create() then flipped the row to succeeded anyway (charge + refund = 0, asset delivered). Pinned by `test/generations-races.test.ts`.
- The image success transition is a status-guarded transaction (only processing → succeeded); if the row was settled elsewhere, the downloaded asset is discarded instead of delivered.
- Every failure path after the charge refunds; `refundCredits` is idempotent (once-per-generation guard lives in the ledger), so concurrent polls cannot double-refund.
- Poll success downloads the asset BEFORE flipping status: a failed download leaves the row processing so the next poll retries — a succeeded row always has media. Poll success WITHOUT a URL is unrecoverable (same payload forever) → `failGeneration` + refund.
- **Stuck-processing settlement**: `failGeneration` centralizes the guarded fail + idempotent refund; the get()-level reaper and the `settleStaleGenerations` boot sweep guarantee hold→settle/refund even when downloads fail permanently or the owner never polls again. Pinned by `test/generations-stale.test.ts`.
- **NSFW safety gate (spec §2/§9.4)**: `NSFWContent === true` on the image result or the video poll is checked BEFORE any storage download — flagged assets are never stored or served. Both paths settle failed + refund with `errorCode: 'content_blocked'` (persisted in the `error_code` column, surfaced in the DTO) so the SPA renders localized safety copy; the image path additionally returns the 422 `content_blocked` envelope via `ContentBlockedError`.
- Transitions out of `processing` re-read the fresh status inside a transaction because two tabs can poll the same generation concurrently.
- All reads/deletes are `(id, userId)`-scoped: another account gets 404, never data.
- **No delete while processing (review finding)**: `remove()` throws `ConflictError` (409) for processing rows. Deleting mid-flight would erase the row every failure-settlement path needs to flip+refund against (the user would silently forfeit the refund) and orphan the in-flight Runware task. Terminal rows delete normally. Pinned by `test/generations-delete.test.ts`.
- **Poll throttle (review finding)**: per-generation in-memory `lastPolledAt` Map — a real `getResponse` call stamps the id BEFORE the await (so N concurrent GETs cost exactly one provider call), and polls inside `pollMinIntervalMs` (default 3s < the SPA's 4s cadence, so a single well-behaved client never notices) return the DB state untouched. Entries are dropped at every terminal transition get() observes; single-process MVP, so restart loss only costs one extra poll. Pinned by `test/generations-poll-throttle.test.ts`.
- **Same-ms pagination (review finding)**: the old createdAt-only cursor with strict `<` skipped rows sharing the boundary millisecond. `list()` now orders by `(createdAt, id)` DESC and the compound cursor resumes with `createdAt < ts OR (createdAt = ts AND id < cursorId)`. Pinned by `test/generations-pagination.test.ts`.
- `creditsFor`'s plain Errors (missing/unsupported duration) are re-thrown as `ValidationError` — caller mistakes must be 400, not 500.
- `duration!` non-null assertion in the video branch is safe: `creditsFor` already threw if duration was undefined for a video model.
- **Money-path logging contract**: `credits.charge`/`credits.refund` are logged by the ledger (after commit), `generation.settle`/`generation.fail` here, gated on the guarded transition actually applying — log line exists ⇔ the state moved. `provider.error` carries the raw provider error (`err`/`detail`) because the HTTP envelope for unexpected failures is sanitized; logs are the only place with the real cause.

## Key decisions (2026-07-08)
- Video submit forwards `omitSafety: true` when the catalog model has `supportsSafetyParam === false` (ByteDance/Seedance reject Runware's `safety` param with 400 unsupportedParameter). Moderation for these models still applies via the NSFWContent flag on poll results, which this service already enforces (content_blocked + refund).

## Key decisions (2026-07-09) — VideoProvider seam / wan-runpod routing
- The VIDEO path now calls a `VideoProvider` from a `videoProviders` registry instead of `runware.*` directly. Provider is resolved from the catalog model's `provider` at submit (`providerId`, default `runware`) and from the row's persisted `provider` at poll (durable — a job always polls the backend it submitted to). The IMAGE path still calls `runware.imageInference` directly and is UNCHANGED.
- `videoProviders` is optional: when absent the service derives `{ runware: createRunwareVideoAdapter(runware) }`, so the existing direct-service unit tests (`{ db, runware, storage }`) keep exercising `submitVideo`/`getResponse` through the adapter unchanged. `buildApp` injects the full registry (runware + wan-runpod).
- Neutral field rename only — `poll.assetUrl` / `poll.costUsd` / `poll.nsfw` replace `videoURL/imageURL` / `cost` / `NSFWContent`. Provider job id + cost REUSE the `runwareTaskUuid` / `runwareCostUsd` columns. Every money-path guard (charge+insert atomic, submit-window null-id guard, guarded fail+refund, stale reaper, poll throttle) is byte-for-byte unchanged.
- wan-runpod reports `nsfw:false` (no self-host moderation) → the §9.4 gate never fires for it; documented gap.

## Update 2026-07-15 — native generation audio
- New guard BEFORE the charge: `input.audio === true` on a non-video model or a
  model without catalog `nativeAudio` → 400 (capability law, as referenceMode).
- Pricing: `creditsFor(model, duration, input.audio === true)` — audio-on reads
  the with-audio table on 'switchable' models (2×, owner decision 2026-07-15).
- Provenance: `paramsJson.audio = true` stamped for any clip that will carry a
  soundtrack (asked-for on switchable, unconditional on 'always' models like
  Wan 2.7 direct) — the film render maps clip audio off this flag, never probes.
- Submit: `audio: true` forwarded to the VideoProvider seam.

## Update 2026-07-18 — server-only direct reference channel (ADR modular-3d-assets, Task 4)
- New exported type `CreateGenerationServiceInput = CreateGenerationInput & { referenceImages?: string[] }`;
  `create()` now takes it instead of `CreateGenerationInput`. The wire contract
  `createGenerationInputSchema` is UNCHANGED — the field exists only on the
  service-level input an in-process orchestrator builds directly. The generation
  route zod-parses the body, so zod strips this unknown key: no client can inject
  a reference; only `assets3d.extract` (which hands create() the concept image as
  a raw data-URI) can set it.
- Resolution block: a `directRefs = input.referenceImages ?? []` is computed and,
  when present, gated UNCONDITIONALLY (not nested under the `entityRefs` block) on
  `model.referenceMode` + `maxReferenceImages` against the TOTAL ref count, BEFORE
  the charge — a concept-only extraction (zero entityRefs) is still validated. The
  direct refs are then folded into `referenceImages` after any entity-derived ones.
- LEDGER UNTOUCHED: charge/refund/settle paths, the transaction, and the wire
  contract are byte-for-byte unchanged; a call without `referenceImages` behaves
  exactly as before.

## Commits
- 681e20f feat(api): generation lifecycle — charge, runware, store, poll, refund
- 138ab61 fix(api): close create/poll race — rows are not pollable until the provider call completes
- 5d16801 fix(api): settle stuck processing generations — no-asset polls fail with refund, stale rows reaped on poll and boot
- 3b96d8c fix(api,web,contracts): respect the NSFW flag — content_blocked failure with refund, never store flagged assets, localized safety copy
- 5e8de3d feat(api): native env loading + structured logging — settle/fail/provider.error events, req.log threading
- 1cdb3a8 fix(api): atomic charge+insert and failure settlement — one tx for charge+row insert, one tx in failGeneration for flip+refund
- 2859858 fix(api): forbid deleting processing generations — ConflictError 409 in remove()
- a7e4cd9 fix(api): ssrf allowlist, cursor tiebreaker, poll throttle — compound (createdAt,id) cursor, per-generation lastPolledAt throttle (DEFAULT_POLL_MIN_INTERVAL_MS)
- ecb7c7f fix(api): guard refund against succeeded race + atomic video submit failure — failGeneration check-and-set covers the refund too; video submit catch reuses it
- 7817253 feat(generation): resolve inputGenerationId server-side — canvas chain edge

## Key decisions (2026-07-09) — CinemaStudio (audio + presets)
- `Deps.audioProvider?: AudioProvider` added (fallback derived from `runware` via `createRunwareAudioAdapter`, mirroring the video registry fallback). Audio SUBMITS through it; it POLLS through the video registry (audio row is `provider: 'runware'`; the runware video adapter maps `audioURL` → `assetUrl`), so every money-path invariant is reused unchanged.
- `create()` now: (1) validates aspectRatio only for image/video (audio has none; audio skips `resolutionFor`); (2) composes the model-facing prompt via `applyPromptPreset(entityComposedPrompt, input.promptPreset)` — with no preset this returns the entity-composed prompt unchanged, so preset-less requests are byte-for-byte identical; (3) stores `composed_prompt` (only when a preset was used) + `prompt_preset_json`; (4) has a unified async branch: `model.type === 'audio'` submits via the audio provider, else the video registry — the publish/catch/settlement after submit is shared.
- Video submit now sends `modelPrompt` (was `input.prompt`) + the style preset `negativePrompt` (both omitted-when-empty). Image sends `modelPrompt` + `negativePrompt`. `negativePrompt` is wired through `VideoSubmitInput` → video-adapter → `RunwareVideoRequest`/`RunwareImageRequest`.
- `assetExt(type)` helper: video→mp4, audio→mp3, image→webp. Used by the download (get), and remove(); the image discard-on-race stays literal 'webp'.
- `toDto` now returns `composedPrompt` (null → client reads `prompt`) and `promptPreset` (parsed from `promptPresetJson`).

## Key decisions (2026-07-12) — Studio3D (`model3d` on the existing lifecycle)
`model3d` was routed through this service by adding **branches, not money code**. Zero lines of
`chargeCredits`, `failGeneration`, any `db.transaction`, the poll throttle, or the stale reaper were
touched. That is the whole design: a mesh is a fourth media type, not a fourth subsystem.

- **`Deps.meshProvider?: Mesh3dProvider`** — resolved as `meshProvider ?? createRunwareMeshAdapter(runware)`,
  exactly mirroring the audio fallback, so a caller injecting only `{ db, runware, storage }` (every
  direct-service unit test) still gets a working 3D path. A single adapter, **not a registry** like
  `videoProviders`: `'runware'` is the only 3D backend built; `'comfy-3d'` is a designed-but-unbuilt
  self-host seam (ADR D2 — hosted TRELLIS.2 beats running our own GPU).
- **`assetExt` gains `model3d → 'glb'`.** Load-bearing, not cosmetic: a mesh written under the default
  `.webp` is a file no GLB loader (three.js, `<model-viewer>`, iOS Quick Look) can open — a succeeded,
  paid-for, unopenable generation. One function owns the mapping so `get()`'s download, the
  discard-on-race cleanup and `remove()` cannot disagree.
- **Two PRE-charge guards in `create()`** (both before `chargeCredits` — a job we know will fail must
  cost the user nothing):
  1. the aspect-ratio gate now skips `model3d` as well as `audio` — a mesh has no 2D aspect ratio (the
     catalog's `'1:1'` is a throwaway `catalogBase` requires and the service never reads), and
     `resolutionFor` is likewise skipped (0,0 placeholders, never sent);
  2. `model.type === 'model3d' && !input.inputImage` → `ValidationError`. **v1 is image→3D only.**
     Text→3D exists on the provider (Tripo) but the composer UX does not, and a photo-less 3D row would
     submit a `3dInference` task with an empty `inputs.images` and fail AFTER the charge.
- **The async submit branch gains a `model3d` arm** next to audio's, submitting through `mesh.submit`
  with the `taskUUID` `create()` already minted (Runware requires the CALLER to mint the task id; it
  doubles as the idempotency key for the client's bounded retry). The arm exists precisely so a 3D job
  can never fall through to the video arm: a `videoInference` task can never produce a mesh, so the user
  would be charged for a job that can only fail. Everything AFTER the submit — the status-guarded job-id
  publish, the submit-window race guard, the shared poll path, the guarded fail+refund — is byte-for-byte
  unchanged and shared with video/audio.
- **The poll in `get()` resolves the registry from the ROW's media type**, never the live catalog:
  `row.type === 'model3d' ? mesh.poll(...) : resolveProvider(row.provider).poll(...)`. Durable state —
  a catalog edit must never redirect an in-flight job's poll. `MeshPollResult` is a type ALIAS of
  `VideoPollResult`, so every settlement branch below it (NSFW gate, no-asset guard,
  download-before-flip, guarded refund) is byte-for-byte the pre-Studio3D logic.
- **NSFW gap (inherited, documented):** `3dInference` exposes no moderation signal, so the mesh adapter
  reports `nsfw: false` and the §9.4 gate never fires for 3D — exactly as it does not for self-hosted
  wan-runpod.
- Pinned by `test/generations-3d.test.ts`: 202-not-201 + charged once, `.glb` on disk, refund on provider
  error, refund on success-with-no-asset, 400-before-charge without a photo, and **never submitted to the
  video provider**.

## Update 2026-07-30 — `inputGenerationId`, the canvas chain edge (ADR canvas-mode D2)

A canvas node feeds its output into the next node by CITING a generation id instead of re-uploading
its bytes. `create()` gains three edits, all inside the "everything here runs BEFORE the charge"
region — an impossible or unauthorized chain must cost the user nothing.

**1. Capability gates** (right after the `model3d requires a photo` guard). Capability is checked
BEFORE resolution so the refusal names the real reason instead of surfacing later as a confusing
reference-count error:
- `image` model without `referenceMode` → `${model.id} cannot condition on a reference image`
- `video` model without `supportsImageInput` → `${model.id} does not support image input`
- any other type (audio, model3d) → `${model.id} cannot take a generation as input`

**2. Resolution to our OWN stored media.** A direct row read, then FOUR default-deny checks that
share ONE error message (the `copyGeneratedAsset` precedent): the row must exist, be owned by the
caller, be `succeeded`, and be an `image` — and have media. A foreign id, a missing id, a failed run
and a video source are therefore indistinguishable, so nothing about another user's rows can be
probed. The media is read back through `storage.readAsDataUri`, which re-guards the disk read with
the raster-only MIME table.

**Why a data URI and not a URL.** The same reason entity photos take this path: `/media/*` is not
reachable from a provider (private in dev, behind a private asset host in prod). It is also what
keeps the SSRF guard intact — `inputImage` stays data-URI-only, and the server fetches nothing
user-addressable; it reads a file it already owns.

**3. Delivery differs by model type, because the two channels are not the same channel:**
- **image models** — the resolved data URI is merged into `input.referenceImages`, the SAME
  server-only channel entity photos and shot references use. That placement is load-bearing: it sits
  BEFORE the `referenceMode` / `maxReferenceImages` gate, so the chain image is COUNTED against the
  model's real limit, and the provider call needs no new plumbing at all. (Image models have no
  `supportsImageInput` — they condition only through references.)
- **video models** — it becomes the provider seed frame (the `inputImage` slot in `videoProvider.submit`).

`mode` is now `'image'` for a chain run too: a cited generation conditions the run exactly as much as
an uploaded frame does.

The wire contract makes `inputImage` and `inputGenerationId` mutually exclusive
(`createGenerationInputSchema`'s `superRefine`), so at most one seed frame is ever set and the
ternary in the submit spread cannot pick wrong.

**What did NOT change:** the charge/settle/refund sequence, the transaction boundary, the poll path,
and the NSFW gate are byte-for-byte identical. Pinned by
`test/generations-input-generation.test.ts` (image chain reaches `referenceImages` as a data URI;
video chain reaches the seed frame; a stranger's id, an unknown id and an incapable model each 400
with the balance untouched) plus the unchanged money suites `generations.test.ts`,
`generations-entity-refs.test.ts`, `generations-money-atomicity.test.ts`.

## Update 2026-07-30 — video path gates negativePrompt on model capability

- The video submit spread now honours `model.supportsNegativePrompt !== false`
  exactly like the image path always has. Runware rejects the WHOLE task on an
  unrecognized parameter, and Seedance 1.5 Pro started refusing
  `negativePrompt` outright ("Unsupported use of 'negativePrompt' parameter",
  verified live 2026-07-30 on a brick-template beat) — before the gate, every
  STYLED video on such a model failed at the provider and refunded. Same
  provider-drift pattern (and fix shape) as pixverse's `safety` (d881897).
- Companion catalog change: `seedance-1-5-pro` carries
  `supportsNegativePrompt: false`. Pinned by two tests in generations.test.ts
  («OMITS negativePrompt for flagged models» + «still sends to models that
  accept it»).

## Update 2026-07-31 — the style PACKAGE reaches the reference channel
ADR `style-studio` amendment A2/A3. `resolveStyle` now answers the whole style —
`ResolvedStyle = { fragment, negative, referenceImagePaths }` (type imported type-only from
`modules/styles/service`; the runtime dependency runs styles → generations, never back) — and
`create()` merges those images into the SAME server-only `referenceImages` channel entity photos,
shot attachments and the canvas chain edge already use.

**Where the merge sits, and why it sits there.** LAST: after the entity-derived refs and after the
direct/shot refs are folded in, immediately before pricing. A style is AMBIENT — the user picked an
atmosphere, not these specific pictures — whereas an entity tag is something they explicitly put in
this shot. Position IS the priority order.

Three rules, all of them one rule ("an ambient style must never make a request that would have
worked fail"):
1. **No capability refusal (A3).** A model with no `referenceMode` — image models that are not edit
   models, video models without r2v, audio/3D by construction — simply does not get them. The
   owner's 2026-07-24 shot-reference precedent verbatim: *refs are simply dropped silently for such
   models*. The FRAGMENTS still apply, on every model, which is what lets one style be used anywhere.
2. **The count gate never sees them.** That gate (`refs.length + directRefs.length >
   maxReferenceImages`) throws a 400. If style images were folded in before it, attaching a third
   picture to a style would start rejecting kontext generations that tag a character — a failure the
   user could not possibly connect to a style they edited last week. Instead the remaining budget is
   computed here (`(model.maxReferenceImages ?? 1) - referenceImages.length`) and the overflow is
   **trimmed silently**.
3. **A dead file is not a failed generation.** `storage.readAsDataUri` throwing drops that one
   reference with a `style.reference.missing` warn line and lets the paid request continue.

Runs BEFORE `chargeCredits`, like every other reference read, so nothing here can fail after money
moved. Pinned by `test/generations-styles.test.ts` (delivery on flux-kontext-pro · silent absence on
flux-schnell with the fragment still composed · entity ref + 2 style refs on a max-2 model trims the
style side and still succeeds · 3 style refs never turn a tagged request into a 400 · a deleted
stored file is dropped without failing). The builtin byte-identical composition pins in that file are
unchanged.
