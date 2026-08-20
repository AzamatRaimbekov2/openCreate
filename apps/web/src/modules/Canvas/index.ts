// apps/web/src/modules/Canvas/index.ts
// Public API of the Canvas module. Routes compose ONLY through these exports;
// the store internals, edge rules, node components and run hooks stay private,
// because the editor owns its own document lifecycle.
//
// The module imports NOTHING from modules/Generator or modules/Cinema: the
// model catalog a node picker needs is read at the ROUTE (the established
// cross-module seam) and handed down as React Flow node data. modules/Cinema
// is the one EXCEPTION on the other side (owner-approved, "Export to
// Canvas"): it may import THIS barrel to create + save a one-off document.
export { CanvasEditor } from './components/CanvasEditor'
export { CanvasLibrary } from './components/CanvasLibrary'
// Exposed so the route can drive the per-document lifecycle (init on load,
// reset on leave) and render the title + save status in its own header.
export { useCanvasStore } from './model/canvasStore'
export { useCanvasDetail, useCreateCanvas, saveCanvas } from './model/api'
export { useCanvasAutosave, retrySave } from './model/useCanvasDoc'
export type { CanvasEntityOption, CanvasModelOption } from './model/types'
