// apps/web/src/shared/ui/AppShell.test.tsx
// Behavior: the shell shows the primary nav (Create/Library/Pricing), the
// injected balance slot, the EN/RU language switch (delegating to setLanguage),
// and the account area — Sign in link when signed out, a user menu with a
// working Sign out action when signed in, a placeholder while resolving.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { setLanguage } from 'shared/config/i18n'
import { AppShell } from './AppShell'
import type { AppShellProps } from './AppShell'

// Mock ONLY setLanguage; the initialized i18n instance itself must stay real
// so the shell renders localized labels
vi.mock('shared/config/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/config/i18n')>()
  return { ...actual, setLanguage: vi.fn() }
})

const setLanguageMock = vi.mocked(setLanguage)

// The shell renders TanStack <Link>s, so it needs a live router. This dummy
// tree only has to KNOW the destinations — their screens never render here.
function renderShell(overrides: Partial<AppShellProps> = {}) {
  const props: AppShellProps = {
    user: null,
    onSignOut: vi.fn(),
    children: <p>page-content</p>,
    ...overrides,
  }
  const rootRoute = createRootRoute({
    component: () => <AppShell {...props} />,
  })
  const paths = ['/', '/create', '/library', '/pricing', '/login']
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
  return props
}

beforeEach(() => {
  setLanguageMock.mockReset()
})

describe('AppShell', () => {
  it('renders the primary nav destinations and the page content', async () => {
    renderShell()
    expect(await screen.findByRole('link', { name: 'Create' })).toHaveAttribute('href', '/create')
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library')
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing')
    expect(screen.getByText('page-content')).toBeInTheDocument()
  })

  it('switches the language through setLanguage', async () => {
    renderShell()
    await userEvent.click(await screen.findByRole('button', { name: 'RU' }))
    expect(setLanguageMock).toHaveBeenCalledWith('ru')
  })

  it('shows a Sign in link when signed out', async () => {
    renderShell({ user: null })
    const signIn = await screen.findByRole('link', { name: /sign in/i })
    expect(signIn).toHaveAttribute('href', '/login')
    // No account menu without an account
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })

  it('shows neither Sign in nor a menu while the session is resolving', async () => {
    renderShell({ isSessionPending: true })
    await screen.findByRole('link', { name: 'Create' })
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
  })

  it('opens the user menu and fires onSignOut', async () => {
    const props = renderShell({ user: { name: 'Ada', email: 'ada@x.co' } })
    const trigger = await screen.findByRole('button', { name: 'Ada' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole('menuitem', { name: /sign out/i }))
    expect(props.onSignOut).toHaveBeenCalledTimes(1)
    // The menu closes once the action is taken
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('falls back to the email when the account has no name', async () => {
    renderShell({ user: { name: null, email: 'ada@x.co' } })
    expect(await screen.findByRole('button', { name: 'ada@x.co' })).toBeInTheDocument()
  })

  it('renders the injected balance slot', async () => {
    renderShell({
      user: { name: 'Ada', email: 'ada@x.co' },
      balanceSlot: <span>balance-slot</span>,
    })
    expect(await screen.findByText('balance-slot')).toBeInTheDocument()
  })
})
