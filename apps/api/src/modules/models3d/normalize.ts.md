# normalize.ts — turntable mp4 normalizer (argv only)

> AI-facing sidecar for `normalize.ts`. Created 2026-07-12. Keep this in sync with the code on every change.

## Purpose
Builds the ffmpeg argument vector that turns a **browser-rendered turntable** into an mp4 that plays
everywhere. It is a **pure function**: it spawns nothing, touches no disk, and returns `string[]`.

## What it does (for an AI reader)
- **Responsibilities:** own the normalize filtergraph and encoder flags — and nothing else.
- **Public API:** `buildNormalizeArgs(plan: NormalizePlan): string[]`, `type NormalizePlan`.
- **Inputs → Outputs:** `{ inputPath, outputPath, maxHeight? }` → ffmpeg argv, output path always last.
- **Side effects:** none. The caller (`models3d/service.ts`) spawns `ffmpeg-static` with these args.

## Why it exists at all (the client already made an mp4)
The client encodes H.264 through WebCodecs, so this is **not a rescue job — it is a guarantee**. Four
properties the browser does not promise, each a real failure if missing:

| flag | what it buys | what breaks without it |
|---|---|---|
| `-movflags +faststart` | moves the `moov` atom to the front | a WebCodecs mux writes it LAST, so the clip only plays after a full download instead of streaming |
| `-pix_fmt yuv420p` | 8-bit 4:2:0 | Chrome may legally emit 4:4:4 or 10-bit; Safari and QuickTime then refuse the file outright |
| `-vf scale=…` (opt-in) | caps output height | an oversized upload silently becomes an oversized stored asset |
| `-an` | drops audio | a turntable is silent by definition; an unasked-for track is bytes plus a class of container surprises |

## The scale expression, decoded
`scale='trunc(iw*min(1,H/ih)/2)*2':'trunc(min(ih,H)/2)*2'` does two jobs at once:
- `min(1, H/ih)` clamps the factor to **at most 1** — a 720p input stays 720p rather than being upscaled
  to meet the cap. A cap is a ceiling, never a target.
- `trunc(../2)*2` forces **both** dimensions even. `yuv420p` subsamples chroma 2×2, so an odd dimension
  makes ffmpeg refuse the encode.

`maxHeight` is optional with **no default**: absent a cap, no `-vf` is emitted at all, because
re-scaling a clip that is already the right size is pure quality loss.

## Dependencies
- **Imports:** none — deliberately. Purity is what lets `normalize.test.ts` pin the filtergraph without
  ever spawning ffmpeg.
- **Used by:** `apps/api/src/modules/models3d/service.ts` (the render-upload path).
- **Precedent:** `apps/api/src/modules/films/render.ts` (`buildFfmpegArgs`) — same split, same reason.

## Diagram
```mermaid
flowchart LR
  A[browser WebCodecs mp4] -->|upload| B[models3d/service.ts]
  B --> C[buildNormalizeArgs]
  C -->|string[]| D[spawn ffmpeg-static]
  D --> E[faststart + yuv420p mp4]
  E --> F[storage -> model_render.mediaJson]
  C -.pure, no I/O.-> T[normalize.test.ts]
```

## Key decisions / gotchas
- The **argv is the tested surface**, not the encoded bytes. A filtergraph regression is caught in
  milliseconds without ffmpeg on the box.
- Do not give `maxHeight` a default here. The cap is a policy decision that belongs to the caller; baking
  one in would silently re-encode every render that did not need it.

## Commits
- (pending) feat(api): pure ffmpeg normalize argv for turntable uploads
