// apps/web/src/modules/Cinema/components/ShotReferenceImages.test.tsx
// Behavior of the shot's "attach ANY image" affordance — the fix for the owner's
// complaint that attaching only offered character tagging and no drop/paste.
// Load-bearing assertions:
//   * click / drop / paste ALL route a file through the shared readImageFile gate
//     and POST the resulting data URI;
//   * the attached refs render as a removable thumbnail grid (DELETE by id);
//   * the shared budget of 5 (entity tags + images) hides the add affordance;
//   * a server 400 and a client-side type/size reject both surface LOCALIZED copy,
//     never raw text — and a rejected file fires NO request.
// NOTE: there is NO model-gating copy any more (owner request 2026-07-24) — the
// component never tells the user a model "doesn't use reference images".
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
  onCharacterCreated?: (entityId: string) => void
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
        onCharacterCreated={options.onCharacterCreated ?? vi.fn()}
      />
    </QueryClientProvider>,
  )
}

const pngFile = () => new File(['fake-bytes'], 'shot.png', { type: 'image/png' })

// A minimal succeeded IMAGE generation — the picker's select() reads only
// id/type/status/mediaUrls, so we mock exactly those (the api mock is untyped).
const imageGeneration = (id: string, url: string) => ({
  id,
  type: 'image',
  status: 'succeeded',
  mediaUrls: [url],
})

beforeEach(() => {
  apiMock.mockReset()
})

afterEach(() => {
  // The gallery-pick test stubs global fetch — never let it leak to a sibling
  vi.unstubAllGlobals()
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

  it('never shows model-gating copy — attaching is always offered, no switch-to-Wan nag', () => {
    // Owner request 2026-07-24: the "this model doesn't use reference images —
    // switch to Wan" line is GONE. The add affordance is always present; the
    // component says nothing about the model's capability.
    renderRefs()

    expect(screen.queryByText(/wan 2\.7/i)).toBeNull()
    expect(screen.queryByText(/switch to|use reference images/i)).toBeNull()
    expect(screen.getByLabelText(/attach image/i)).toBeInTheDocument()
  })

  it('attaches an image picked from the gallery as a data URI POST', async () => {
    // Two channels through the one api mock: the gallery LIST (GET) and the
    // reference ATTACH (POST). Branch on the path so both resolve in one test.
    apiMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/generations')) {
        return Promise.resolve({ items: [imageGeneration('g1', '/media/g1.png')], nextCursor: null })
      }
      return Promise.resolve({ referenceImages: [{ id: 'r1', path: '/media/r1.png' }] })
    })
    // The pick fetches the /media bytes → blob → data URI. Stub fetch to hand
    // back a small PNG blob (jsdom's FileReader reads its type into the URI).
    const blob = new Blob(['png-bytes'], { type: 'image/png' })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }),
    )
    renderRefs()

    // Open the picker, wait for the thumbnail, pick it.
    await userEvent.click(screen.getByRole('button', { name: /attach from gallery/i }))
    await userEvent.click(await screen.findByRole('button', { name: /attach this image/i }))

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        '/api/films/film1/shots/shot1/references',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const postCall = apiMock.mock.calls.find(
      ([path]) => path === '/api/films/film1/shots/shot1/references',
    )
    expect(JSON.parse(String(postCall?.[1]?.body)).dataUri).toMatch(/^data:image\//)
  })

  it('turns an attached reference into a named character and auto-tags it', async () => {
    const onCharacterCreated = vi.fn()
    // Three channels through the one api mock, branched by path + method: the
    // character SHELL (POST /entities), its reference PHOTO (POST /entities/:id/
    // images), and the raw ref DELETE (so the image is never sent twice).
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/entities' && init?.method === 'POST') {
        return Promise.resolve({ id: 'e1', kind: 'character', name: 'Fox', primaryImageId: null })
      }
      if (path === '/api/entities/e1/images' && init?.method === 'POST') {
        return Promise.resolve({ id: 'e1', kind: 'character', name: 'Fox', primaryImageId: 'img1' })
      }
      return Promise.resolve({ referenceImages: [] })
    })
    // The create fetches the /media bytes → blob → data URI (jsdom's FileReader
    // reads the blob's type into the URI).
    const blob = new Blob(['png-bytes'], { type: 'image/png' })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }),
    )
    renderRefs({ references: [{ id: 'r1', path: '/media/r1.png' }], onCharacterCreated })

    await userEvent.click(screen.getByRole('button', { name: /make character/i }))
    await userEvent.type(screen.getByLabelText(/character name/i), 'Fox')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    // 1. The character shell is created with kind=character and the typed name.
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        '/api/entities',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const createCall = apiMock.mock.calls.find(
      ([path, init]) => path === '/api/entities' && (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(JSON.parse(String((createCall?.[1] as RequestInit).body))).toMatchObject({
      kind: 'character',
      name: 'Fox',
    })

    // 2. Its reference photo is attached as an upload data URI.
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        '/api/entities/e1/images',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const imageCall = apiMock.mock.calls.find(([path]) => path === '/api/entities/e1/images')
    expect(JSON.parse(String((imageCall?.[1] as RequestInit).body)).dataUri).toMatch(/^data:image\//)

    // 3. The raw shot ref is removed and the new character is handed back to be
    //    @-mentioned in the prompt.
    await waitFor(() => expect(onCharacterCreated).toHaveBeenCalledWith('e1'))
    expect(apiMock).toHaveBeenCalledWith(
      '/api/films/film1/shots/shot1/references/r1',
      expect.objectContaining({ method: 'DELETE' }),
    )
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
