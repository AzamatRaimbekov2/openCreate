---
type: decision
status: proposed
updated: 2026-07-09
tags:
  - decision
  - cinema-studio
  - architecture
---

# ADR: CinemaStudio — film composition on top of the existing generation lifecycle

- **Status:** ACCEPTED — approved by the owner 2026-07-09 ("да делай"; architecture gate, `project-kickoff`)
- **Date:** 2026-07-09
- **Related:** [[opencreate-mvp-architecture]], [[entity-library-reference-tagging]], [[wan-selfhost-video-provider]]

## Context

The owner wants a **CinemaStudio** page: create films by generating shots with our existing
models, arrange them on a timeline, add transitions/titles/audio, tag characters, and control
the prompt through named presets (style, camera framing, camera motion, quality). Export is a
real mp4, rendered **server-side with ffmpeg**. Character *cut-out* (segmentation/inpainting)
is explicitly out of scope.

Four facts already in the codebase decide most of this before any preference does.

### 1. The money path is a single, hard-won choke point

`modules/generations/service.ts` owns charge-at-submit, guarded fail+refund inside one
transaction, the stale-processing reaper, the per-generation poll throttle, and the NSFW gate.
Every one of those invariants exists because a review found a way to give a user both the asset
and the money back. **Anything that spends credits and produces a media asset must go through
that service, or the invariant set is duplicated and will drift.**

Consequence: music and voiceover are **not** a new subsystem. They are `generation.type = 'audio'`
behind an `AudioProvider` seam shaped exactly like the existing `VideoProvider` seam
(`submit` → opaque job id; `poll` → `processing | success | error`). The service's switch is
already exhaustive over that union.

### 2. A render is not a generation

A render spends **our CPU**, not a provider's invoice. It has no provider job id, no NSFW gate,
no refund semantics worth the name (nothing was bought). Forcing it into `generation` would
mean a row with `provider: 'local'`, a null cost, and a poll path that polls nothing.

Consequence: `film_render` is its own table with its own status machine. It reuses the *shape*
of the lifecycle (processing → succeeded/failed, poll-driven, stale reaper) but not the ledger.

### 3. A tag is structure, never prose — and so is a preset

[[entity-library-reference-tagging]] established that the prompt carries opaque `[[e1]]`
placeholders and the meaning travels in a structured `entityRefs` array, because a text encoder
reads `@аня` as the word "аня".

The same argument applies to presets, for a different reason. If the client concatenates
`"3D animated feature film style, Disney/Pixar…, close-up, dolly in, cinematic lighting, " + userText`
and sends that as `prompt`, then:

- the stored `prompt` is fragment soup, so "Regenerate" and "Edit prompt" show the user 300
  characters they never wrote;
- changing a style fragment means shipping a new SPA;
- there is no way to answer "which style was this shot?" from the row.

Consequence: the client sends **structured** `promptPreset: { styleId, cameraShot, cameraMotion, quality }`.
The server composes, stores the user's text in `prompt` (unchanged meaning) and what the model
actually saw in `composedPrompt`. Same discipline as entity substitution, same place in the code.

### 4. The shot media is already on our disk

`storage.saveFromUrl` downloads every finished asset into `STORAGE_DIR` because Runware URLs
expire in 7 days. So the render's inputs are **local files**. ffmpeg needs no network, and the
SSRF allowlist is not in the picture at all.

Consequence: `StorageProvider` grows exactly one method — `localPath(key, ext): string` — and
nothing else about storage changes. (An S3 provider would implement it by staging to a temp dir;
noted, not built.)

## Decision

Build CinemaStudio as a **composition layer** over the existing generation lifecycle. Four new
concepts, one extended enum, one extended storage method. No change to charge/refund.

### Domain model

```
Film ─1:N─ Shot ─0:1─ Generation   (video | image; nullable → title card / uploaded clip)
 │           │
 │           └── promptPreset (style, cameraShot, cameraMotion, quality)
 │           └── trimStartMs, trimEndMs, transitionIn, titleOverlay
 │
 ├─0:N─ FilmAudio ─1:1─ Generation  (type='audio': music | voiceover)
 └─0:N─ FilmRender                  (ffmpeg job → mp4 in our storage)
```

- **`Film`** — `id, userId, title, aspectRatio, defaultStyleId, createdAt, updatedAt`.
- **`Shot`** — `id, filmId, orderIndex REAL, generationId?, promptPresetJson, trimStartMs,
  trimEndMs, transitionInJson, titleJson, createdAt`. `orderIndex` is a real number with
  midpoint insertion: reorder is one `UPDATE`, no renumbering pass.
- **`FilmAudio`** — `id, filmId, kind ('music'|'voiceover'), generationId, startMs, gainDb`.
- **`FilmRender`** — `id, filmId, userId, status, progress, mediaUrl, errorMessage, createdAt,
  completedAt`. No `costCredits`.

