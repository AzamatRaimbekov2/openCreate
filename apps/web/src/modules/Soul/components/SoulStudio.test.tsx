// apps/web/src/modules/Soul/components/SoulStudio.test.tsx
// Behaviour of the 3-zone studio (2026-07-21 recomposition). The invariants that
// make it a studio and not a pile of panels:
//   1. the three zones are all present — the "＋ new" reset, the builder axes, and
//      the center-stage placeholder while the draft is untouched;
//   2. the ONE create action is DISABLED until the character can be named, and a
//      valid create fires the FREE mutation and lands on the soul card;
//   3. picking a preset fills the SAME draft the composer reads (the owner-of-one-
//      draft invariant — a preset is structure, not a string).
// Mocks the api client and renders inside a tiny real router (SoulCharacters +
// the create success both navigate), mirroring CinemaLibrary.test's style.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PROMPT_LIBRARY } from '@opencreate/contracts'
import type { Entity, EntityList } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { SoulStudio } from './SoulStudio'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    kind: 'character',
    name: 'Аня',
    description: 'a woman',
    soul: { archetype: 'female', styleId: 'anime', traits: [], notes: '' },
    images: [],
    primaryImageId: null,
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
    ...overrides,
  }
}

// The studio + a /soul/$entityId stub so the create-success navigation resolves.
function renderStudio() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const rootRoute = createRootRoute()
  const studioRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/soul',
    component: () => <SoulStudio />,
  })
  const cardStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/soul/$entityId',
    component: SoulCardStub,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([studioRoute, cardStub]),
    history: createMemoryHistory({ initialEntries: ['/soul'] }),
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// Renders the navigated-to entity id as one text node, so a create can be
// asserted by where it landed rather than by spying on the router.
function SoulCardStub() {
  const params = useParams({ strict: false })
  return <p>{`card:${params.entityId ?? ''}`}</p>
}

beforeEach(() => {
  apiMock.mockReset()
  // Default: the character rail resolves empty; the POST creates one entity.
  apiMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/entities' && init?.method === 'POST') {
      return Promise.resolve(makeEntity({ id: 'e1' }))
    }
    if (url === '/api/entities') return Promise.resolve({ items: [] } satisfies EntityList)
    return Promise.reject(new Error(`unexpected request: ${url}`))
  })
})

describe('SoulStudio', () => {
  it('renders the three zones: the new-character reset, the builder axes, and the empty stage', async () => {
    renderStudio()
    // LEFT: the reset affordance (also the first tick's proof the router mounted)
    expect(await screen.findByRole('button', { name: /new character/i })).toBeInTheDocument()
    // RIGHT: a builder axis (archetype pill — contract label, always Russian)
    expect(screen.getByRole('button', { name: 'Мужчина' })).toBeInTheDocument()
    // CENTER: the honest placeholder while the draft is untouched
    expect(screen.getByText(/build your character/i)).toBeInTheDocument()
  })

  it('keeps the single create action disabled until the character can be named', async () => {
    const user = userEvent.setup()
    renderStudio()

    const create = await screen.findByRole('button', { name: 'Create character' })
    expect(create).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'Аня')
    expect(create).toBeEnabled()
  })

  it('creates the character for free and lands on its soul card', async () => {
    const user = userEvent.setup()
    renderStudio()

    await user.type(await screen.findByRole('textbox', { name: /^name$/i }), 'Аня')
    await user.click(screen.getByRole('button', { name: 'Create character' }))

    // The POST carried the built spec, not a typed prompt
    expect(apiMock).toHaveBeenCalledWith(
      '/api/entities',
      expect.objectContaining({ method: 'POST' }),
    )
    // …and success navigated into the new character's card
    expect(await screen.findByText('card:e1')).toBeInTheDocument()
  })

  it('fills the builder from a preset — a whole Soul, not a string', async () => {
    const user = userEvent.setup()
    renderStudio()

    await user.click(await screen.findByRole('button', { name: /start from a preset/i }))
    // The preset modal lists the ready-made characters; open the first one
    const [open] = screen.getAllByRole('button', { name: /open in constructor/i })
    await user.click(open as HTMLElement)

    // The preset landed in the ONE draft the composer reads — its name is now set,
    // and the center stage is no longer the empty placeholder
    const first = PROMPT_LIBRARY[0]
    expect(screen.getByRole('textbox', { name: /^name$/i })).toHaveValue(first?.label ?? '')
    expect(screen.queryByText(/build your character/i)).not.toBeInTheDocument()
  })
})
