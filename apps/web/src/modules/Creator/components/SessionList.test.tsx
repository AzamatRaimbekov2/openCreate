// The left rail — the full 4-states rule (skeleton → error+retry → empty+CTA →
// rows) plus the two things a rail must never get wrong: the ACTIVE row is
// announced to assistive tech, and a session's state is readable as a WORD next
// to its title, not as a colour a colour-blind user cannot see.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreatorSession, CreatorSessionList } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { SessionList } from './SessionList'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

const session = (overrides: Partial<CreatorSession>): CreatorSession => ({
  id: 's1',
  title: 'холст с лисом',
  status: 'idle',
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:00.000Z',
  ...overrides,
})

function renderRail(activeSessionId: string | null = null) {
  const onSelect = vi.fn()
  const onNew = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SessionList activeSessionId={activeSessionId} onSelect={onSelect} onNew={onNew} />
    </QueryClientProvider>,
  )
  return { onSelect, onNew, ...view }
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('SessionList', () => {
  it('shows skeleton rows while the rail loads', async () => {
    apiMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderRail()
    expect(container.querySelectorAll('.animate-skeleton').length).toBeGreaterThan(0)
  })

  it('offers a retry on failure and recovers with it', async () => {
    apiMock.mockRejectedValueOnce(new ApiClientError('internal_error', 'boom', 500))
    renderRail()
    const retry = await screen.findByRole('button', { name: /try again/i })
    apiMock.mockResolvedValue({ items: [session({ title: 'холст с лисом' })] } satisfies CreatorSessionList)
    await userEvent.click(retry)
    expect(await screen.findByText('холст с лисом')).toBeInTheDocument()
  })

  it('invites the first task when there is nothing yet', async () => {
    apiMock.mockResolvedValue({ items: [] } satisfies CreatorSessionList)
    const { onNew } = renderRail()
    expect(await screen.findByText(/no conversations yet/i)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /new task/i })[0]!)
    expect(onNew).toHaveBeenCalled()
  })

  it('renders one row per session, in the order the server sent them', async () => {
    apiMock.mockResolvedValue({
      items: [session({ id: 'a', title: 'первая' }), session({ id: 'b', title: 'вторая' })],
    } satisfies CreatorSessionList)
    renderRail()
    expect(await screen.findByText('первая')).toBeInTheDocument()
    const titles = screen
      .getAllByRole('button', { name: /первая|вторая/ })
      .map((button) => button.textContent)
    expect(titles[0]).toContain('первая')
    expect(titles[1]).toContain('вторая')
  })

  it('says a running session is working, in words', async () => {
    apiMock.mockResolvedValue({
      items: [session({ status: 'running' })],
    } satisfies CreatorSessionList)
    renderRail()
    expect(await screen.findByText('working')).toBeInTheDocument()
  })

  it('says a session is waiting for the user’s confirmation', async () => {
    apiMock.mockResolvedValue({
      items: [session({ status: 'awaiting_confirm' })],
    } satisfies CreatorSessionList)
    renderRail()
    expect(await screen.findByText(/awaiting confirmation/i)).toBeInTheDocument()
  })

  it('shows no state word for an idle session — "ready" is the absence of news', async () => {
    apiMock.mockResolvedValue({ items: [session({ status: 'idle' })] } satisfies CreatorSessionList)
    renderRail()
    expect(await screen.findByText('холст с лисом')).toBeInTheDocument()
    expect(screen.queryByText('ready')).not.toBeInTheDocument()
  })

  it('marks the open conversation as current for assistive tech', async () => {
    apiMock.mockResolvedValue({
      items: [session({ id: 'a', title: 'первая' }), session({ id: 'b', title: 'вторая' })],
    } satisfies CreatorSessionList)
    renderRail('b')
    const active = await screen.findByRole('button', { name: /вторая/ })
    expect(active).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /первая/ })).not.toHaveAttribute('aria-current')
  })

  it('opens a conversation on click', async () => {
    apiMock.mockResolvedValue({ items: [session({ id: 'a', title: 'первая' })] } satisfies CreatorSessionList)
    const { onSelect } = renderRail()
    await userEvent.click(await screen.findByRole('button', { name: /первая/ }))
    expect(onSelect).toHaveBeenCalledWith('a')
  })
})
