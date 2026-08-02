// apps/web/src/modules/Gallery/components/GalleryFilterBar.test.tsx
// The feed's filter header. These tests pin the RESET affordance, because the bar
// has a specific way of trapping people: all three controls are dropdowns whose
// "any" option is easy to miss, so a narrowed feed can look empty for no visible
// reason. The escape hatch has to be one obvious click — and it must not sit there
// as dead furniture when nothing is filtered.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GalleryFilterBar } from './GalleryFilterBar'
import type { GalleryFilters } from './GalleryFilterBar'

const MODELS = [
  { id: 'flux-dev', name: 'Flux dev' },
  { id: 'seedance-2-0', name: 'Auteur' },
]

// The "nothing selected" shape the route starts from.
const EMPTY: GalleryFilters = { type: 'all', modelId: null, aspectRatio: null }

function renderBar(value: GalleryFilters, onChange = vi.fn()) {
  render(<GalleryFilterBar value={value} onChange={onChange} models={MODELS} />)
  return { onChange }
}

describe('GalleryFilterBar — reset', () => {
  it('offers no reset when nothing is filtered', () => {
    renderBar(EMPTY)
    // A permanently visible "clear" on an unfiltered feed is a control that does
    // nothing — it trains people to ignore it exactly when it starts mattering.
    expect(screen.queryByRole('button', { name: /сброс|clear|reset/i })).not.toBeInTheDocument()
  })

  it.each([
    ['type', { ...EMPTY, type: 'video' as const }],
    ['model', { ...EMPTY, modelId: 'flux-dev' }],
    ['aspect ratio', { ...EMPTY, aspectRatio: '9:16' as const }],
  ])('offers a reset once %s is filtered', (_label, value) => {
    // Each control independently — a bar that only noticed the type filter would
    // strand anyone who narrowed by model and saw an empty feed.
    renderBar(value)
    expect(screen.getByRole('button', { name: /сброс|clear|reset/i })).toBeInTheDocument()
  })

  it('clears EVERY filter at once, not just the last one touched', async () => {
    const user = userEvent.setup()
    const { onChange } = renderBar({ type: 'video', modelId: 'flux-dev', aspectRatio: '9:16' })

    await user.click(screen.getByRole('button', { name: /сброс|clear|reset/i }))

    // One call carrying the FULL empty shape — the bar's contract is "always the
    // complete next filter object, never a partial patch", and a reset that left
    // one dropdown set would be the most confusing possible outcome.
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(EMPTY)
  })
})
