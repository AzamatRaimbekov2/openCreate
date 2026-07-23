// apps/web/src/modules/Assets3D/components/PartsStage.test.tsx
// The FREE stage. What must be true here is mostly about what does NOT happen:
//   1. analysis costs nothing and is therefore NOT confirmed — one click, one call;
//   2. when analysis is not configured the stage does not break — it says so and
//      the manual checklist keeps working (the wizard must survive a missing key);
//   3. the manual CRUD really talks to the part routes;
//   4. MAX_PARTS caps the add affordance rather than letting the user queue a
//      thirteenth part the server will reject;
//   5. the extraction price is printed BEFORE the user walks into the paid stage.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAX_PARTS } from '@opencreate/contracts'
import type { Asset3dPart, CatalogModel } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { PartsStage } from './PartsStage'
import { useWizardStore } from '../model/wizardStore'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

// The reference-capable image model: the one the server's extraction rule picks,
// so its 8 credits are the number the stage must print.
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

function makePart(id: string, name: string): Asset3dPart {
  return {
    id,
    assetId: 'a1',
    name,
    description: '',
    sortOrder: 0,
    imageGenerationId: null,
    meshGenerationId: null,
    transform: null,
    status: 'draft',
    createdAt: '2026-07-20T10:00:00.000Z',
  }
}

function renderStage(parts: Asset3dPart[], models: CatalogModel[] = MODELS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PartsStage assetId="a1" parts={parts} models={models} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
  useWizardStore.getState().reset()
})

describe('PartsStage', () => {
  it('explains itself when the asset has no parts yet', () => {
    renderStage([])
    expect(screen.getByRole('heading', { name: /no parts yet/i })).toBeInTheDocument()
  })

  it('analyses for free — one click, no confirm dialog', async () => {
    const user = userEvent.setup()
    apiMock.mockResolvedValue({ items: [makePart('p1', 'Helmet')] })
    renderStage([])

    await user.click(screen.getByRole('button', { name: /suggest parts/i }))

    // Free means free: the money dialog never appears and the call already went out
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(apiMock).toHaveBeenCalledWith('/api/assets3d/a1/analyze', { method: 'POST' })
  })

  it('keeps the checklist usable when analysis is not configured', async () => {
    const user = userEvent.setup()
    apiMock.mockRejectedValue(new ApiClientError('provider_error', 'no key', 500))
    renderStage([makePart('p1', 'Helmet')])

    await user.click(screen.getByRole('button', { name: /suggest/i }))

    expect(await screen.findByText(/automatic analysis is not configured/i)).toBeInTheDocument()
    // The manual path is the point of the notice — it must still be there
    expect(screen.getByLabelText(/part name/i)).toBeEnabled()
  })

  it('adds a part by hand', async () => {
    const user = userEvent.setup()
    apiMock.mockResolvedValue(makePart('p2', 'Left pauldron'))
    renderStage([makePart('p1', 'Helmet')])

    await user.type(screen.getByLabelText(/part name/i), 'Left pauldron')
    await user.click(screen.getByRole('button', { name: /add part/i }))

    expect(apiMock).toHaveBeenCalledWith('/api/assets3d/a1/parts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Left pauldron' }),
    })
  })

  it('renames a part through the row editor', async () => {
    const user = userEvent.setup()
    apiMock.mockResolvedValue(makePart('p1', 'Visor'))
    renderStage([makePart('p1', 'Helmet')])

    await user.click(screen.getByRole('button', { name: /edit helmet/i }))
    const field = screen.getByDisplayValue('Helmet')
    await user.clear(field)
    await user.type(field, 'Visor')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(apiMock).toHaveBeenCalledWith(
      '/api/assets3d/a1/parts/p1',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('removes a part', async () => {
    const user = userEvent.setup()
    apiMock.mockResolvedValue(undefined)
    renderStage([makePart('p1', 'Helmet')])

    await user.click(screen.getByRole('button', { name: /remove helmet/i }))

    expect(apiMock).toHaveBeenCalledWith('/api/assets3d/a1/parts/p1', { method: 'DELETE' })
  })

  it('caps the add affordance at MAX_PARTS', () => {
    const parts = Array.from({ length: MAX_PARTS }, (_, index) =>
      makePart(`p${index}`, `Part ${index}`),
    )
    renderStage(parts)

    expect(screen.getByRole('button', { name: /add part/i })).toBeDisabled()
    expect(screen.getByText(/twelve parts is the ceiling/i)).toBeInTheDocument()
  })

  it('prints the extraction price before the user walks into the paid stage', () => {
    renderStage([makePart('p1', 'Helmet')])
    expect(screen.getByText(/8 cr/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go to extraction/i })).toBeEnabled()
  })

  it('never quotes a price it cannot back', () => {
    const { container } = renderStage([makePart('p1', 'Helmet')], [])
    // A pulse where the number would be — and no invented "0 cr"
    expect(container.querySelectorAll('.animate-skeleton').length).toBeGreaterThan(0)
    expect(screen.queryByText(/0 cr/i)).not.toBeInTheDocument()
  })
})
