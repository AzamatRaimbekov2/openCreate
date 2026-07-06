// apps/web/src/modules/Landing/components/ModelCreditTable.test.tsx
// Behavior: the per-model credit table shows every catalog model with its
// honest provider label, localized type, credits (flat for images, per
// duration for videos) and the ≈ USD conversion at $0.01/credit.
import { render, screen } from '@testing-library/react'
import type { CatalogModel } from '@opencreate/contracts'
import { ModelCreditTable } from './ModelCreditTable'
// i18n init side effect — the table renders localized copy (EN default)
import 'shared/config/i18n'

const models: CatalogModel[] = [
  {
    id: 'flux-schnell',
    type: 'image',
    name: 'Flash',
    providerLabel: 'FLUX schnell',
    air: 'runware:100@1',
    tier: 'fast',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 1,
  },
  {
    id: 'pixverse-v6',
    type: 'video',
    name: 'Swift',
    providerLabel: 'PixVerse V6',
    air: 'pixverse:1@8',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 8],
    creditsByDuration: { '5': 35, '8': 56 },
  },
]

describe('ModelCreditTable', () => {
  it('renders a labelled table with product and provider names', () => {
    render(<ModelCreditTable models={models} />)
    expect(screen.getByRole('table', { name: /credits per model/i })).toBeInTheDocument()
    expect(screen.getByText('Flash')).toBeInTheDocument()
    expect(screen.getByText('FLUX schnell')).toBeInTheDocument()
    expect(screen.getByText('Swift')).toBeInTheDocument()
    expect(screen.getByText('PixVerse V6')).toBeInTheDocument()
  })

  it('shows flat credits and USD for image models', () => {
    render(<ModelCreditTable models={models} />)
    expect(screen.getByText(/1 · per image/i)).toBeInTheDocument()
    expect(screen.getByText('$0.01')).toBeInTheDocument()
  })

  it('shows per-duration credits and a from-USD price for video models', () => {
    render(<ModelCreditTable models={models} />)
    expect(screen.getByText(/5s — 35 · 8s — 56/i)).toBeInTheDocument()
    expect(screen.getByText(/from \$0\.35/i)).toBeInTheDocument()
  })
})
