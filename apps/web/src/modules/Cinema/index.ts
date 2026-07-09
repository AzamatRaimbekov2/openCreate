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
