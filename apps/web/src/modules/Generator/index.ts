// apps/web/src/modules/Generator/index.ts
// Public API of the Generator module — routes import ONLY from
// 'modules/Generator'. Internal files (model/, components/) are private;
// the draft state and mutation stay encapsulated behind GeneratorPanel.
export { GeneratorPanel } from './components/GeneratorPanel'
// The catalog query is public for the /pricing route (Task 20): both surfaces
// share the SAME ['catalog'] cache entry, so exposing the hook beats
// duplicating it — the draft store and mutation remain private.
export { useCatalog } from './model/catalogApi'
