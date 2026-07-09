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
  - `RunwareClient.getResponse(taskUUID)` → `RunwarePollResult` (`processing`/`success`/`error` union).
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
