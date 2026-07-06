// apps/web/src/routes/__root.test.tsx
// Smoke test: the generated route tree renders the landing route inside the
// root providers when the router starts at '/' (memory history, no browser URL).
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'

describe('root route', () => {
  it('renders the landing headline at /', async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)
    // Headline comes from the EN locale (i18n is wired in the root route)
    expect(
      await screen.findByRole('heading', { name: /ai images and video/i }),
    ).toBeInTheDocument()
  })
})
