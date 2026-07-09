# Plan: CinemaStudio

ADR: `docs/wiki/decisions/cinema-studio.md` (ACCEPTED 2026-07-09).
Principle: composition layer over the existing generation lifecycle. Do NOT touch charge/refund.

## Task list (bottom-up)

### Contracts (`packages/contracts/src/`)
- [x] `presets.ts` — STYLE_PRESETS (disney/anime/2d-cartoon/3d-cartoon/cinematic), CAMERA_SHOTS, CAMERA_MOTIONS, QUALITY_PRESETS; `composePrompt()` pure fn.
- [x] `presets.test.ts` — composition order, negative merge, unknown-id fallback.
- [x] `film.ts` — Film, Shot, FilmAudio, FilmRender DTOs + create/update inputs.
- [x] extend `generation.ts` — add `'audio'` to type enum, optional `promptPreset`, `composedPrompt` on DTO; aspectRatio optional in params.
- [x] export from `index.ts`.

### API (`apps/api/src/`)
- [x] `config.ts` — optional `ANTHROPIC_API_KEY`.
- [x] `storage/local.ts` — add `localPath(key, ext): string`.
- [x] `db/schema.ts` + `db/ddl.ts` — film/shot/film_audio/film_render tables; generation +composedPrompt +promptPresetJson; type enum +audio.
- [x] catalog: audio models (tts, music) with credit pricing.
- [x] `modules/generations/service.ts` — compose prompt server-side; audio path (async via Runware audioInference adapter).
- [x] `integrations/runware/` — audio adapter (audioInference submit/poll) as a provider registry entry.
- [x] `modules/films/service.ts` + `routes.ts` — film/shot/audio CRUD, reorder.
- [x] `modules/films/render.ts` — ffmpeg filter-graph builder (pure, tested on argv) + render runner + semaphore + stale reaper.
- [x] `modules/films/storyboard.ts` — Claude script→shots (optional, key-gated).
- [x] wire in `app.ts`.
- [x] tests: composePrompt (contracts), ffmpeg argv builder, render status machine, film service ownership scoping.

### Web (`apps/web/src/modules/Cinema/`)
- [x] model + api (filmsApi, rendersApi).
- [x] components: FilmList, FilmEditor, Timeline, ShotComposer (preset pickers), PreviewPlayer, RenderButton, StoryboardDialog.
- [x] routes `_shell.cinema.tsx`, `_shell.cinema.$filmId.tsx`.
- [x] i18n ru/en.
- [x] 4 UI states; error-ux surfaces.

### Deps
- [x] `ffmpeg-static`, `@anthropic-ai/sdk` in apps/api.

### Verify
- [x] pnpm -r typecheck && lint && test.
- [x] real ffmpeg render (`test/render-ffmpeg.test.ts`): the pure-argv and fake-runner tests both
      passed while ffmpeg rejected the graph outright. Spawning the real binary found two bugs:
      drawtext quote escaping broke every titled render, and an over-long audio track stretched the
      export past the timeline. Both fixed and pinned.
