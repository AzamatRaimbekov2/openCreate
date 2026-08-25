// The operator dashboard, and specifically the three ways it is allowed to say
// "I don't know" (ADR analytics §3–§4). Each one is a number an operator would
// price on, so each is tested as rendered behaviour and not left to format.ts:
//
//   1. no credit price   → the margin panel says what is missing, never "$0.00"
//   2. an unpriced row   → the caveat renders NEXT TO the total it qualifies
//   3. a non-admin       → a stated 403, and NO admin request fires at all
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminMoney } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { AdminDashboard } from './AdminDashboard'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})
const apiMock = vi.mocked(api)

const MONEY: AdminMoney = {
  windowDays: 7,
  creditsCharged: 100,
  creditsRefunded: 0,
  creditsNet: 100,
  cost: { billedUsd: 0.4, pricedCount: 1, unpricedCount: 0 },
  margin: { creditPriceUsd: null, revenueUsd: null, marginUsd: null, marginPercent: null },
  byModel: [],
  byDay: [],
}

function serve(money: AdminMoney) {
  apiMock.mockImplementation((path: string) => {
    if (path.startsWith('/api/admin/analytics/money')) {
      return Promise.resolve(money as unknown as never)
    }
    return Promise.reject(new Error(`unexpected ${path}`))
  })
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AdminDashboard isSuperAdmin isSessionLoading={false} />
    </QueryClientProvider>,
  )
}

async function openMoneyTab() {
  const { default: userEvent } = await import('@testing-library/user-event')
  await userEvent.setup().click(screen.getByRole('button', { name: /деньги|money/i }))
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('admin dashboard — refusing to guess', () => {
  it('says the credit price is missing instead of rendering a $0.00 margin', async () => {
    // The failure this prevents: an operator reads "$0.00 margin", concludes the
    // product breaks even, and prices against a number that was never computed.
    serve(MONEY)
    renderDashboard()
    await openMoneyTab()

    expect(await screen.findByText(/CREDIT_PRICE_USD/)).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
  })

  it('computes and labels the margin once a rate is configured', async () => {
    serve({
      ...MONEY,
      margin: { creditPriceUsd: 0.02, revenueUsd: 2, marginUsd: 1.6, marginPercent: 80 },
    })
    renderDashboard()
    await openMoneyTab()

    expect(await screen.findByText('$1.60')).toBeInTheDocument()
    // The rate is an assumption, and saying so is what stops the figure above it
    // from being quoted as revenue.
    expect(screen.getByText(/0\.02/)).toBeInTheDocument()
  })

  it('renders the unpriced caveat beside the total it makes incomplete', async () => {
    // Segmind reports no cost. A bare "$0.40" would read as the whole bill.
    serve({ ...MONEY, cost: { billedUsd: 0.4, pricedCount: 1, unpricedCount: 3 } })
    renderDashboard()
    await openMoneyTab()

    // The notice itself, naming the count — not a bare "3" that could be any
    // number on the page.
    const notice = await screen.findByText(/Segmind/)
    expect(notice).toHaveTextContent(/3/)
  })

  it('shows a stated 403 to a non-admin and fires NO admin request', async () => {
    // Hiding the nav link never stopped anyone typing the URL. The request must
    // not go out either — a guaranteed 403 in the cache flashes an error state
    // on every mount.
    apiMock.mockImplementation(() => Promise.reject(new Error('must not be called')))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AdminDashboard isSuperAdmin={false} isSessionLoading={false} />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('shows a placeholder, not the 403, while the session is still resolving', async () => {
    // "Unknown" is not "no". Rendering the refusal first and replacing it a
    // moment later reads as a permission flicker and makes the operator doubt
    // the page.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AdminDashboard isSuperAdmin={false} isSessionLoading />
      </QueryClientProvider>,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
