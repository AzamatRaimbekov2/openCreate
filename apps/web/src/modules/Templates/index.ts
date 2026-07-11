// apps/web/src/modules/Templates/index.ts
// Public API of the Templates module — routes import ONLY from 'modules/Templates'.
// Internal files (model/, components/) are private.
//
// ADR: docs/wiki/decisions/template-catalog.md
//
// This module does NOT import Cinema, and Cinema does not import it. They meet in
// two places, both of them seams the codebase already uses:
//   · a ROUTE. /templates creates a film and then navigates to /cinema/$filmId.
//     `useTemplate` is exported (the Entities module's precedent, which exports
//     useEntities for exactly this reason) so the film-editor route can look up
//     the template a film came from and hand its music prompt to FilmEditor —
//     without either module importing the other.
//   · the shared QUERY CACHE. Instantiation seeds ['film', id] and invalidates
//     ['films']; Cinema reads both. No import, no coupling.
export { TemplateCatalog } from './components/TemplateCatalog'
export { useTemplate, useTemplates } from './model/templatesApi'
