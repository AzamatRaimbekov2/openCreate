// apps/web/src/modules/Shorts/model/batchPlan.ts
// What a shorts batch costs, computed BEFORE anything is created and before a
// single credit moves. ADR shorts-studio §4: "the batch is priced before it runs,
// itemised, on the button" — and that is the condition the template-catalog ADR
// attached when it rejected a "Generate all" button. This file is that condition.
//
// PURE over (template, tier, row count, catalog). No React, no cache, no network:
// the same discipline as `estimateBranchCredits` in Canvas, and for the same
// reason — a number the user is asked to agree to must be provable in a unit test
// with plain objects.
//
// THE THREE RULES, in the order they matter:
//   1. Only GENERATED beats are priced. A title card is free (it is rendered as
//      text over black), so pricing it would inflate the agreed total.
//   2. Each beat is priced at the tier model's rate for ITS OWN duration, off the
//      live catalog — the same table `creditsFor` uses server-side. A per-short
//      average would misprice every mixed-duration template.
//   3. One unpriceable beat makes the WHOLE total null. This is copied verbatim
//      from useRunBranch, where it exists so a dialog can never invent a number.
//
// AND ONE RULE THAT IS NEW HERE. The tier offer already carries a server-computed
// `credits` — the exact sum the generation endpoint will charge for one short.
// We compute our own from the catalog anyway, and if the two disagree we return
// a null total. That is not belt-and-braces: it is the only way the SPA can
// notice that its catalog and the API's have drifted, and on the largest single
// spend in the product "two prices, both claiming to be real" must resolve to
// "we don't know", never to whichever one we happened to reach for first.
import type { CatalogModel, TemplateSummary, TemplateTier } from '@opencreate/contracts'

// One priced row of the plan: beat `beatIndex` of the template, for short
// `rowIndex` of the variants table. `credits` is null when the catalog cannot
// price it — a null price is not a price.
export type BatchPlanItem = {
  // Which short (index into the variant rows) this beat belongs to
  rowIndex: number
  // Which beat of the template it is — the index into `template.beats`, so it
  // includes free title cards and therefore matches the created shot order
  beatIndex: number
  // The beat's authored label ("Hook"), for the itemisation
  label: string
  credits: number | null
}

export type BatchPlan = {
  // Rows in the table (shorts that will be created)
  rows: number
  // Priced beats per short — generated beats only
  beatsPerRow: number
  // What ONE short costs, or null when it cannot be priced
  perShort: number | null
  items: BatchPlanItem[]
  // rows × perShort, or null. Zero rows is a known price of nothing (0), not an
  // unknown one — the Run control is disabled on an empty item list instead.
  total: number | null
  // True when our per-beat sum and the server's tier price disagree. Surfaced so
  // the UI can say WHY the confirm is dead instead of showing a mute dash.
  hasPriceDrift: boolean
}

// The catalog's price for one clip of `seconds` on `model`. Mirrors the API's
// `creditsFor` for the silent case, which is the only case a template uses: a
// template pins `audio` nowhere, and `createShotInput.audio` defaults to false.
//
// EXPORTED because the run board prices a single-beat RETRY off the same table.
// Two tables would let a retry quote a price the batch did not charge.
export function clipCredits(model: CatalogModel | undefined, seconds: number): number | null {
  if (!model) return null
  if (model.type !== 'video') return model.credits
  return model.creditsByDuration[String(seconds)] ?? null
}

export function buildBatchPlan(
  template: TemplateSummary,
  tier: TemplateTier,
  rows: number,
  models: readonly CatalogModel[],
): BatchPlan {
  const offer = template.tiers.find((candidate) => candidate.tier === tier)
  const model = models.find((candidate) => candidate.id === offer?.modelId)

  // Keep the template index on each beat: the created film's shots are in beat
  // order, title cards included, so this is the number that maps a priced item
  // back onto a real shot once the films exist.
  const generated = template.beats.flatMap((beat, beatIndex) =>
    beat.generated ? [{ beat, beatIndex }] : [],
  )
  const perBeat = generated.map(({ beat, beatIndex }) => ({
    beatIndex,
    label: beat.label,
    credits: clipCredits(model, beat.durationSeconds),
  }))

  // One unknown beat price makes the short unpriceable (useRunBranch's law).
  const ourPerShort = perBeat.some((entry) => entry.credits === null)
    ? null
    : perBeat.reduce((sum, entry) => sum + (entry.credits ?? 0), 0)

  // The drift check. Only meaningful when both numbers exist; an absent offer is
  // a missing price, not a disagreement.
  const hasPriceDrift =
    ourPerShort !== null && offer !== undefined && ourPerShort !== offer.credits
  const perShort = hasPriceDrift ? null : ourPerShort

  const items: BatchPlanItem[] = Array.from({ length: Math.max(0, rows) }, (_, rowIndex) =>
    perBeat.map((entry) => ({
      rowIndex,
      beatIndex: entry.beatIndex,
      label: entry.label,
      // A drifted price is not a price either — blank the rows too, so the
      // itemisation cannot show numbers that add up to a total we refused.
      credits: hasPriceDrift ? null : entry.credits,
    })),
  ).flat()

  return {
    rows: Math.max(0, rows),
    beatsPerRow: perBeat.length,
    perShort,
    items,
    total: perShort === null ? null : perShort * Math.max(0, rows),
    hasPriceDrift,
  }
}
