// apps/web/src/modules/Landing/components/TableScrollRegion.test.tsx
// Behavior: the wide-table wrapper is a keyboard-focusable, labelled scroll
// region, and it shows the quiet mono "scroll →" hint ONLY while the content
// is actually wider than the region (the no-gradient scroll affordance —
// an edge fade would need a gradient, which the owner rule bans).
import { render, screen } from '@testing-library/react'
import { TableScrollRegion } from './TableScrollRegion'
// i18n init side effect — the hint renders localized copy (EN default)
import 'shared/config/i18n'

// jsdom has no layout engine: scrollWidth/clientWidth are always 0, so each
// test fakes the geometry it needs by shadowing the Element getters.
function mockWidths(scrollWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    value: scrollWidth,
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    value: clientWidth,
  })
}

afterEach(() => {
  // Drop the shadowing props so other tests see jsdom's own getters again
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth')
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
})

describe('TableScrollRegion', () => {
  it('exposes a focusable, labelled scroll region around its children', () => {
    render(
      <TableScrollRegion label="Credits per model">
        <table aria-label="inner table" />
      </TableScrollRegion>,
    )
    const region = screen.getByRole('region', { name: 'Credits per model' })
    // Keyboard users must be able to focus the region to scroll it
    expect(region).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('table', { name: 'inner table' })).toBeInTheDocument()
  })

  it('shows the scroll hint while the content overflows horizontally', () => {
    // A 36rem-min table inside a 390px phone column overflows
    mockWidths(576, 390)
    render(
      <TableScrollRegion label="Credits per model">
        <table />
      </TableScrollRegion>,
    )
    expect(screen.getByText('scroll →')).toBeInTheDocument()
  })

  it('keeps the hint off when the content fits', () => {
    mockWidths(576, 576)
    render(
      <TableScrollRegion label="Credits per model">
        <table />
      </TableScrollRegion>,
    )
    expect(screen.queryByText('scroll →')).not.toBeInTheDocument()
  })
})
