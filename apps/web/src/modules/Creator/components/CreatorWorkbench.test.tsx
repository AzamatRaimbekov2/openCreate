// The screen's two decisions, which is why they live in the module and not in the
// route file (routes are composition only):
//   1. WHICH conversation is open — the newest one on arrival, so a reload lands
//      the user back where they were without a URL parameter;
//   2. WHERE a message goes — the first one CREATES a session, every later one
//      continues the open session. Sending the first message to /messages (or the
//      second to /sessions) would either 404 or fork the conversation.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreatorSession, CreatorSessionDetail } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { CreatorWorkbench } from './CreatorWorkbench'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

const summary = (id: string, title: string): CreatorSession => ({
  id,
  title,
  status: 'idle',
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:00.000Z',
})

const detail = (id: string, title: string, status: CreatorSessionDetail['status'] = 'running'): CreatorSessionDetail => ({
  ...summary(id, title),
  status,
  messages: [
    { id: `${id}-m1`, role: 'user', content: { kind: 'text', text: title }, createdAt: '2026-07-30T10:00:00.000Z' },
  ],
})

// One fake server for the whole screen: the rail, each transcript, and the two
// POSTs. Routing by path keeps the test honest about WHICH endpoint was hit.
function server(sessions: CreatorSession[]) {
  return vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/creator/sessions' && init?.method === 'POST') {
      return detail('fresh', 'нарисуй лиса')
    }
    if (path === '/api/creator/sessions') return { items: sessions }
    const match = /^\/api\/creator\/sessions\/([^/]+)$/.exec(path)
    if (match) {
      const found = sessions.find((item) => item.id === match[1])
      return detail(match[1] ?? 'x', found?.title ?? 'нарисуй лиса', 'idle')
    }
    return detail('fresh', 'нарисуй лиса')
  })
}

function renderWorkbench() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <CreatorWorkbench />,
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

describe('CreatorWorkbench', () => {
  it('opens the newest conversation on arrival, so a reload lands where the user was', async () => {
    apiMock.mockImplementation(server([summary('newest', 'свежая задача'), summary('older', 'старая задача')]))
    renderWorkbench()
    // The rail lists both; the transcript shows the newest one's messages
    expect(await screen.findByRole('button', { name: /старая задача/ })).toBeInTheDocument()
    expect(apiMock).toHaveBeenCalledWith('/api/creator/sessions/newest')
  })

  it('sends the FIRST message to POST /sessions and opens what it creates', async () => {
    apiMock.mockImplementation(server([]))
    renderWorkbench()
    const input = await screen.findByRole('textbox', { name: /task for the agent/i })
    await userEvent.type(input, 'нарисуй лиса{Enter}')
    expect(apiMock).toHaveBeenCalledWith('/api/creator/sessions', {
      method: 'POST',
      body: JSON.stringify({ message: 'нарисуй лиса' }),
    })
    // …and the new conversation is the one open in the transcript column (the
    // rail also grew a row with the same title, hence the scoped query)
    const transcript = await screen.findByRole('region', { name: /^conversation$/i })
    expect(await within(transcript).findByText('нарисуй лиса')).toBeInTheDocument()
  })

  it('sends a LATER message into the open session, never as a new one', async () => {
    apiMock.mockImplementation(server([summary('open', 'уже начатая')]))
    renderWorkbench()
    const input = await screen.findByRole('textbox', { name: /task for the agent/i })
    await userEvent.type(input, 'продолжай{Enter}')
    expect(apiMock).toHaveBeenCalledWith('/api/creator/sessions/open/messages', {
      method: 'POST',
      body: JSON.stringify({ message: 'продолжай' }),
    })
  })

  it('«New task» clears the column to a fresh draft', async () => {
    apiMock.mockImplementation(server([summary('open', 'уже начатая')]))
    renderWorkbench()
    await userEvent.click(await screen.findByRole('button', { name: /new task/i }))
    expect(await screen.findByText(/pick a conversation/i)).toBeInTheDocument()
    // …and it does NOT bounce straight back to the newest session
    expect(screen.queryByText(/agent is working/i)).not.toBeInTheDocument()
  })

  it('opens a conversation picked from the rail', async () => {
    apiMock.mockImplementation(server([summary('newest', 'свежая'), summary('older', 'старая')]))
    renderWorkbench()
    await userEvent.click(await screen.findByRole('button', { name: /старая/ }))
    expect(apiMock).toHaveBeenCalledWith('/api/creator/sessions/older')
  })
})
