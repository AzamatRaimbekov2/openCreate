// apps/web/src/modules/Soul/index.ts
// Public API of the Soul module — routes import ONLY from 'modules/Soul'.
// Everything else (the constructor, the sheet, the pricing math, the query hooks)
// is private: the two screens below are the whole contract.
export { SoulStudio } from './components/SoulStudio'
// The soul card takes the catalog as a PROP rather than reading it itself: the
// catalog hook belongs to modules/Generator, and a module may not import another
// module. The route is the seam (same pattern as /cinema/$filmId → FilmEditor).
export { SoulCard } from './components/SoulCard'
export type { SoulCardProps } from './components/SoulCard'
