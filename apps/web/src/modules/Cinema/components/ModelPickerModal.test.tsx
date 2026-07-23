// apps/web/src/modules/Cinema/components/ModelPickerModal.test.tsx
// Behavior of the model picker (card gallery, 2026-07-17): a card per model in
// a grid, each carrying a looping demo video slot over a branded plate; a card
// click COMMITS the model and CLOSES the dialog (it is a question, not a
// workspace); the chosen card is marked pressed.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogVideoModel } from '@opencreate/contracts'
import { ModelPickerModal } from './ModelPickerModal'
import 'shared/config/i18n'

function makeModel(overrides: Partial<CatalogVideoModel>): CatalogVideoModel {
  return {
    id: 'wan-2-7',
    name: 'Cinema',
    providerLabel: 'Wan 2.7 · Alibaba',
    air: 'alibaba:wan2.7',
    tier: 'plus',
    type: 'video',
    supportsImageInput: true,
    aspectRatios: ['16:9'],
    durationOptions: [5, 8],
    creditsByDuration: { '5': 85, '8': 135 },
    ...overrides,
  }
}

const models = [
  makeModel({}),
  makeModel({
    id: 'kling-3-pro',
    name: 'Director',
    providerLabel: 'Kling 3.0 Pro',
    tier: 'pro',
    durationOptions: [5, 10],
    creditsByDuration: { '5': 80, '10': 160 },
  }),
  makeModel({
    id: 'veo-3-1-fast',
    name: 'Premiere',
    providerLabel: 'Veo 3.1 Fast',
    tier: 'premium',
    durationOptions: [8],
    creditsByDuration: { '8': 140 },
  }),
]

describe('ModelPickerModal', () => {
  it('renders a CARD per model: name, honest provider, base tariff', () => {
    render(
      <ModelPickerModal isOpen onClose={vi.fn()} models={models} value="wan-2-7" onChange={vi.fn()} />,
    )
    const cards = screen.getAllByRole('button', { name: /cinema|director|premiere/i })
    expect(cards).toHaveLength(3)
    expect(screen.getByText('Wan 2.7 · Alibaba')).toBeInTheDocument()
    // Base tariff = the FIRST duration's price (85 for wan, 140 for veo)
    expect(screen.getByText(/85/)).toBeInTheDocument()
    expect(screen.getByText(/140/)).toBeInTheDocument()
  })

  it('each card carries a looping muted demo video slot at /model-demos/<id>.mp4', () => {
    render(
      <ModelPickerModal isOpen onClose={vi.fn()} models={models} value="wan-2-7" onChange={vi.fn()} />,
    )
    // The Modal portals its sheet to document.body — query the document, not
    // the render container
    const sources = [...document.body.querySelectorAll('video')].map((v) => v.getAttribute('src'))
    expect(sources).toContain('/model-demos/wan-2-7.mp4')
    expect(sources).toContain('/model-demos/kling-3-pro.mp4')
    expect(sources).toContain('/model-demos/veo-3-1-fast.mp4')
  })

  it('marks the chosen card pressed; clicking another commits AND closes', async () => {
    const onChange = vi.fn()
    const onClose = vi.fn()
    render(
      <ModelPickerModal isOpen onClose={onClose} models={models} value="wan-2-7" onChange={onChange} />,
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /cinema/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: /director/i }))
    expect(onChange).toHaveBeenCalledWith('kling-3-pro')
    expect(onClose).toHaveBeenCalled()
  })
})