`generation.type` becomes `'image' | 'video' | 'audio'`. `generationParams.aspectRatio` becomes
optional (audio rows have none); every existing row and consumer is unaffected, because every
existing row is image or video and still carries it.

### Prompt composition — server-side, structured in

```
POST /api/generations
{ modelId, prompt: "аня смотрит на закат [[e1]]",
  entityRefs: [{ placeholder: "e1", entityId: "…" }],
  promptPreset: { styleId: "disney", cameraShot: "close-up",
                  cameraMotion: "dolly-in", quality: "cinematic" } }
                                │
                                ▼  composePrompt() — one pure function, unit-tested
  composedPrompt = "<style.fragment>, <shot.fragment>, <motion.fragment>, "
                   "<quality.fragment>, аня (a 7-year-old girl with…) смотрит на закат"
  negativePrompt = style.negative
```

`promptPreset` is **optional and additive** — the existing ChatComposer keeps working untouched.
Presets live in `packages/contracts/src/presets.ts` (shared: the web renders pickers from the
same table the API composes from, so they cannot disagree — the exact argument that moved
`RESOLUTIONS` into contracts).

Five styles ship: `disney`, `anime`, `2d-cartoon`, `3d-cartoon`, `cinematic`. Each carries
`{ id, fragment, negative?, recommendedModelId }`. Camera framing, camera motion and quality are
three further small enums with the same `{ id, fragment }` shape.

### Render pipeline

```
POST /api/films/:id/renders  →  202 { renderId, status: 'processing' }
        │
        ├─ build filter graph from ordered shots (pure fn, unit-tested against expected argv)
        ├─ spawn(ffmpegStaticPath, argv[])          ← argv array, never a shell string
        │     inputs:  storage.localPath(generationId, 'mp4')   (local, no network)
        │     graph:   trim → scale/pad to canvas → xfade → drawtext → amix
        │     progress: -progress pipe:1 → out_time_ms / totalMs → percent
        └─ output:  storage.localPath(renderId, 'mp4')  →  /media/<renderId>.mp4

GET /api/films/:id/renders/:renderId  →  { status, progress, mediaUrl }
```

- **`ffmpeg-static`** (binary in `node_modules`), not a system dependency: `ffmpeg` is absent on
  this machine and would be absent in a fresh container too.
- **Concurrency:** a global semaphore (2 concurrent renders) plus one in-flight render per user.
  ffmpeg is CPU-bound and this process also serves the API and holds the SQLite file.
- **Crash recovery:** the same stale-reaper shape as generations — a `processing` render older
  than the threshold is failed at boot. Nothing to refund.
- **Cost:** free in v1 (no provider invoice), bounded by the rate limit + semaphore instead.

### Script → storyboard

`POST /api/films/:id/storyboard { script, styleId, shotCount? }` → Claude (`claude-opus-4-8`,
adaptive thinking, structured output via `output_config.format`) returns an array of
`{ title, prompt, cameraShot, cameraMotion, durationSeconds }`. Those become **draft shots**
(`generationId = null`). Nothing is generated and nothing is charged until the user reviews and
presses Generate — at which point each shot is an ordinary `POST /api/generations`.

`ANTHROPIC_API_KEY` is **optional** in config, exactly like `COMFY_BASE_URL`: unset keeps boot
healthy and the endpoint answers a clean `provider_error`. Storyboarding is charged a small flat
credit fee (it is a real API cost); the exact number is a launch decision, not an architecture one.

### Frontend

New module `apps/web/src/modules/Cinema/`, public API via `index.ts`, no cross-module imports
(frontend guardrails). Routes `_shell.cinema.tsx` (film list) and `_shell.cinema.$filmId.tsx`
(editor). Reuses `Generator` (createGeneration, model pickers), `Gallery` (pick an existing clip),
`Entities` (character tagging in the shot prompt).

**Preview is DOM, not ffmpeg.** Two stacked `<video>` elements crossfade via CSS; the playhead is
computed from cumulative trimmed durations; titles are absolutely-positioned text. The preview is
an *approximation* — the server render is authoritative. Saying so in the UI is cheaper than
shipping a wasm encoder that disagrees with the server one.

## Alternatives rejected

**Browser-side export (ffmpeg.wasm / WebCodecs).** Zero server cost and instant, but a 5-minute
film is 2–4 GB of browser RAM, Safari parity is poor, and — decisively — the exporter would be a
*second* implementation of the edit semantics that must agree with nothing. Rejected: the render
must be reproducible from the stored timeline, on any device.

**Audio as its own subsystem.** A separate `audio_asset` table with its own submit/poll/refund.
Rejected: it duplicates the exact code path that four review findings have already hardened
(fail+refund atomicity, refund-after-success race, stale sweep, poll throttle). A second copy
would drift, and the drift would cost users money.

