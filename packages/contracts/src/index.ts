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
// CinemaStudio prompt presets (style/camera/motion/quality) + applyPromptPreset.
// Exported before generation because generation.ts imports promptPresetSchema.
export * from './presets'
export * from './generation'
// CinemaStudio film composition contracts (Film/Shot/FilmAudio/FilmRender)
export * from './film'
export * from './credits'
export * from './user'
