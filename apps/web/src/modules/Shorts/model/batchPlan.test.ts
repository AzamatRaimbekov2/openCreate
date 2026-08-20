// The batch price, before a single credit moves. ADR shorts-studio §4 makes this
// the load-bearing safety mechanism of the whole feature, so the rules that cost
// money if wrong are pinned here:
//   * the itemisation is rows × GENERATED beats — a free title card is never a
//     priced row, and pricing it would inflate the number the user agrees to;
//   * every beat is priced at the tier model's rate for ITS OWN duration, read
//     off the live catalog — never a per-short average and never an authored
//     constant;
//   * ONE unpriceable beat makes the TOTAL null, and a null total disables the
//     confirm. Summing the rest would print a number smaller than the charge;
//   * if the client's per-beat sum DISAGREES with the server-computed tier
//     price, the total is null too. A disagreement means the SPA's catalog and
//     the API's catalog have drifted, and a dialog is the last place to pick a
//     winner between two prices that both claim to be real.
import { describe, expect, it } from 'vitest'
import type { CatalogModel, TemplateSummary } from '@opencreate/contracts'
import { buildBatchPlan } from './batchPlan'
import { SHORTS_TEMPLATE, TIER_MODEL } from './testFixtures'

const MODELS: CatalogModel[] = [TIER_MODEL]

describe('buildBatchPlan', () => {
  it('itemises rows × generated beats and totals them', () => {
    const plan = buildBatchPlan(SHORTS_TEMPLATE, 'standard', 3, MODELS)
    // 3 rows × 3 generated beats = 9 priced items; the title card is not one.
    expect(plan.items).toHaveLength(9)
    expect(plan.beatsPerRow).toBe(3)
    expect(plan.perShort).toBe(90)
    expect(plan.total).toBe(270)
  })

  it('leaves the free title card out of the itemisation entirely', () => {
    const plan = buildBatchPlan(SHORTS_TEMPLATE, 'standard', 1, MODELS)
    expect(plan.items.map((item) => item.label)).toEqual(['Hook', 'Turn', 'Return to frame 1'])
  })

  it('prices each beat at the tier model rate for ITS OWN duration', () => {
    // A five-second beat costs 20, not the 30 an eight-second one does. Pricing
    // a mixed-duration template off one per-clip average would be a lie in both
    // directions at once.
    const mixed: TemplateSummary = {
      ...SHORTS_TEMPLATE,
      clipCount: 2,
      beats: [
        { label: 'Short beat', durationSeconds: 5, generated: true },
        { label: 'Long beat', durationSeconds: 8, generated: true },
      ],
      tiers: SHORTS_TEMPLATE.tiers.map((offer) =>
        offer.tier === 'standard' ? { ...offer, credits: 50 } : offer,
      ),
    }
    const plan = buildBatchPlan(mixed, 'standard', 1, MODELS)
    expect(plan.items.map((item) => item.credits)).toEqual([20, 30])
    expect(plan.total).toBe(50)
  })

  it('carries the row and beat each item belongs to, so the dialog can name it', () => {
    const plan = buildBatchPlan(SHORTS_TEMPLATE, 'standard', 2, MODELS)
    expect(plan.items[0]).toEqual({ rowIndex: 0, beatIndex: 1, label: 'Hook', credits: 30 })
    // Row 1's first beat is still beat index 1 of the template.
    expect(plan.items[3]).toMatchObject({ rowIndex: 1, beatIndex: 1 })
  })

  it('makes the total NULL when the catalog has not loaded (no price, no confirm)', () => {
    // An empty catalog is the normal first render. The dialog must go quiet
    // rather than quote the tier offer as if it had verified it.
    const plan = buildBatchPlan(SHORTS_TEMPLATE, 'standard', 3, [])
    expect(plan.perShort).toBeNull()
    expect(plan.total).toBeNull()
    expect(plan.items.every((item) => item.credits === null)).toBe(true)
  })

  it('makes the total NULL when the tier model is missing from the catalog', () => {
    const plan = buildBatchPlan(SHORTS_TEMPLATE, 'premium', 2, MODELS)
    expect(plan.total).toBeNull()
  })

  it('makes the total NULL when a beat duration has no price in the model table', () => {
    const odd: TemplateSummary = {
      ...SHORTS_TEMPLATE,
      clipCount: 1,
      beats: [{ label: 'Odd', durationSeconds: 7, generated: true }],
    }
    const plan = buildBatchPlan(odd, 'standard', 1, MODELS)
    expect(plan.items[0]?.credits).toBeNull()
    expect(plan.total).toBeNull()
  })

  it('makes the total NULL when our per-beat sum disagrees with the server tier price', () => {
    // The API computed 90 from ITS catalog; ours computes 60 from a table that
    // has drifted. Both numbers claim to be the truth, so we state neither.
    const drifted: TemplateSummary = {
      ...SHORTS_TEMPLATE,
      tiers: SHORTS_TEMPLATE.tiers.map((offer) =>
        offer.tier === 'standard' ? { ...offer, credits: 60 } : offer,
      ),
    }
    const plan = buildBatchPlan(drifted, 'standard', 2, MODELS)
    expect(plan.total).toBeNull()
    expect(plan.hasPriceDrift).toBe(true)
  })

  it('reports no drift on the happy path', () => {
    expect(buildBatchPlan(SHORTS_TEMPLATE, 'standard', 1, MODELS).hasPriceDrift).toBe(false)
  })

  it('totals an empty table at zero and produces no items', () => {
    // Not null: zero rows is a KNOWN price of nothing. The Run control is
    // disabled on an empty item list, not on an unknown total.
    const plan = buildBatchPlan(SHORTS_TEMPLATE, 'standard', 0, MODELS)
    expect(plan.items).toEqual([])
    expect(plan.total).toBe(0)
  })

  it('scales linearly with the row count, which is what the table shows live', () => {
    const totals = [1, 2, 5, 10].map(
      (rows) => buildBatchPlan(SHORTS_TEMPLATE, 'standard', rows, MODELS).total,
    )
    expect(totals).toEqual([90, 180, 450, 900])
  })
})