**LoRA / per-style checkpoints instead of prompt presets.** Higher style fidelity, but several
of our video providers expose no LoRA slot at all, the catalog would grow ×5 per style, and each
style would need per-model pricing. Rejected for v1; the preset table has a `recommendedModelId`
field, which is the seam through which a LoRA-backed style could later swap the model.

**Client-composed prompts.** Rejected — see Context §3.

## Consequences

- `generation.type` gains `'audio'`; `generationParams.aspectRatio` becomes optional. Additive.
- Two new columns on `generation`: `composedPrompt` (nullable), `promptPresetJson` (nullable).
  Legacy rows read `composedPrompt === null → prompt`.
- New tables: `film`, `shot`, `film_audio`, `film_render`. Mirrored in `ddl.ts` per the schema rule.
- New optional env: `ANTHROPIC_API_KEY`. New dependency: `ffmpeg-static`, `@anthropic-ai/sdk`.
- `StorageProvider` gains `localPath(key, ext)`.
- **Unchanged:** `chargeCredits`, `refundCredits`, `failGeneration`, `settleStaleGenerations`,
  the `VideoProvider` seam, the entity substitution path, and every existing test.

## Audio provider — resolved (Runware, zero new client)

Research (2026-07-09) confirmed Runware exposes audio under the **same request envelope as video**:
task type `audioInference`, the *same* caller-supplied `taskUUID`, the *same* `getResponse`
polling, the *same* `deliveryMethod: async`. So the `AudioProvider` seam is not even a new client —
it is one more entry in the existing Runware provider registry, discriminating on
`audioURL`/`audioUUID` instead of `videoURL`/`videoUUID`.

- **Voiceover:** `inworld:tts@2` — $0.035 / 1k chars, 100+ languages **including Russian voices**
  (Svetlana, Elena, Dmitry, Nikolai). Request field `speech.{text, voice, language, speed}`.
- **Music / background bed:** `minimax:music@2.6` — ~$0.15 per ~3-min track, `positivePrompt` +
  `settings.instrumental: true` for a clean instrumental.
- **SFX:** the only Runware SFX model (`mirelo:sfx@1.6`) is `coming-soon` (not callable). SFX is
  therefore **out of v1**; if it becomes a requirement, fal.ai has a submit/poll shape identical to
  our video path. The seam makes that a one-adapter add, not an architecture change.

Two doc-contradiction caveats to verify with one live call before wiring (do not block the gate):
Runware's own pages disagree on the background-removal task name (`removeBackground` vs
`imageBackgroundRemoval`) and the input-image field (`inputs.image` vs top-level `inputImage`).
Background removal is not in CinemaStudio v1 anyway (cut-out is out of scope), so this only matters
if the Entity library later adds a "cut character from photo" button.

Net effect on this ADR: the `generation.type = 'audio'` decision (Context §1) now costs **one
Runware adapter method and one credits-catalog row**, not a new integration.

## Addendum 2026-07-15 — native generation audio (owner-approved pricing)

The audio-off economics stand as the DEFAULT; the user can now opt a shot INTO the
model's own soundtrack, end to end:

- **Capability in the catalog, not in the client:** `nativeAudio: 'switchable' | 'always'`
  on video models. `switchable` (Seedance 1.5 Pro, PixVerse) = the request decides and
  audio-on is priced from `creditsByDurationWithAudio` — **2× the silent table** (owner
  decision 2026-07-15: ByteDance bills exactly 2× with audio; honest margin over a flat
  price). `always` (Wan 2.7 direct) = audio ships in every clip, already in the list
  price. Absent (MiniMax/Kling/Veo/Seedance 2.0) = no verified switch → the composer
  disables the toggle and the API refuses `audio: true` before charging.
- **Provenance over probing:** the generation row stamps `params.audio = true` for any
  clip that carries a soundtrack. The ffmpeg render maps a clip's `[i:a]` stream into
  the export mix only when the SHOT asks (`shot.audio`) AND the row's provenance agrees —
  a shot flag alone would map a silent mp4's missing stream and kill the render; the row
  alone would force sound on users who turned it off after the fact.
- **Render:** the video fold now records each segment's timeline start (crossfades start
  inside the overlap); native chains atrim to the shot's window, adelay to that offset,
  and join the existing amix with music/voiceover tracks. Pinned by pure-args tests and
  a real-ffmpeg integration case (a clip WITH sound reaches the export as aac).
- **Adapters:** `runwareExtrasFor(air, styleId, audio=false)` — the flag flips the
  per-family key; the default stays false so nothing silent ever pays the 2× rate.
  DeepInfra/ark keep `generate_audio: false` (Seedance 2.0 audio pricing unverified).
- **Composer:** a speaker STATE toggle in the dock toolbar; the aria-label carries the
  ×2 on switchable models, disabled with an explanatory title where no switch exists.
  `shot.audio` persists the intent; `composeShotClipInput` forwards it only when the
  chosen model declares the capability.
