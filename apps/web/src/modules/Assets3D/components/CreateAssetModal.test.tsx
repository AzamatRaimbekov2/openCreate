// apps/web/src/modules/Assets3D/components/CreateAssetModal.test.tsx
// Behavior of the create-asset form. Three things matter here and nothing else:
//   · a picked png becomes a `data:image/...;base64,` URI on the wire (the API
//     accepts data URIs only — a user URL would be an SSRF hole);
//   · an svg is REFUSED client-side with a localized message (stored-XSS: the
//     contract's dataUriImage regex excludes svg, and the user should learn that
//     here rather than from a 400);
//   · submitting POSTs title + conceptImage and navigates into the new wizard.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from 'shared/libs/apiClient'
import { CreateAssetModal } from './CreateAssetModal'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <CreateAssetModal isOpen onClose={() => {}} />,
  })
  const wizardStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/assets/$assetId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, wizardStub]),
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

describe('CreateAssetModal', () => {
  it('encodes the picked image as a data URI and submits it with the title', async () => {
    apiMock.mockResolvedValue({
      id: 'new-asset',
      title: 'Iron Captain',
      conceptImageUrl: '/media/x.png',
      createdAt: '2026-07-20T10:00:00.000Z',
    })
    renderModal()

    // RouterProvider paints on a microtask — the first query must be async
    await userEvent.type(await screen.findByLabelText(/title/i), 'Iron Captain')
    const file = new File(['fake-png-bytes'], 'concept.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText(/concept image/i), file)

    // The preview appearing is the proof the FileReader resolved
    await screen.findByAltText(/chosen concept image/i)
    await userEvent.click(screen.getByRole('button', { name: /create asset/i }))

    await waitFor(() => expect(apiMock).toHaveBeenCalled())
    const [path, init] = apiMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/assets3d')
    const body = JSON.parse(String(init.body)) as { title: string; conceptImage: string }
    expect(body.title).toBe('Iron Captain')
    expect(body.conceptImage).toMatch(/^data:image\/png;base64,/)
  })

  it('refuses an svg without calling the API', async () => {
    renderModal()

    // RouterProvider paints on a microtask — the first query must be async
    await userEvent.type(await screen.findByLabelText(/title/i), 'Iron Captain')
    const svg = new File(['<svg/>'], 'concept.svg', { type: 'image/svg+xml' })
    // applyAccept: false deliberately bypasses the input's `accept` filter — that
    // filter is the FIRST line of defence, but an OS "all files" override sails
    // straight past it, so what is under test here is the SECOND line: the
    // component's own type guard, which is the one that keeps an svg off the wire.
    await userEvent.upload(screen.getByLabelText(/concept image/i), svg, {
      applyAccept: false,
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(/png, jpeg or webp only/i)
    await userEvent.click(screen.getByRole('button', { name: /create asset/i }))
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('will not submit without a concept image', async () => {
    renderModal()
    // RouterProvider paints on a microtask — the first query must be async
    await userEvent.type(await screen.findByLabelText(/title/i), 'Iron Captain')
    await userEvent.click(screen.getByRole('button', { name: /create asset/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose a concept image/i)
    expect(apiMock).not.toHaveBeenCalled()
  })
})
