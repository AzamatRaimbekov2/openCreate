// apps/web/src/modules/Styles/index.ts
// Public API of the Styles module. Routes compose these; no other module may
// reach inside (and no other module imports this one directly — the style
// pickers in Cinema receive the list as PROPS from their route, the same seam
// `useCatalog` uses).
export { StyleLibrary } from './components/StyleLibrary'
export type { StyleLibraryProps } from './components/StyleLibrary'
// Exported for the picker seam: routes that own a style picker read the registry
// here and hand `items` down. Everything else about a style stays in this module.
export { useStyles } from './model/api'
