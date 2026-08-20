// apps/web/src/modules/Cinema/components/FilmSettingsModal.test.tsx
// The two modes have DIVERGED (owner request 2026-07-31) and that divergence is
// what these pin. Creating a film is now just "name it, optionally pick a
// picture": the aspect pills and the default-style select are gone from create
// entirely, because neither is a decision anyone can make well before the film
// exists — the aspect is implied by the first shots and the style is picked per
// shot. Both still live in EDIT, where the film is real and the answers are
// informed.
//
// The cover rides the CREATE body as bytes rather than a follow-up upload, so
// "name it and pick a picture" is one request that cannot half-succeed (contracts
// film.ts). Until submit the picked image is LOCAL state — nothing is uploaded
// while the user is still deciding.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Film } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { FilmSettingsModal } from './FilmSettingsModal'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function makeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: 'film1',
    title: 'Neon Drift',
    aspectRatio: '16:9',
    defaultStyleId: null,
    templateId: null,
    batchId: null,
    coverUrl: null,
    createdAt: '2026-07-09T10:00:00.000Z',
    updatedAt: '2026-07-09T10:00:00.000Z',
    ...overrides,
  }
}

const pngFile = () => new File(['bytes'], 'cover.png', { type: 'image/png' })

// A tiny real router: the modal navigates into the new film's editor on create.
function renderModal(film: Film | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <FilmSettingsModal film={film} isOpen onClose={() => {}} />,
  })
  const editorStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cinema/$filmId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, editorStub]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('create mode', () => {
  it('asks for a name and a cover — nothing else', async () => {
    renderModal(null)
    await screen.findByRole('textbox', { name: /^title$/i })

    // The two decisions that moved out: neither can be made well before the film
    // exists, so create no longer poses them at all.
    expect(screen.queryByText(/aspect ratio/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /default style/i })).not.toBeInTheDocument()
    // What remains
    expect(screen.getByRole('group', { name: /cover/i })).toBeInTheDocument()
  })

  it('creates with the title alone when no cover was picked', async () => {
    apiMock.mockResolvedValue(makeFilm())
    renderModal(null)

    await userEvent.type(await screen.findByRole('textbox', { name: /^title$/i }), 'Neon Drift')
    await userEvent.click(screen.getByRole('button', { name: /create film/i }))

    // Exactly {title}: the server owns the aspect default, so sending one here
    // would be a second opinion about the same field.
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/api/films', {
        method: 'POST',
        body: JSON.stringify({ title: 'Neon Drift' }),
      }),
    )
  })

  it('carries the picked cover as bytes on the SAME create request', async () => {
    apiMock.mockResolvedValue(makeFilm())
    renderModal(null)

    await userEvent.type(await screen.findByRole('textbox', { name: /^title$/i }), 'Neon Drift')
    await userEvent.upload(screen.getByLabelText(/add cover/i), pngFile())
    // Nothing is uploaded while the user is still deciding
    expect(apiMock).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /create film/i }))

    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1))
    const body = String(apiMock.mock.calls[0]?.[1]?.body)
    expect(body).toContain('"title":"Neon Drift"')
    expect(body).toContain('"coverDataUri":"data:image/png;base64,')
  })

  it('lets the cover be removed before submitting', async () => {
    apiMock.mockResolvedValue(makeFilm())
    renderModal(null)

    await userEvent.type(await screen.findByRole('textbox', { name: /^title$/i }), 'Neon Drift')
    await userEvent.upload(screen.getByLabelText(/add cover/i), pngFile())
    await screen.findByRole('img', { name: /cover/i })

    await userEvent.click(screen.getByRole('button', { name: /remove cover/i }))
    await userEvent.click(screen.getByRole('button', { name: /create film/i }))

    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1))
    expect(String(apiMock.mock.calls[0]?.[1]?.body)).not.toContain('coverDataUri')
  })

  it('refuses a non-image locally, with localized copy and no request', async () => {
    renderModal(null)
    await screen.findByRole('textbox', { name: /^title$/i })

    // <input accept="image/*"> filters a non-image before it is read, so the
    // honest reject vector is a DROP (the ShotReferenceImages precedent).
    fireEvent.drop(screen.getByRole('group', { name: /cover/i }), {
      dataTransfer: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(apiMock).not.toHaveBeenCalled()
  })
})

describe('edit mode', () => {
  it('still offers aspect and default style on a real film', async () => {
    renderModal(makeFilm())
    await screen.findByRole('textbox', { name: /^title$/i })

    expect(screen.getByText(/aspect ratio/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /default style/i })).toBeInTheDocument()
  })

  it('shows the film’s current cover', async () => {
    renderModal(makeFilm({ coverUrl: '/media/cover.png' }))

    const thumb = await screen.findByRole('img', { name: /cover/i })
    expect(thumb).toHaveAttribute('src', '/media/cover.png')
  })

  // THE PARTIAL TRAP, and the single most important assertion in this file.
  // `coverDataUri` is three-valued on the wire: bytes replace, null REMOVES, and
  // an absent key means "leave it alone". So a PATCH that carries an explicit
  // null for an untouched cover would silently wipe the picture of every film
  // anyone renames. The key must be absent unless the user touched the image.
  it('omits coverDataUri entirely when only the title was edited', async () => {
    apiMock.mockResolvedValue(makeFilm({ title: 'Renamed' }))
    renderModal(makeFilm({ coverUrl: '/media/cover.png' }))

    const title = await screen.findByRole('textbox', { name: /^title$/i })
    await userEvent.clear(title)
    await userEvent.type(title, 'Renamed')
    await userEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1))
    const body = String(apiMock.mock.calls[0]?.[1]?.body)
    expect(body).toContain('"title":"Renamed"')
    expect(body).not.toContain('coverDataUri')
  })

  it('sends the new bytes when the cover is replaced', async () => {
    apiMock.mockResolvedValue(makeFilm())
    renderModal(makeFilm({ coverUrl: '/media/cover.png' }))
    await screen.findByRole('textbox', { name: /^title$/i })

    await userEvent.upload(screen.getByLabelText(/replace cover/i), pngFile())
    await userEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1))
    expect(String(apiMock.mock.calls[0]?.[1]?.body)).toContain(
      '"coverDataUri":"data:image/png;base64,',
    )
  })

  it('sends an explicit null when the cover is removed', async () => {
    apiMock.mockResolvedValue(makeFilm({ coverUrl: null }))
    renderModal(makeFilm({ coverUrl: '/media/cover.png' }))
    await screen.findByRole('textbox', { name: /^title$/i })

    await userEvent.click(screen.getByRole('button', { name: /remove cover/i }))
    await userEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1))
    // null, not absent — this is the one case that MEANS "delete it"
    expect(String(apiMock.mock.calls[0]?.[1]?.body)).toContain('"coverDataUri":null')
  })

  it('refuses a non-image locally, with no request', async () => {
    renderModal(makeFilm({ coverUrl: null }))
    await screen.findByRole('textbox', { name: /^title$/i })

    fireEvent.drop(screen.getByRole('group', { name: /cover/i }), {
      dataTransfer: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(apiMock).not.toHaveBeenCalled()
  })
})
