// The transcript column: the 4 UI states, the order guarantee, the "agent is
// working" pulse, and the one wire that spends money — the plan card's confirm
// reaching POST /confirm. The stale-plan rule is asserted here too, because it is
// the chat (not the card) that decides whether a budget button is live.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreatorMessage, CreatorSessionDetail } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { CreatorChat } from './CreatorChat'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

const text = (id: string, role: CreatorMessage['role'], body: string): CreatorMessage => ({
  id,
  role,
  content: { kind: 'text', text: body },
  createdAt: '2026-07-30T10:00:00.000Z',
})

const planMessage: CreatorMessage = {
  id: 'p1',
  role: 'assistant',
  content: {
    kind: 'plan',
    summary: 'Один портрет',
    items: [{ label: 'портрет · flux dev', credits: 2 }],
    totalCredits: 2,
  },
  createdAt: '2026-07-30T10:00:02.000Z',
}

const detail = (
  status: CreatorSessionDetail['status'],
  messages: CreatorMessage[],
): CreatorSessionDetail => ({
  id: 's1',
  title: 'холст с лисом',
  status,
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:02.000Z',
  messages,
})

function renderChat(sessionId: string | null = 's1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <CreatorChat sessionId={sessionId} />,
  })
  const canvasStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/canvas/$canvasId',
    component: () => null,
  })
  const soulStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/soul/$entityId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, canvasStub, soulStub]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('CreatorChat', () => {
  it('invites the user to pick a conversation when none is open', async () => {
    expect(apiMock).not.toHaveBeenCalled()
    renderChat(null)
    expect(await screen.findByText(/pick a conversation/i)).toBeInTheDocument()
  })

  it('shows skeletons while the transcript loads', async () => {
    apiMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderChat()
    // The router mounts asynchronously, so wait for the column to exist
    await screen.findByRole('region', { name: /conversation/i })
    expect(container.querySelectorAll('.animate-skeleton').length).toBeGreaterThan(0)
  })

  it('offers a retry when the transcript cannot be loaded', async () => {
    apiMock.mockRejectedValueOnce(new ApiClientError('internal_error', 'boom', 500))
    renderChat()
    const retry = await screen.findByRole('button', { name: /try again/i })
    apiMock.mockResolvedValue(detail('idle', [text('m1', 'user', 'привет')]))
    await userEvent.click(retry)
    expect(await screen.findByText('привет')).toBeInTheDocument()
  })

  it('renders messages in the order the server sent them — never re-sorted', async () => {
    apiMock.mockResolvedValue(
      detail('idle', [
        text('m1', 'user', 'первое'),
        text('m2', 'assistant', 'второе'),
        text('m3', 'assistant', 'третье'),
      ]),
    )
    const { container } = renderChat()
    expect(await screen.findByText('первое')).toBeInTheDocument()
    const rendered = [...container.querySelectorAll('li')].map((node) => node.textContent)
    expect(rendered).toEqual(['первое', 'второе', 'третье'])
  })

  it('says the agent is working while a turn runs', async () => {
    apiMock.mockResolvedValue(detail('running', [text('m1', 'user', 'привет')]))
    renderChat()
    expect(await screen.findByText(/agent is working/i)).toBeInTheDocument()
  })

  it('drops the working row once the turn settles', async () => {
    apiMock.mockResolvedValue(detail('idle', [text('m1', 'user', 'привет')]))
    renderChat()
    expect(await screen.findByText('привет')).toBeInTheDocument()
    expect(screen.queryByText(/agent is working/i)).not.toBeInTheDocument()
  })

  it('confirms the live plan through POST /confirm', async () => {
    apiMock.mockResolvedValue(detail('awaiting_confirm', [text('m1', 'user', 'привет'), planMessage]))
    renderChat()
    await userEvent.click(await screen.findByRole('button', { name: /2 cr/ }))
    expect(apiMock).toHaveBeenCalledWith('/api/creator/sessions/s1/confirm', { method: 'POST' })
  })

  it('will not confirm a plan the session has already left behind', async () => {
    apiMock.mockResolvedValue(detail('idle', [text('m1', 'user', 'привет'), planMessage]))
    renderChat()
    expect(await screen.findByRole('button', { name: /2 cr/ })).toBeDisabled()
  })

  it('says the agent is reading when a fresh session has no messages yet', async () => {
    apiMock.mockResolvedValue(detail('running', []))
    renderChat()
    expect(await screen.findByText(/reading your task/i)).toBeInTheDocument()
  })
})
