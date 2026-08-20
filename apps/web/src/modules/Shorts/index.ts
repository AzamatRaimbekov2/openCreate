// apps/web/src/modules/Shorts/index.ts
// Public API of the Shorts module — routes import ONLY from 'modules/Shorts'.
// Internal files (model/, components/) are private.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// WHAT THIS MODULE IS, in one sentence from the ADR: "a template that
// instantiates a 9:16 film, plus a batch runner over its shots". The template
// half already existed, so almost everything here is the runner and the two
// surfaces it needs — a variants table to plan with and a board to watch.
//
// WHAT IT IS NOT: a second gallery. `TemplateCategory` widened by one value, so
// the shorts shelf appears in /templates for free; this module owns the BATCH,
// which is the part that has nowhere else to live.
//
// THREE SEAMS, and only three. This module reaches outside itself through the
// public APIs of two siblings and through shared cache keys, never through a
// deep import:
//   · modules/Templates — TemplateCard, TierPicker, useTemplates, useBalance.
//     A shorts template IS an ordinary template; a second card and a second tier
//     picker would be a second answer to questions already answered.
//   · modules/Cinema — composeShotClipInput, shouldRetrySubmit, useShotGeneration
//     (+ useShotGenerations). A shorts batch runs the EXISTING per-shot money
//     path; duplicating its client half would let the batch send a different
//     price than the timeline does for the same shot.
//   · the shared QUERY CACHE — ['film', id], ['films'], ['generation', id],
//     ['me']. That is how the run board stays a derivation instead of a second
//     source of truth about whether a clip exists (ADR §2).
// Nothing imports Shorts back. The dependency runs one way.
//
// The CATALOG is not fetched here: it arrives from the ROUTE as `models`, the
// same seam Cinema and Assets3D use. It is the source of every price on the
// surface, and a module that fetched it itself would have two of them.
export { ShortsStudio } from './components/ShortsStudio'
