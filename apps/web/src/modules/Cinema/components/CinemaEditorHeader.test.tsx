// apps/web/src/modules/Cinema/components/CinemaEditorHeader.test.tsx
// The editor top bar's contract (2026-07-23): the film's controls are VISIBLE
// affordances, not a title beside a ⋯ that hid the export. These pin the four
// behaviours the owner asked to surface — inline rename, aspect switch, the
// export button, delete-behind-a-confirm — plus the injected chrome slot and the
// loading state. Behaviour-first: queried by role/name, never by class.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { Film } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { CinemaEditorHeader } from './CinemaEditorHeader'
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
    createdAt: '2026-07-09T10:00:00.000Z',
    updatedAt: '2026-07-09T10:00:00.000Z',
    ...overrides,
  }
}

type HeaderProps = {
  film: Film | undefined
  onExport?: () => void
  canExport?: boolean
  isStarting?: boolean
  shotCount?: number
  durationMs?: number
  chrome?: ReactNode
}

// The bar + a /cinema stub (back link + post-delete navigate) so every Link the
// header renders resolves. Async because TanStack Router paints the matched route
// on mount (a tick after render) — we await the always-present export button so
// tests can then query synchronously.
async function renderHeader({
  film,
  onExport = () => {},
  canExport = true,
  isStarting = false,
  shotCount,
  durationMs,
  chrome,
}: HeaderProps) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <CinemaEditorHeader
        film={film}
        onExport={onExport}
        canExport={canExport}
        isStarting={isStarting}
        shotCount={shotCount}
        durationMs={durationMs}
        chrome={chrome}
      />
    ),
  })
  const libraryStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cinema',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, libraryStub]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await screen.findByRole('button', { name: /mp4/i })
  return result
}

beforeEach(() => {
  apiMock.mockReset()
  apiMock.mockResolvedValue(makeFilm())
})

describe('CinemaEditorHeader', () => {
  it('renames the film inline — no modal', async () => {
    const user = userEvent.setup()
    await renderHeader({ film: makeFilm() })

    // The title is a button (its aria-label carries the field name + value)
    await user.click(screen.getByRole('button', { name: /film title: Neon Drift/i }))
    const input = screen.getByRole('textbox', { name: /film title/i })
    await user.clear(input)
    await user.type(input, 'Renamed')
    await user.keyboard('{Enter}')

    expect(apiMock).toHaveBeenCalledWith('/api/films/film1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Renamed' }),
    })
  })

  it('does NOT PATCH when an inline edit is cancelled with Escape', async () => {
    const user = userEvent.setup()
    await renderHeader({ film: makeFilm() })

    await user.click(screen.getByRole('button', { name: /film title: Neon Drift/i }))
    const input = screen.getByRole('textbox', { name: /film title/i })
    await user.clear(input)
    await user.type(input, 'Discarded')
    await user.keyboard('{Escape}')

    expect(apiMock).not.toHaveBeenCalled()
    // The button label is back — the field closed without committing
    expect(screen.getByRole('button', { name: /film title: Neon Drift/i })).toBeInTheDocument()
  })

  it('switches the canvas aspect ratio from the chip-dropdown', async () => {
    const user = userEvent.setup()
    await renderHeader({ film: makeFilm({ aspectRatio: '16:9' }) })

    // Aspect is a dropdown chip (not permanent toggles): open it, pick another
    await user.click(screen.getByRole('button', { name: /aspect ratio|соотношение/i }))
    await user.click(screen.getByRole('menuitem', { name: '9:16' }))

    expect(apiMock).toHaveBeenCalledWith('/api/films/film1', {
      method: 'PATCH',
      body: JSON.stringify({ aspectRatio: '9:16' }),
    })
  })

  it('shows the film META — shot count and duration', async () => {
    // 4 shots · 20s total → "4 shots" + "0:20" (formatTimecode)
    await renderHeader({ film: makeFilm(), shotCount: 4, durationMs: 20_000 })

    expect(screen.getByText(/4 shots|4 кадра/i)).toBeInTheDocument()
    expect(screen.getByText('0:20')).toBeInTheDocument()
  })

  it('fires onExport from the visible export button', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    await renderHeader({ film: makeFilm(), onExport, canExport: true })

    await user.click(screen.getByRole('button', { name: /mp4/i }))
    expect(onExport).toHaveBeenCalledOnce()
  })

  it('disables export when it cannot run', async () => {
    await renderHeader({ film: makeFilm(), canExport: false })
    expect(screen.getByRole('button', { name: /mp4/i })).toBeDisabled()
  })

  it('deletes the film only after the destructive confirm (§9)', async () => {
    const user = userEvent.setup()
    await renderHeader({ film: makeFilm() })

    // Open the ⋯ overflow (queried by its distinctive "actions" name so it never
    // collides with the "Film title" button)
    await user.click(screen.getByRole('button', { name: /actions|действия/i }))
    await user.click(screen.getByRole('menuitem', { name: /delete film|удалить фильм/i }))

    // Opening the menu must not have deleted anything yet
    expect(apiMock).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /^delete$|^удалить$/i }))

    expect(apiMock).toHaveBeenCalledWith('/api/films/film1', { method: 'DELETE' })
  })

  it('renders the injected chrome slot (balance · lang · account)', async () => {
    await renderHeader({ film: makeFilm(), chrome: <span>CHROME-SLOT</span> })
    expect(screen.getByText('CHROME-SLOT')).toBeInTheDocument()
  })

  it('shows a title skeleton and no film controls while the film loads', async () => {
    await renderHeader({ film: undefined, canExport: false })
    // No title button, no ⋯ menu, and export disabled — the bar keeps its shape
    expect(screen.queryByRole('button', { name: /film title/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /actions|действия/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mp4/i })).toBeDisabled()
  })
})
