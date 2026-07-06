// apps/web/src/modules/Landing/model/pricingData.ts
// Single config for the honest price comparison (landing + pricing page).
// Numbers mirror the API catalog (credits × $0.01) and competitor reference
// points from the 2026-07 pricing research — re-verify quarterly and bump
// verifiedAt when you do. NO row may ship without a verification date.
export const CREDIT_USD = 0.01

// Row ids double as i18n key segments: landing.price.rows.<id>.*
export type PriceComparisonRowId = 'image' | 'video5s' | 'cinema5s'

export type PriceComparisonRow = {
  // Stable id — also selects the localized useCase/model/competitor copy
  id: PriceComparisonRowId
  // What the generation costs on openCreate, in credits (mirrors the catalog)
  ourCredits: number
  // Derived USD price (ourCredits × CREDIT_USD) — kept on the row so the UI
  // never re-implements the conversion
  ourPriceUsd: number
  // Competitor brand — a proper noun, never translated
  competitor: 'Midjourney' | 'Higgsfield' | 'Runway'
  // Competitor's public price for the comparable generation, USD
  competitorPriceUsd: number
  // When the competitor price was last verified (YYYY-MM) — the honesty marker
  verifiedAt: string
}

// One verification pass covered all three reference points
const VERIFIED_AT = '2026-07'

function row(
  id: PriceComparisonRowId,
  ourCredits: number,
  competitor: PriceComparisonRow['competitor'],
  competitorPriceUsd: number,
): PriceComparisonRow {
  return {
    id,
    ourCredits,
    ourPriceUsd: ourCredits * CREDIT_USD,
    competitor,
    competitorPriceUsd,
    verifiedAt: VERIFIED_AT,
  }
}

// Comparison points only — the copy rules forbid any blanket
// "cheaper than everything" claim, so each row names ONE competitor item
export const PRICE_COMPARISON_ROWS: PriceComparisonRow[] = [
  // Flash (FLUX schnell), 1 credit vs Midjourney's effective per-image rate
  row('image', 1, 'Midjourney', 0.05),
  // Swift (PixVerse V6) 5s vs Higgsfield Seedance 5s on the Ultra plan
  row('video5s', 35, 'Higgsfield', 0.83),
  // Cinema (Wan 2.7) 5s vs Runway Gen-4 5s pay-as-you-go
  row('cinema5s', 55, 'Runway', 1.15),
]

// Shared USD formatter so every surface prints prices identically ($0.35)
export function formatUsd(price: number): string {
  return `$${price.toFixed(2)}`
}
