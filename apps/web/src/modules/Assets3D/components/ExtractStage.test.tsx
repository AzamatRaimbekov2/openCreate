// apps/web/src/modules/Assets3D/components/ExtractStage.test.tsx
// A paid grid. Three things must hold or this is a money bug:
//   1. the price is on the button BEFORE the click, read off the live catalog —
//      and an absent catalog DISABLES the button instead of guessing a number;
//   2. the BATCH spends nothing on one click: the alertdialog restates the total
//      and only its confirm pill calls the API (owner decision 2026-07-20 keeps
//      the SINGLE-part extract click-to-spend — it is the cheap, high-repetition
//      step, and a dialog per part would make the grid unusable);
//   3. a part whose extraction failed is SHOWN as failed and refunded, in our own
//      words, without taking its siblings down with it.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Asset3dPart, CatalogModel, Generation, PartStatus } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { ExtractStage } from './ExtractStage'
import { useWizardStore } from '../model/wizardStore'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

const MODELS: CatalogModel[] = [
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

function makePart(id: string, name: string, status: PartStatus): Asset3dPart {
  return {
    id,
    assetId: 'a1',
    name,
    description: '',
    sortOrder: 0,
    imageGenerationId: status === 'draft' ? null : `img-${id}`,
    meshGenerationId: null,
    transform: null,
    status,
    createdAt: '2026-07-20T10:00:00.000Z',
  }
}

function makeGeneration(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'img-p1',
    type: 'image',
    mode: 'image',
    status: 'succeeded',
    prompt: 'helmet, isolated',
    modelId: 'flux-kontext-pro',
    params: { aspectRatio: '1:1' },
    costCredits: 8,
    mediaUrls: ['/media/part1.png'],
    errorMessage: null,
    errorCode: null,
    createdAt: '2026-07-20T10:00:00.000Z',
    completedAt: '2026-07-20T10:00:05.000Z',
    ...overrides,
  }
}

// The cited generations the cards poll, keyed by id; anything else is a mutation.
function routeApi(generations: Record<string, Generation>) {
  apiMock.mockImplementation((path: string) => {
    const match = /^\/api\/generations\/(.+)$/.exec(path)
    const generation = match ? generations[match[1] ?? ''] : undefined
    if (generation) return Promise.resolve(generation) as never
    return Promise.resolve({}) as never
  })
}

function renderStage(parts: Asset3dPart[], models: CatalogModel[] = MODELS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ExtractStage assetId="a1" parts={parts} models={models} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
  useWizardStore.getState().reset()
})

describe('ExtractStage', () => {
  it('sends the user back to Parts when there is nothing to extract', () => {
    routeApi({})
    renderStage([])
    expect(screen.getByRole('heading', { name: /nothing to extract/i })).toBeInTheDocument()
  })

  it('prints the per-part price on the button before the click', () => {
    routeApi({})
    renderStage([makePart('p1', 'Helmet', 'draft')])
    expect(screen.getByRole('button', { name: /extract · 8 cr/i })).toBeEnabled()
  })

  it('disables the paid buttons while the catalog cannot price them', () => {
    routeApi({})
    renderStage([makePart('p1', 'Helmet', 'draft')], [])
    // The price pulse is aria-hidden, so the unpriced per-part button's
    // accessible name is the bare "Extract ·" — and both it and the batch are off
    expect(screen.getByRole('button', { name: /^extract ·/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /extract all/i })).toBeDisabled()
  })

  it('extracts a single part on the click — the cheap step is not gated', async () => {
    const user = userEvent.setup()
    routeApi({})
    renderStage([makePart('p1', 'Helmet', 'draft')])

    await user.click(screen.getByRole('button', { name: /extract · 8 cr/i }))

    expect(apiMock).toHaveBeenCalledWith('/api/assets3d/a1/parts/p1/extract', { method: 'POST' })
  })

  it('spends nothing when the batch is clicked — the total is confirmed first', async () => {
    const user = userEvent.setup()
    routeApi({})
    renderStage([makePart('p1', 'Helmet', 'draft'), makePart('p2', 'Pauldron', 'draft')])

    await user.click(screen.getByRole('button', { name: /extract all/i }))

    // Not one credit has moved yet
    expect(apiMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/extract'),
      expect.anything(),
    )

    // The dialog restates the number it is about to charge: 2 parts × 8
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/16 credits/i)

    await user.click(within(dialog).getByRole('button', { name: /extract · 16 cr/i }))

    expect(apiMock).toHaveBeenCalledWith('/api/assets3d/a1/parts/p1/extract', { method: 'POST' })
    expect(apiMock).toHaveBeenCalledWith('/api/assets3d/a1/parts/p2/extract', { method: 'POST' })
  })

  it('closes the spend dialog before the money moves', async () => {
    const user = userEvent.setup()
    routeApi({})
    renderStage([makePart('p1', 'Helmet', 'draft')])

    await user.click(screen.getByRole('button', { name: /extract all/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /extract · 8 cr/i }))

    // The interesting thing to watch is the grid filling in, not a spinner on a
    // dialog the user has already answered
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('shows a failed part as failed and refunded without hiding its siblings', async () => {
    routeApi({
      'img-p1': makeGeneration({
        id: 'img-p1',
        status: 'failed',
        mediaUrls: [],
        errorCode: 'content_blocked',
      }),
      'img-p2': makeGeneration({ id: 'img-p2', mediaUrls: ['/media/part2.png'] }),
    })
    renderStage([makePart('p1', 'Helmet', 'extracted'), makePart('p2', 'Pauldron', 'extracted')])

    // Our localized reason, never the provider's raw words
    expect(await screen.findByText(/safety filter/i)).toBeInTheDocument()
    expect(screen.getByText(/credits refunded/i)).toBeInTheDocument()
    // The sibling still rendered its extraction
    expect(await screen.findByAltText(/extraction of pauldron/i)).toBeInTheDocument()
  })

  it('offers the way forward once every part is extracted', async () => {
    routeApi({ 'img-p1': makeGeneration({ id: 'img-p1' }) })
    renderStage([makePart('p1', 'Helmet', 'extracted')])
    expect(await screen.findByRole('button', { name: /go to meshes/i })).toBeEnabled()
  })
})
