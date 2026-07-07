// apps/web/src/modules/Landing/components/LandingPage.test.tsx
// Behavior: the landing renders hero → price comparison → how-it-works → FAQ
// in that order, shows the three honest hero claims (and no blanket
// "cheapest" claim), and its CTAs point wherever the route tells them to —
// /login for visitors, /create for signed-in users.
import { render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { LandingPage } from './LandingPage'
import type { LandingPageProps } from './LandingPage'
// i18n init side effect — the page renders localized copy (EN default)
import 'shared/config/i18n'

// The landing renders TanStack <Link>s, so it needs a live router that KNOWS
// the destinations — their screens never render here.
function renderLanding(ctaTo: LandingPageProps['ctaTo']) {
  const rootRoute = createRootRoute({
    component: () => <LandingPage ctaTo={ctaTo} />,
  })
  const paths = ['/', '/create', '/login', '/pricing']
  const routeTree = rootRoute.addChildren(
    paths.map((path) =>
      createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
    ),
  )
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
}

describe('LandingPage', () => {
  it('renders hero, showcase, price comparison, how-it-works and FAQ in order', async () => {
    renderLanding('/login')
    expect(
      await screen.findByRole('heading', { level: 1, name: /create images & video/i }),
    ).toBeInTheDocument()
    // Section order = document order of the level-2 headings (editorial brief:
    // hero → selected works → the index → how-it-works → FAQ)
    const sectionTitles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
    expect(sectionTitles).toEqual([
      'Selected works',
      'Honest price comparison',
      'How it works',
      'Fair questions',
    ])
  })

  it('opens with the studio micro-label and a secondary pricing link', async () => {
    renderLanding('/login')
    // The kicker renders the raw i18n string (v3: plain lowercase mono)
    expect(await screen.findByText('AI image & video studio')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /see the price index/i })).toHaveAttribute(
      'href',
      '/pricing',
    )
  })

  it('closes with a colophon footer', async () => {
    renderLanding('/login')
    const footer = await screen.findByRole('contentinfo')
    expect(footer).toHaveTextContent(/© 2026 openCreate/)
  })

  it('shows the three hero claims and no blanket cheapest claim', async () => {
    renderLanding('/login')
    const claims = await screen.findByText(/images from \$0\.01/i)
    expect(claims).toHaveTextContent(/5-second videos from \$0\.35/i)
    expect(claims).toHaveTextContent(/credits never expire/i)
    // Honesty rule: comparison points only, never "cheaper than everything"
    expect(screen.queryByText(/cheapest/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/cheaper than every/i)).not.toBeInTheDocument()
  })

  it('sends visitors to login when signed out', async () => {
    renderLanding('/login')
    expect(await screen.findByRole('link', { name: /start creating/i })).toHaveAttribute(
      'href',
      '/login',
    )
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })

  it('sends signed-in users straight to create', async () => {
    renderLanding('/create')
    expect(await screen.findByRole('link', { name: /start creating/i })).toHaveAttribute(
      'href',
      '/create',
    )
  })
})
