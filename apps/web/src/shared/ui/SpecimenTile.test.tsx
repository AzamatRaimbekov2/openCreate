// apps/web/src/shared/ui/SpecimenTile.test.tsx
// Behavior: SpecimenTile is decorative blue-violet duotone SVG "specimen" art
// (v3 Stage 2 — replaces the v2 editorial posters). Contract under test: all
// eight specimens render aria-hidden with NO text; the art uses flat fills +
// SVG patterns ONLY (no gradients, no feTurbulence — the hard owner rule);
// every specimen is a distinct drawing; several tiles on one page never
// collide on SVG defs ids; className merges for caller sizing.
import { render } from '@testing-library/react'
import { SPECIMEN_KINDS, SpecimenTile } from './SpecimenTile'

// A specimen's drawing fingerprint: geometry attributes of every mark, stable
// across mounts (unlike useId-based pattern ids, which are excluded)
function drawingFingerprint(svg: SVGSVGElement): string {
  const marks: string[] = []
  for (const el of svg.querySelectorAll('path, circle, rect, ellipse, line')) {
    const geometry = ['d', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'rx', 'points']
      .map((attr) => el.getAttribute(attr) ?? '')
      .join(',')
    marks.push(`${el.tagName}:${geometry}`)
  }
  return marks.sort().join('|')
}

describe('SpecimenTile', () => {
  it('renders decorative aria-hidden art with no text for every specimen', () => {
    expect(SPECIMEN_KINDS).toHaveLength(8)
    for (const kind of SPECIMEN_KINDS) {
      const { container, unmount } = render(<SpecimenTile kind={kind} />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      // Decorative art: hidden from the accessibility tree entirely
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg).toHaveAttribute('data-specimen', kind)
      // The art carries no text — captions are the consumer's job
      expect(svg?.textContent).toBe('')
      unmount()
    }
  })

  it('uses flat fills and SVG patterns only — never gradients or turbulence', () => {
    for (const kind of SPECIMEN_KINDS) {
      const { container, unmount } = render(<SpecimenTile kind={kind} />)
      // The NO-GRADIENTS owner rule, asserted on the rendered markup itself
      expect(container.innerHTML.toLowerCase()).not.toContain('gradient')
      expect(container.querySelector('feTurbulence, filter')).toBeNull()
      unmount()
    }
  })

  it('draws a distinct specimen per kind', () => {
    const fingerprints = SPECIMEN_KINDS.map((kind) => {
      const { container, unmount } = render(<SpecimenTile kind={kind} />)
      const svg = container.querySelector('svg')
      const fingerprint = svg ? drawingFingerprint(svg) : ''
      unmount()
      return fingerprint
    })
    // All 8 specimens must differ — no lazy recolors of one drawing
    expect(new Set(fingerprints).size).toBe(SPECIMEN_KINDS.length)
  })

  it('keeps defs ids unique when several tiles render together', () => {
    const { container } = render(
      <>
        <SpecimenTile kind="eye" />
        <SpecimenTile kind="eye" />
      </>,
    )
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('merges the caller className onto the svg for sizing', () => {
    const { container } = render(<SpecimenTile kind="moon" className="h-full w-full" />)
    expect(container.querySelector('svg')).toHaveClass('h-full', 'w-full')
  })
})
