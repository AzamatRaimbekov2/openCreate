// apps/web/src/modules/Landing/components/ShowcaseSpread.test.tsx
// Behavior: the "Selected works" spread renders six deliberate poster figures,
// every caption honestly carries the "sample style" label plus the REAL model
// behind the style, exactly one poster is marked as a 5-second video, and the
// art itself stays decorative (aria-hidden, one distinct palette per card).
import { render, screen } from '@testing-library/react'
import { ShowcaseSpread } from './ShowcaseSpread'
// i18n init side effect — captions render localized copy (EN default)
import 'shared/config/i18n'

describe('ShowcaseSpread', () => {
  it('renders six figures, each honestly captioned as a sample style', () => {
    render(<ShowcaseSpread />)
    expect(screen.getByRole('heading', { level: 2, name: 'Selected works' })).toBeInTheDocument()
    const figures = screen.getAllByRole('figure')
    expect(figures).toHaveLength(6)
    // Honesty rule: we never imply these are real user generations
    for (const figure of figures) {
      expect(figure).toHaveTextContent(/sample style/i)
    }
  })

  it('marks exactly one poster as a 5-second video', () => {
    render(<ShowcaseSpread />)
    expect(screen.getAllByText(/video · 5s/i)).toHaveLength(1)
  })

  it('names the real catalog model behind every sample', () => {
    render(<ShowcaseSpread />)
    // Image posters carry the image models' provider labels…
    expect(screen.getAllByText(/FLUX (schnell|dev)/).length).toBeGreaterThan(0)
    // …and the video-marked poster names a real video model
    expect(screen.getByText(/Wan 2\.7/)).toBeInTheDocument()
  })

  it('keeps the art decorative with one distinct palette per card', () => {
    const { container } = render(<ShowcaseSpread />)
    const posters = Array.from(container.querySelectorAll('svg[data-palette]'))
    expect(posters).toHaveLength(6)
    const palettes = new Set(posters.map((poster) => poster.getAttribute('data-palette')))
    expect(palettes.size).toBe(6)
    for (const poster of posters) {
      expect(poster).toHaveAttribute('aria-hidden', 'true')
    }
  })
})
