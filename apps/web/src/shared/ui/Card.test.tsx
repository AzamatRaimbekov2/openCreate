// apps/web/src/shared/ui/Card.test.tsx
// The kit's surface primitive. Two things are worth pinning: the accessible
// wrapper a titled card owes (a landmark a screen reader can jump to) and the
// readability invariant of the glass surface — an opaque fill MUST remain the
// baseline, because a translucent card on a browser without backdrop-filter is
// unreadable, not stylish. That guard is the reason glass lives in one place.
import { render, screen } from '@testing-library/react'
import { Card } from './Card'

describe('Card', () => {
  it('renders its children', () => {
    render(<Card>body copy</Card>)
    expect(screen.getByText('body copy')).toBeInTheDocument()
  })

  it('exposes a titled card as a landmark named by its heading', () => {
    render(<Card title="Audio tracks">body</Card>)
    const region = screen.getByRole('region', { name: 'Audio tracks' })
    expect(region).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Audio tracks' })).toBeInTheDocument()
  })

  it('is a plain container with no landmark when it has no title', () => {
    render(<Card>body</Card>)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('keeps an opaque fill under the glass so it stays readable without backdrop-filter', () => {
    render(<Card surface="glass">body</Card>)
    const card = screen.getByText('body').closest('div')
    expect(card).toHaveClass('bg-steel')
    expect(card?.className).toContain('supports-[backdrop-filter]:bg-white/[0.06]')
  })

  it('renders the recessed well surface without glass', () => {
    render(<Card surface="well">body</Card>)
    const card = screen.getByText('body').closest('div')
    expect(card).toHaveClass('bg-abyss')
    expect(card?.className).not.toContain('backdrop-blur')
  })
})
