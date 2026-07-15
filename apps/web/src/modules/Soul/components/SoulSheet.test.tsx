// apps/web/src/modules/Soul/components/SoulSheet.test.tsx
// The paid surface. Three things must be true or the feature is a money bug:
//   1. the price is on the button BEFORE the click, and it is the RIGHT price for
//      the state the character is in (no photo → 2, photo → 8 per view);
//   2. no credit is spent on one click — the spend is confirmed;
//   3. a view that failed is SHOWN as failed (and refunded), never swallowed.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogModel, Entity, EntityImage, PortraitsResponse } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { SoulSheet } from './SoulSheet'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

const MODELS: CatalogModel[] = [
  {
    id: 'flux-dev',
    type: 'image',
    name: 'Studio',
    providerLabel: 'FLUX dev',
    air: 'runware:101@1',
    tier: 'quality',
    supportsImageInput: false,
    aspectRatios: ['1:1'],
    credits: 2,
  },
  {
    id: 'flux-kontext-pro',
    type: 'image',
    name: 'Cast',
    providerLabel: 'FLUX.1 Kontext pro',
    air: 'bfl:3@1',
    tier: 'plus',
    supportsImageInput: false,
    aspectRatios: ['1:1'],
    credits: 8,
    referenceMode: 'both',
  },
]

function makeImage(overrides: Partial<EntityImage>): EntityImage {
  return {
    id: 'img1',
    url: '/media/img1.png',
    source: 'generated',
    view: 'front',
    createdAt: '2026-07-12T10:00:00.000Z',
    ...overrides,
  }
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    kind: 'character',
    name: 'Аня',
    description: 'a woman',
    soul: { archetype: 'female', styleId: 'anime', traits: [], notes: '' },
    images: [],
    primaryImageId: null,
    createdAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
    ...overrides,
  }
}

function renderSheet(entity: Entity) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SoulSheet entity={entity} models={MODELS} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('SoulSheet', () => {
  it('prices the hero shot at 2 credits while the character has no photo', () => {
    renderSheet(makeEntity())
    expect(screen.getByRole('button', { name: /first portrait · 2 cr/i })).toBeEnabled()
  })

  it('prices the remaining three views at 8 credits each once a photo exists', () => {
    const entity = makeEntity({
      images: [makeImage({ id: 'a', view: 'front' })],
      primaryImageId: 'a',
    })
    renderSheet(entity)
    // 3 missing views × 8 = 24 — the self-referencing model, never the cheap one
    expect(screen.getByRole('button', { name: /complete the sheet · 24 cr/i })).toBeEnabled()
  })

  it('spends nothing on the first click — the price is confirmed first', async () => {
    const user = userEvent.setup()
    renderSheet(makeEntity())

    await user.click(screen.getByRole('button', { name: /first portrait · 2 cr/i }))
    expect(apiMock).not.toHaveBeenCalled()

    // The alertdialog states the cost, and only its confirm pill spends
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/2 cr/i)

    apiMock.mockResolvedValue({
      entity: makeEntity({
        images: [makeImage({ id: 'a', view: 'front' })],
        primaryImageId: 'a',
      }),
      portraits: [{ view: 'front', generationId: 'g1', errorCode: null }],
    } satisfies PortraitsResponse)

    await user.click(screen.getByRole('button', { name: /^confirm/i }))
    expect(apiMock).toHaveBeenCalledWith(
      '/api/entities/e1/portraits',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ views: ['front'] }) }),
    )
  })

  it('shows a failed view as failed and refunded, in our own words', async () => {
    const user = userEvent.setup()
    renderSheet(makeEntity())

    apiMock.mockResolvedValue({
      entity: makeEntity(),
      portraits: [{ view: 'front', generationId: null, errorCode: 'content_blocked' }],
    } satisfies PortraitsResponse)

    await user.click(screen.getByRole('button', { name: /first portrait · 2 cr/i }))
    await user.click(await screen.findByRole('button', { name: /^confirm/i }))

    // The localized primary reason (never the provider's raw text) + the refund
    expect(await screen.findByText(/safety filter/i)).toBeInTheDocument()
    expect(screen.getByText(/credits refunded/i)).toBeInTheDocument()
  })

  it('renders the four views in sheet order, hero first', () => {
    renderSheet(makeEntity())
    const captions = screen.getAllByTestId('sheet-view-label').map((node) => node.textContent)
    expect(captions).toEqual(['Анфас', 'Три четверти', 'Профиль', 'В полный рост'])
  })
})
