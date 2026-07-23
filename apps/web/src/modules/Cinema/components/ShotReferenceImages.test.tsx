// apps/web/src/modules/Cinema/components/ShotReferenceImages.test.tsx
// Behavior of the shot's "attach ANY image" affordance — the fix for the owner's
// complaint that attaching only offered character tagging and no drop/paste.
// Load-bearing assertions:
//   * click / drop / paste ALL route a file through the shared readImageFile gate
//     and POST the resulting data URI;
//   * the attached refs render as a removable thumbnail grid (DELETE by id);
//   * the shared budget of 5 (entity tags + images) hides the add affordance;
//   * a server 400 and a client-side type/size reject both surface LOCALIZED copy,
//     never raw text — and a rejected file fires NO request;
//   * a model without referenceMode does NOT block attaching — it shows a calm
//     switch-to-Wan notice.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ShotReferenceImage } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { ShotReferenceImages } from './ShotReferenceImages'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

type RenderOptions = {
  references?: ShotReferenceImage[]
  entityRefCount?: number
  modelSupportsReferences?: boolean
}

function renderRefs(options: RenderOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ShotReferenceImages
        filmId="film1"
        shotId="shot1"
        references={options.references ?? []}
        entityRefCount={options.entityRefCount ?? 0}
        modelSupportsReferences={options.modelSupportsReferences ?? true}
      />
    </QueryClientProvider>,
  )
}

const pngFile = () => new File(['fake-bytes'], 'shot.png', { type: 'image/png' })

beforeEach(() => {
  apiMock.mockReset()
})

describe('ShotReferenceImages', () => {
  it('reads a picked image to a data URI and POSTs it', async () => {
    apiMock.mockResolvedValue({ referenceImages: [{ id: 'r1', path: '/media/r1.png' }] })
    renderRefs()

    await userEvent.upload(screen.getByLabelText(/attach image/i), pngFile())

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        '/api/films/film1/shots/shot1/references',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const [, init] = apiMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body)).dataUri).toMatch(/^data:image\//)
  })

  it('shows the just-attached ref as a thumbnail once it lands', () => {
    // The thumbnail source is the server /media path off the refetched shot —
    // never the client data URI (the parent re-renders with fresh references).
    renderRefs({ references: [{ id: 'r1', path: '/media/r1.png' }] })
    const thumb = screen.getByRole('img', { name: /reference image/i })
    expect(thumb).toHaveAttribute('src', '/media/r1.png')
  })

  it('removes an attached ref by id via DELETE', async () => {
    apiMock.mockResolvedValue({ referenceImages: [] })
    renderRefs({ references: [{ id: 'r1', path: '/media/r1.png' }] })

    await userEvent.click(screen.getByRole('button', { name: /remove reference image/i }))

    expect(apiMock).toHaveBeenCalledWith(
      '/api/films/film1/shots/shot1/references/r1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('hides the add affordance at the shared budget of 5 (tags + images together)', () => {
    // 3 tagged characters + 2 attached images = the cap of 5
    renderRefs({
      entityRefCount: 3,
      references: [
        { id: 'r1', path: '/media/r1.png' },
        { id: 'r2', path: '/media/r2.png' },
      ],
    })

    expect(screen.getByText('5 / 5')).toBeInTheDocument()
    expect(screen.queryByLabelText(/attach image/i)).toBeNull()
  })

  it('surfaces a localized notice when the server refuses the attach (400)', async () => {
    apiMock.mockRejectedValue(new ApiClientError('validation_failed', 'raw server text', 400))
    renderRefs()

    await userEvent.upload(screen.getByLabelText(/attach image/i), pngFile())

    const alert = await screen.findByRole('alert')
    // Localized copy, never the server's own words
    expect(alert).not.toHaveTextContent('raw server text')
  })

  it('rejects a non-image dropped onto the area through the shared gate, firing no request', async () => {
    // The <input accept="image/*"> filters a non-image before it is ever read,
    // so the honest reject vector is a DROP (or paste): readImageFile is the gate.
    renderRefs()

    const area = screen.getByRole('group', { name: /reference images/i })
    fireEvent.drop(area, {
      dataTransfer: { files: [new File(['not-an-image'], 'notes.txt', { type: 'text/plain' })] },
    })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('attaches a screenshot pasted onto the reference area', async () => {
    apiMock.mockResolvedValue({ referenceImages: [{ id: 'r1', path: '/media/r1.png' }] })
    renderRefs()

    const area = screen.getByRole('group', { name: /reference images/i })
    fireEvent.paste(area, { clipboardData: { files: [pngFile()] } })

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        '/api/films/film1/shots/shot1/references',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('lets you attach even when the model ignores references, with a calm switch-to-Wan notice', () => {
    renderRefs({ modelSupportsReferences: false })

    // Honest capability copy — NOT the character-centric "cannot hold a character"
    expect(screen.getByText(/wan 2\.7/i)).toBeInTheDocument()
    // …and it is NOT a hard block: the add affordance is still there
    expect(screen.getByLabelText(/attach image/i)).toBeInTheDocument()
  })

  it('renders each attached ref with its own remove control', () => {
    renderRefs({
      references: [
        { id: 'r1', path: '/media/r1.png' },
        { id: 'r2', path: '/media/r2.png' },
      ],
    })
    const removers = screen.getAllByRole('button', { name: /remove reference image/i })
    expect(removers).toHaveLength(2)
    // Both thumbnails present in the well grid
    const group = screen.getByRole('group', { name: /reference images/i })
    expect(within(group).getAllByRole('img')).toHaveLength(2)
  })
})
