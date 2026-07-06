// apps/web/src/modules/Landing/components/PriceTable.test.tsx
// Behavior: the comparison data is honest (every row carries a verification
// date; our USD price derives from credits at $0.01/credit) and the table
// renders our column vs competitor column under the "verified" caption.
import { render, screen } from '@testing-library/react'
import { CREDIT_USD, PRICE_COMPARISON_ROWS } from '../model/pricingData'
import { PriceTable } from './PriceTable'
// i18n init side effect — the table renders localized copy
import 'shared/config/i18n'

describe('pricingData', () => {
  it('marks every comparison row with a verification date', () => {
    expect(PRICE_COMPARISON_ROWS.length).toBeGreaterThan(0)
    for (const row of PRICE_COMPARISON_ROWS) {
      expect(row.verifiedAt).toMatch(/^\d{4}-\d{2}$/)
    }
  })

  it('derives our USD price from credits at 1 credit = $0.01', () => {
    for (const row of PRICE_COMPARISON_ROWS) {
      expect(row.ourPriceUsd).toBeCloseTo(row.ourCredits * CREDIT_USD, 10)
    }
  })
})

describe('PriceTable', () => {
  it('renders our vs competitor columns with the verified caption', () => {
    render(<PriceTable />)
    // The <caption> is the table's accessible name — the honesty marker
    expect(screen.getByRole('table', { name: /verified july 2026/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'openCreate' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /elsewhere/i })).toBeInTheDocument()
    // Our headline prices (credits × $0.01)
    expect(screen.getByText('$0.01')).toBeInTheDocument()
    expect(screen.getByText('$0.35')).toBeInTheDocument()
    // The three verified competitor reference points
    expect(screen.getByText(/midjourney/i)).toBeInTheDocument()
    expect(screen.getByText(/higgsfield/i)).toBeInTheDocument()
    expect(screen.getByText(/runway/i)).toBeInTheDocument()
  })
})
