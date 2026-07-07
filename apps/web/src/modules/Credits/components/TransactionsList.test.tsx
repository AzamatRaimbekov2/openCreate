// apps/web/src/modules/Credits/components/TransactionsList.test.tsx
// Behavior (4-states rule inside the modal): loading → skeleton rows; error →
// ErrorState with working retry; empty → EmptyState; data → rows with localized
// kind labels and signed amounts colored success (+) / danger (-).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CreditTransaction } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { TransactionsList } from './TransactionsList'
// i18n init — the list renders localized labels itself
import 'shared/config/i18n'

// Mock ONLY api(); everything else from the module stays real
vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

const transactions: { items: CreditTransaction[] } = {
  items: [
    {
      id: 't1',
      amount: 200,
      kind: 'signup_bonus',
      generationId: null,
      createdAt: '2026-07-06T10:00:00.000Z',
    },
    {
      id: 't2',
      amount: -35,
      kind: 'charge',
      generationId: 'g1',
      createdAt: '2026-07-06T11:00:00.000Z',
    },
    {
      id: 't3',
      amount: 35,
      kind: 'refund',
      generationId: 'g1',
      createdAt: '2026-07-06T11:05:00.000Z',
    },
  ],
}

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionsList isOpen onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('TransactionsList', () => {
  it('shows skeleton rows while the history loads', () => {
    apiMock.mockReturnValue(new Promise(() => {}))
    renderList()
    const dialog = screen.getByRole('dialog', { name: /credit history/i })
    expect(dialog.querySelector('.animate-skeleton')).toBeInTheDocument()
  })

  it('shows an error state with a working retry', async () => {
    apiMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(transactions)
    renderList()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not load/i)
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Signup bonus')).toBeInTheDocument()
  })

  it('shows an empty state when there are no transactions', async () => {
    apiMock.mockResolvedValue({ items: [] })
    renderList()
    expect(await screen.findByText(/no transactions yet/i)).toBeInTheDocument()
  })

  it('renders localized kinds with signed, colored amounts', async () => {
    apiMock.mockResolvedValue(transactions)
    renderList()
    expect(await screen.findByText('Signup bonus')).toBeInTheDocument()
    expect(screen.getByText('Generation')).toBeInTheDocument()
    expect(screen.getByText('Refund')).toBeInTheDocument()
    // Positive amounts show a plus and use the green status glow; negative → red
    // (v3 triad: succeeded/positive = glow-green, failed/negative = glow-red)
    expect(screen.getByText('+200')).toHaveClass('text-glow-green')
    expect(screen.getByText('-35')).toHaveClass('text-glow-red')
    expect(screen.getByText('+35')).toHaveClass('text-glow-green')
  })

  it('renders nothing when closed', () => {
    apiMock.mockResolvedValue(transactions)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <TransactionsList isOpen={false} onClose={vi.fn()} />
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Closed modal must not fire the request either (query disabled)
    expect(apiMock).not.toHaveBeenCalled()
  })
})
