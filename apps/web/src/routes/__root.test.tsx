// apps/web/src/routes/__root.test.tsx
// Smoke tests for the root route: the generated route tree renders the landing
// route inside the root providers, and unknown paths land on the custom 404
// (notFoundComponent wiring — frontend-error-ux contract).
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'

// The landing route reads the session (CTA destination). Mock the whole Auth
// module so the smoke test never touches better-auth's network client —
// deterministic signed-out state, no fetch attempts in jsdom.
vi.mock('modules/Auth', () => ({
  useAuthSession: () => ({ data: null, isPending: false, error: null }),
  useMe: vi.fn(),
  requireSession: vi.fn(),
  signOut: vi.fn(),
  AuthForm: () => null,
}))

// Fresh router per test — memory history, no browser URL
function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
}

describe('root route', () => {
  it('renders the landing headline at /', async () => {
    renderAt('/')
    // Headline comes from the EN locale (i18n is wired in the root route)
    expect(
      await screen.findByRole('heading', { name: /create images & video/i }),
    ).toBeInTheDocument()
  })

  it('renders the custom 404 with a home link for unknown routes', async () => {
    renderAt('/definitely-not-a-route')
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to home page/i })).toHaveAttribute('href', '/')
  })
})
