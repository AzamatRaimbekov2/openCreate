// Public API of @opencreate/contracts — the single wire-format source of
// truth shared by apps/api and apps/web (imported via the package root only).
export * from './errors'
export * from './catalog'
// Derived output resolution (tier × aspect) — shared so the API's Runware task
// and the web composer's readout can never disagree about the pixel size
export * from './resolution'
// The entity library (characters/objects/places) + the structured mention
// channel that makes tagging work at all (see entity.ts header)
export * from './entity'
// CinemaStudio prompt presets (style/camera/motion/quality/framing) +
// applyPromptPreset. Exported before generation because generation.ts imports
// promptPresetSchema.
export * from './presets'
// AI Soul Studio — the structured character spec (trait tables + composeSoul).
// Exported after presets because soul.ts builds on styleIdSchema, and it is what
// entity.soul is typed by.
export * from './soul'
export * from './generation'
// CinemaStudio film composition contracts (Film/Shot/FilmAudio/FilmRender)
export * from './film'
// Template catalog — the /templates gallery DTO and the from-template request.
// NOT the templates themselves: their prompts live server-side (see the header of
// templates.ts). Exported after film because a template instantiates into a
// FilmDetail.
export * from './templates'
export * from './credits'
export * from './user'
// Public auth provider flags (GET /api/auth/config) — drives runtime rendering
// of optional sign-in buttons (Google) without client/server drift.
export * from './auth-config'
// The portable Studio3D scene preset (lighting/camera/tonemap) — one JSON read
// by both the three.js viewer and any future server-side renderer.
export * from './scene3d'
// Studio3D render (video-from-model, no credit ledger — a render is not a
// generation) + the public revocable model share.
export * from './model-render'
// Modular 3D Assets (ADR modular-3d-assets): an aggregate that cites generations
// by id (like film). Exported after generation because parts cite generations.
export * from './asset3d'
// Prompt enhancer — a generic, free, stateless text transform (rough idea → one
// cinematic Wan prompt), plus its 'soften' variant for content_blocked retries.
// No dependencies on the above; ordering is immaterial.
export * from './prompt'
// Compare utility (hidden /compare page) — the direct DeepInfra image channel
// for model evaluation. No dependencies on the above; ordering is immaterial.
export * from './compare'
// Canvas Mode (ADR canvas-mode) — the node-graph aggregate that cites
// generations. No dependencies on the above; ordering is immaterial.
export * from './canvas'
// openCreator (ADR opencreator-agent) — the agent chat: sessions + structured
// messages (step/plan/result cards). Cites canvases/entities/generations by id
// only, so ordering is immaterial here too.
export * from './creator'
