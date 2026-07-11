# client.ts — Runware REST client (fetch, no SDK)

> AI-facing sidecar for `client.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
The only place that talks HTTP to Runware. Wraps the single `POST /v1` tasks endpoint with timeout, bounded retry and stable error mapping, and is injected via `AppDeps` so tests swap in a fake (`fakeRunware`, plan Task 10).

## What it does (for an AI reader)
- Responsibilities: build task envelopes, POST them, map `{ data, errors }` responses to typed results or `RunwareError`.
- Public API / exports:
  - `createRunwareClient({ apiKey, endpoint? })` → `RunwareClient`.
  - `RunwareClient.imageInference(req)` → `RunwareImageResult` — sync task (`deliveryMethod: 'sync'`, `includeCost: true`, `outputType: 'URL'`, WEBP, safety check on).
  - `RunwareClient.submitVideo(req)` → `void` — async task ack (`deliveryMethod: 'async'`, MP4); `frameImages` nests under `inputs`.
  - `RunwareClient.submitAudio(req)` → `void` — async task ack (`audioInference`, MP3); TTS vs music shape chosen from `audioKind`.
  - `RunwareClient.submit3d(req)` → `void` — async task ack (`3dInference`, GLB); `inputImage` nests under `inputs.images`, `pbr`/`faceLimit` under `settings`. **Sends no `safety` param.**
  - `RunwareClient.getResponse(taskUUID)` → `RunwarePollResult` (`processing`/`success`/`error` union). Success surfaces `videoURL`/`imageURL`/`audioURL` (flat) **and** `meshURL` (normalized from `outputs.files[0].url`).
  - `RunwareError` — `statusCode = 502`, `apiCode = 'provider_error'` so the app error handler emits the stable envelope; carries optional `runwareCode`.
- Inputs → Outputs: typed requests → typed results; body is always an ARRAY of task objects (Runware batch protocol).
- Side effects: HTTPS to `https://api.runware.ai/v1` (or injected `endpoint`); no state.

## Dependencies
- Imports / depends on: `./types` (type-only).
- Used by: `src/index.ts` boot + `modules/generations/service.ts` (Task 10); tested by `test/runware-client.test.ts` with `vi.stubGlobal('fetch', …)`.

## Diagram
```mermaid
flowchart LR
  SVC[generations/service.ts] --> C[client.ts post()]
  C -->|POST tasks[] + Bearer key, 120s timeout| RW[(Runware /v1)]
  RW -->|data / errors| C
  C -->|typed result| SVC
  C -->|RunwareError 502 provider_error| EH[app error handler]
```

## Key decisions / gotchas
- **Timeout**: every call carries `AbortSignal.timeout(120_000)` — a hung provider socket must never pin a request handler (reliability rule: every outbound call has a timeout). Not in the plan snippet; added deliberately.
- **Retry**: exactly one retry, only for transient 429/503/504, after 1.5s. Safe for mutating submits because the caller-supplied `taskUUID` is the provider-side idempotency key.
- **No secret/body leakage**: HTTP failures throw `Runware HTTP <status>` only — never the response body (unvetted) or the Authorization header.
- **`getResponse` returns states, not exceptions**: a failed generation is control flow for the poll caller (mark row failed + refund), not a 5xx of our own; the `errors[]` array maps to `{ status: 'error' }`.
- `imageInference` result is a cast (`as unknown as RunwareImageResult`), trusting Runware's documented shape; tests pin the parts we rely on.

## Key decisions (2026-07-08)
- `submitVideo` honors `omitSafety` (destructured out, never serialized): ByteDance/Seedance models reject the `safety` task param with `unsupportedParameter`. Default behavior for all other models unchanged (`safety: {checkContent: true, mode: 'fast'}`).
- Non-2xx responses now parse the JSON body and surface ONLY the structured `errors[0].code/message` fields (falling back to `Runware HTTP <status>`): 4xx bodies carry the actionable reason (e.g. unsupportedParameter), while raw-body echo stays forbidden (unvetted content / key-leak posture preserved).

## Commits
- 46cf18d feat(api): runware REST client (imageInference, videoInference, getResponse)

## Key decisions (2026-07-09) — CinemaStudio audio
- `submitAudio(req: RunwareAudioRequest)` added to the `RunwareClient` type + impl: audioInference, `deliveryMethod: 'async'`, same ack-then-`getResponse` contract as `submitVideo`. Builds the TTS shape (`speech.{text,voice}`) vs music shape (`positivePrompt` + `settings.instrumental`) from `req.audioKind` — Runware keys the workflow off model+payload, not a separate task type.
- `getResponse` now also surfaces `audioURL` (success branch triggers on `videoURL || imageURL || audioURL`). The video adapter maps it into the neutral `assetUrl`, so audio settles through the exact same generation-service path as video.

## Key decisions (2026-07-11) — Studio3D
- `submit3d(req: Runware3dRequest)` added: `3dInference`, `deliveryMethod: 'async'`, `outputFormat: 'GLB'`. A NEW TASK TYPE on this existing client, not a new provider — Runware hosts image→3D (TRELLIS.2 / Hunyuan3D / Tripo / Meshy) first-class. Same ack-then-`getResponse` contract as `submitVideo`/`submitAudio`.
- **Envelope nesting is load-bearing.** `inputImage` → `inputs.images[]` and `pbr`/`faceLimit` → `settings`; all three are destructured out of the request so they can never leak flat onto the task. A flat `inputImage` is *silently ignored* by Runware — the task submits fine and simply never yields a mesh, so this is not a failure you would see at the boundary.
- **No `safety` param, ever.** `3dInference` documents no safety filter and Runware returns `400 unsupportedParameter` for params a model does not know — the exact failure that already cost us two fixes (ByteDance/Seedance, Wan 2.7). Unlike `submitVideo` there is no `omitSafety` flag, because `safety` is never sent in the first place.
- `settings.imageAutoFix: true` — let the provider segment the subject. Every image→3D model produces a materially better mesh from a clean cutout, and Tripo/Hunyuan ship their own matting; cheaper and better than us doing it badly.
- Knobs are spread-if-present (`...(pbr !== undefined ? { pbr } : {})`), never emitted as `undefined` keys — an unknown/`undefined` param is still a param, and params a model does not know are a 400.
- **`getResponse` learned the mesh shape.** A finished `3dInference` does NOT use the flat `imageURL`/`videoURL`/`audioURL` shape; it returns `outputs: { files: [{ uuid, url }] }`. The client normalizes `outputs.files[0].url` → `meshURL` and adds it to the success trigger. Doing this *here* rather than in an adapter keeps ONE place that knows Runware's response envelope. **If this were missed, every 3D poll would read as "success with no asset": the generation service would fail the row and refund a job that actually succeeded, while we still paid Runware for the mesh.** A malformed `outputs` (e.g. `files: []`) deliberately does NOT settle as success — it falls through to `unexpected poll payload`, because a success with no asset is precisely the state that must never reach settlement.
- Regression guard in `test/runware-client.test.ts`: a parameterized test asserts a flat `videoURL`/`imageURL`/`audioURL` success (no `outputs` key at all) still parses, with `meshURL` undefined. Adding the mesh probe to the shared success branch is the one change here that could have silently broken image/video/audio settlement.
