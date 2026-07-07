// apps/web/src/shared/ui/ShowcasePoster.test.tsx
// Behavior: ShowcasePoster is decorative poster-grade art — an aria-hidden SVG
// composition per editorial palette. Contract under test: every palette
// renders; the art contains NO text (figure captions are the consumer's job);
// every composition carries the feTurbulence grain; palettes are visually
// distinct (different paint sets); multiple instances never collide on SVG
// defs ids; className merges onto the svg for sizing by the caller.
import { render } from '@testing-library/react'
import { SHOWCASE_PALETTES, ShowcasePoster } from './ShowcasePoster'

// Collect the distinct paint attributes of a composition — a palette's
// fingerprint that is stable across mounts (unlike useId-based defs ids)
function paintFingerprint(svg: SVGSVGElement): string {
  const paints = new Set<string>()
  for (const el of svg.querySelectorAll('[fill], [stroke], [stop-color]')) {
    for (const attr of ['fill', 'stroke', 'stop-color'] as const) {
      const value = el.getAttribute(attr)
      // url(#…) references contain the random id — exclude them
      if (value && !value.startsWith('url(')) paints.add(`${attr}:${value}`)
    }
  }
  return [...paints].sort().join('|')
}

describe('ShowcasePoster', () => {
  it('renders decorative aria-hidden grained art with no text for every palette', () => {
    expect(SHOWCASE_PALETTES).toHaveLength(6)
    for (const palette of SHOWCASE_PALETTES) {
      const { container, unmount } = render(<ShowcasePoster palette={palette} />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      // Decorative art: hidden from the accessibility tree entirely
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg).toHaveAttribute('data-palette', palette)
      // The brief bans text inside the art — captions live outside
      expect(svg?.textContent).toBe('')
      // Every composition is grained via feTurbulence (no flat gradients)
      expect(svg?.querySelector('feTurbulence')).not.toBeNull()
      unmount()
    }
  })

  it('renders a distinct composition per palette', () => {
    const fingerprints = SHOWCASE_PALETTES.map((palette) => {
      const { container, unmount } = render(<ShowcasePoster palette={palette} />)
      const svg = container.querySelector('svg')
      const fingerprint = svg ? paintFingerprint(svg) : ''
      unmount()
      return fingerprint
    })
    // All 6 palettes must differ — no lazy recolors of one composition
    expect(new Set(fingerprints).size).toBe(SHOWCASE_PALETTES.length)
  })

  it('keeps defs ids unique when several posters render together', () => {
    const { container } = render(
      <>
        <ShowcasePoster palette="dusk" />
        <ShowcasePoster palette="dusk" />
      </>,
    )
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('merges the caller className onto the svg for sizing', () => {
    const { container } = render(<ShowcasePoster palette="sea" className="aspect-[4/5] w-full" />)
    expect(container.querySelector('svg')).toHaveClass('aspect-[4/5]', 'w-full')
  })
})
