// apps/web/src/routes/__root.test.tsx
// Smoke tests for the root route: the generated route tree renders the landing
// route inside the root providers, and unknown paths land on the custom 404
// (notFoundComponent wiring — frontend-error-ux contract).
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'

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
    expect(await screen.findByRole('heading', { name: /ai images and video/i })).toBeInTheDocument()
  })

  it('renders the custom 404 with a home link for unknown routes', async () => {
    renderAt('/definitely-not-a-route')
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to home page/i })).toHaveAttribute('href', '/')
  })
})
