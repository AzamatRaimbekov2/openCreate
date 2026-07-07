// apps/web/src/modules/Landing/components/ShowcaseSpread.test.tsx
// Behavior: the showcase renders the specimen grid — eight distinct decorative
// duotone tiles — with ONE honest mono caption under the grid that carries the
// localized "sample style" label AND the real catalog models behind the
// product, and exactly one tile is marked as a 5-second video.
import { render, screen } from '@testing-library/react'
import { ShowcaseSpread } from './ShowcaseSpread'
// i18n init side effect — the caption renders localized copy (EN default)
import 'shared/config/i18n'

describe('ShowcaseSpread', () => {
  it('renders one figure with eight distinct decorative specimen tiles', () => {
    const { container } = render(<ShowcaseSpread />)
    expect(screen.getByRole('heading', { level: 2, name: 'Selected works' })).toBeInTheDocument()
    // One figure for the whole grid — minimal chrome, no per-tile captions
    expect(screen.getAllByRole('figure')).toHaveLength(1)
    const tiles = Array.from(container.querySelectorAll('svg[data-specimen]'))
    expect(tiles).toHaveLength(8)
    const kinds = new Set(tiles.map((tile) => tile.getAttribute('data-specimen')))
    expect(kinds.size).toBe(8)
    for (const tile of tiles) {
      expect(tile).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('captions the grid honestly with the sample label and the real models', () => {
    render(<ShowcaseSpread />)
    const figure = screen.getByRole('figure')
    // Honesty rule: we never imply these are real user generations…
    expect(figure).toHaveTextContent(/sample style/i)
    // …and the REAL catalog models behind the product are named in the caption
    expect(figure).toHaveTextContent(/FLUX schnell/)
    expect(figure).toHaveTextContent(/FLUX dev/)
    expect(figure).toHaveTextContent(/Wan 2\.7/)
  })

  it('marks exactly one tile as a 5-second video', () => {
    render(<ShowcaseSpread />)
    expect(screen.getAllByText(/video · 5s/i)).toHaveLength(1)
  })
})
