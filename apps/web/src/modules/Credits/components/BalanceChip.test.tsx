// apps/web/src/modules/Credits/components/BalanceChip.test.tsx
// Behavior (4-states rule): loading → skeleton chip; error → compact retry
// icon-button that refetches; unauthorized → renders nothing (signed-out shell
// shows "Sign in" instead); data → bolt-stamped balance chip that opens the history modal.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Me } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { BalanceChip } from './BalanceChip'
// i18n init — the chip renders localized aria-labels itself
import 'shared/config/i18n'

// Mock ONLY api(); the real ApiClientError class must survive for instanceof
vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

const me: Me = { id: 'u1', email: 'a@b.co', name: 'A', creditsBalance: 165, role: 'user' }

function renderChip() {
  // retry: 0 so error states settle immediately in tests
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BalanceChip />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('BalanceChip', () => {
  it('shows a skeleton chip while the balance loads', () => {
    // Never-resolving request = the loading state, frozen
    apiMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderChip()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // Skeleton contract: stepped-pulse decorative placeholder (shared/ui Skeleton)
    expect(container.querySelector('.animate-skeleton')).toBeInTheDocument()
  })

  it('shows the balance and opens the transactions modal on click', async () => {
    apiMock.mockImplementation((path) =>
      path === '/api/me' ? Promise.resolve(me) : Promise.resolve({ items: [] }),
    )
    renderChip()
    const chip = await screen.findByRole('button', { name: /credits balance/i })
    expect(chip).toHaveTextContent('165')
    // v3 stage-3: the chip is the AMBER specimen pill (credits = amber family)
    expect(chip).toHaveClass('bg-specimen-amber/20')
    await userEvent.click(chip)
    expect(await screen.findByRole('dialog', { name: /credit history/i })).toBeInTheDocument()
  })

  it('renders nothing when the user is signed out (401)', async () => {
    apiMock.mockRejectedValue(new ApiClientError('unauthorized', 'Sign in required', 401))
    const { container } = renderChip()
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('shows a compact retry button on failure and recovers on click', async () => {
    apiMock
      .mockRejectedValueOnce(new ApiClientError('internal_error', 'boom', 500))
      .mockResolvedValueOnce(me)
    renderChip()
    const retry = await screen.findByRole('button', { name: /reload balance/i })
    await userEvent.click(retry)
    const chip = await screen.findByRole('button', { name: /credits balance/i })
    expect(chip).toHaveTextContent('165')
  })
})
