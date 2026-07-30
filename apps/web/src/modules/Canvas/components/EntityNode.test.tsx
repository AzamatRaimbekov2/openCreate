// The character node's three states: nothing chosen yet (a picker), a chosen
// character (avatar + name + the "from Soul" caption), and an empty Soul
// library (a quiet hint that links to /soul — the 4-states law applies to a
// node body too). The node NEVER runs, so there is no Generate here at all.
// @xyflow/react needs ResizeObserver for Handle measurement; jsdom ships none.
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactFlowProvider } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasDetail } from '@opencreate/contracts'
import type { CanvasEntityOption } from '../model/types'
import { useCanvasStore } from '../model/canvasStore'
import { EntityNode } from './EntityNode'
import 'shared/config/i18n'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

const DOC: CanvasDetail = {
  id: 'c1',
  title: 'T',
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    { id: 'ch1', kind: 'character', position: { x: 0, y: 0 }, config: {}, generationIds: [] },
  ],
  edges: [],
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
}

const ENTITIES: CanvasEntityOption[] = [
  { id: 'ent1', name: 'Anya', imageUrl: '/media/anya.webp' },
  { id: 'ent2', name: 'Bear', imageUrl: null },
]

// The hint renders a real TanStack <Link>, so the node needs a router — a
// mocked Link would test the mock instead of the navigation the user gets.
// `router.load()` before render settles the route so the assertions below can
// stay synchronous (RouterProvider paints nothing on its first tick).
async function renderNode(entities: CanvasEntityOption[] = ENTITIES) {
  const rootRoute = createRootRoute()
  const boardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <ReactFlowProvider>
        <EntityNode id="ch1" data={{ entities }} />
      </ReactFlowProvider>
    ),
  })
  const soulRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/soul',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([boardRoute, soulRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  useCanvasStore.getState().reset()
  useCanvasStore.getState().init(DOC)
})

describe('EntityNode', () => {
  it('unset: offers the passed characters and writes the pick into the node config', async () => {
    await renderNode()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /pick a character/i }))
    await user.click(screen.getByRole('option', { name: /Anya/ }))
    expect(useCanvasStore.getState().nodes[0]?.config.entityId).toBe('ent1')
  })

  it('chosen: shows the avatar, the name and the from-Soul source', async () => {
    useCanvasStore.getState().updateNodeConfig('ch1', { entityId: 'ent1' })
    await renderNode()
    expect(screen.getByRole('img', { name: 'Anya' })).toHaveAttribute('src', '/media/anya.webp')
    expect(screen.getByText('Anya')).toBeInTheDocument()
    expect(screen.getByText('from Soul')).toBeInTheDocument()
  })

  it('chosen without a photo: still names the character (no broken image)', async () => {
    useCanvasStore.getState().updateNodeConfig('ch1', { entityId: 'ent2' })
    await renderNode()
    expect(screen.getByText('Bear')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('empty Soul library: shows a quiet hint linking to /soul instead of an empty picker', async () => {
    await renderNode([])
    expect(screen.getByText(/no characters yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /soul/i })).toHaveAttribute('href', '/soul')
    expect(screen.queryByRole('button', { name: /pick a character/i })).not.toBeInTheDocument()
  })

  it('never runs: the status stays idle and the card offers no Generate', async () => {
    await renderNode()
    expect(screen.getByText('idle')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument()
  })
})
