// apps/web/src/modules/Cinema/index.ts
// Public API of the CinemaStudio module — routes import ONLY from
// 'modules/Cinema'. Internal files (model/, components/) are private. The module
// stays free of cross-module imports: the catalog it needs for the shot/audio
// model pickers is read at the ROUTE (the established seam, like /create) and
// passed into FilmEditor as `models`. Decoupling from Gallery/Generator happens
// through the shared query cache (['generations'], ['generation', id]), never an
// import.
export { CinemaLibrary } from './components/CinemaLibrary'
export { FilmEditor } from './components/FilmEditor'
// ── Published for the Shorts batch runner (ADR shorts-studio §3) ─────────────
// A shorts batch is "N films × M beats through the EXISTING per-shot generation
// path". Those two functions ARE that path's client half, and a second copy of
// either would be a second answer to a money question:
//   · composeShotClipInput is the one place a shot becomes a generation request.
//     Duplicating it would let the batch send a different aspect or a different
//     duration — i.e. a different PRICE — than the timeline does for the same shot.
//   · shouldRetrySubmit is the app's single answer to "is this failure worth
//     repeating". A copy that drifted could retry insufficient_credits, which
//     re-costs the attempt.
// Published through the public API rather than deep-imported, and Cinema still
// imports nothing from Shorts — the dependency runs one way only.
//   · useShotGeneration is the app's one live view of "how is THIS shot's clip
//     doing", over the shared ['generation', id] entry. The run board asks the
//     identical question, and a second hook on the same key would mean a second
//     polling interval per clip — the exact multiplication ADR shorts-studio §7
//     budgets against.
export { composeShotClipInput } from './model/composeShotClipInput'
export { shouldRetrySubmit, useShotGeneration, useShotGenerations } from './model/shotGeneration'
