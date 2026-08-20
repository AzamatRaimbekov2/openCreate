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
// ── Published for the Shorts Studio (ADR shorts-studio §1) ───────────────────
// A shorts template is an ORDINARY template on a new shelf, so the Shorts batch
// surface is not a second gallery — it reuses this module's pieces verbatim:
//   · TemplateCard — the typographic poster. A second card component would be a
//     second answer to "what does a template look like", and they would drift.
//   · TierPicker — the price/quality choice, with affordability answered BEFORE
//     the click. A batch multiplies that choice by N rows, so getting it wrong
//     here is N times as expensive as getting it wrong on one film.
//   · useBalance — the ['me'] read the spend confirm needs to state a shortfall.
//     One hook on the shared key rather than two identical ones.
// Templates imports nothing from Shorts: the dependency runs one way only.
export { TemplateCard } from './components/TemplateCard'
export { TierPicker } from './components/TierPicker'
export { useBalance } from './model/templatesApi'
