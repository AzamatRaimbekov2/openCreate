// apps/web/src/modules/Entities/index.ts
// Public API of the Entities module — routes import ONLY from 'modules/Entities'.
// The library page is the surface; useEntities is exposed so the /create route
// can feed the composer's mention picker WITHOUT the Generator importing this
// module (cross-module law — the route is the seam, as with Regenerate).
export { EntityLibrary } from './components/EntityLibrary'
export { useEntities } from './model/entitiesApi'
