// apps/web/src/modules/Auth/components/AuthManifesto.test.tsx
// Behavior: the login screen's manifesto panel renders the serif brand quote,
// the three approved claims (same i18n keys the landing hero uses — one source
// of truth for approved copy), and a wordmark link back to the home page.
import { render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { AuthManifesto } from './AuthManifesto'
// i18n init — the panel renders localized copy itself
import 'shared/config/i18n'

// The wordmark is a typed <Link to="/">, so the panel needs router context;
// the home stub only has to exist for href resolution.
function renderManifesto() {
  const rootRoute = createRootRoute({ component: () => <AuthManifesto /> })
  const homeStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeStub]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
}

describe('AuthManifesto', () => {
  it('links the wordmark back to the home page', async () => {
    renderManifesto()
    const home = await screen.findByRole('link', { name: 'openCreate' })
    expect(home).toHaveAttribute('href', '/')
  })

  it('renders the manifesto quote', async () => {
    renderManifesto()
    expect(await screen.findByText(/pay for what you create/i)).toBeInTheDocument()
  })

  it('renders the three approved claims — and no invented ones', async () => {
    renderManifesto()
    // Exact meaning preserved: images $0.01, 5s video $0.35, no expiry
    expect(await screen.findByText(/images from \$0\.01/i)).toBeInTheDocument()
    expect(screen.getByText(/5-second videos from \$0\.35/i)).toBeInTheDocument()
    expect(screen.getByText(/credits never expire/i)).toBeInTheDocument()
  })
})
