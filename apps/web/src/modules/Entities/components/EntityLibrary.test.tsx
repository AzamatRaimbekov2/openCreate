// apps/web/src/modules/Entities/components/EntityLibrary.test.tsx
// Pins the editor's SEEDING contract, which is a library-level concern because
// the bug lives in how the library mounts the editor, not in the editor itself.
//
// THE BUG (b6ab9ec, found live 2026-07-31): `<EntityEditor entity={editing} …/>`
// carried no `key`. The editor seeds its fields with `useState(entity?.name ?? '')`
// — which runs ONCE, at mount — and the library renders it permanently (the Modal
// returns null when closed, but the component stays mounted). So it mounted on
// first render with `editing === null` and never re-seeded: opening "edit" on a
// real entity showed the title and photos of that entity over EMPTY name and
// description fields.
//
// That is data loss, not just confusion: `handleSave` sends `description` as it
// finds it, so a user who typed a name to re-enable the disabled Save button
// would silently overwrite the real description with an empty string. Same defect
// class as StyleLibrary's (fixed in de5ce6b), same one-line fix — a `key`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Entity } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { EntityLibrary } from './EntityLibrary'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function entity(overrides: Partial<Entity> & Pick<Entity, 'id' | 'name'>): Entity {
  return {
    kind: 'character',
    description: 'a courier who never takes the lift',
    images: [],
    primaryImageId: null,
    createdAt: '2026-07-31T10:00:00.000Z',
    updatedAt: '2026-07-31T10:00:00.000Z',
    ...overrides,
  } as Entity
}

function renderLibrary() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <EntityLibrary />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
})

it('opens the editor already carrying the entity it was asked to edit', async () => {
  apiMock.mockResolvedValue({ items: [entity({ id: 'e1', name: 'Азамат' })] })
  renderLibrary()

  const tile = await screen.findByRole('listitem')
  await userEvent.click(within(tile).getByRole('button', { name: /actions/i }))
  await userEvent.click(within(tile).getByRole('menuitem', { name: /edit/i }))

  expect(screen.getByRole('textbox', { name: /name/i })).toHaveValue('Азамат')
  // The description is the field that would be silently wiped on save
  expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue(
    'a courier who never takes the lift',
  )
})

it('re-seeds when a different entity is opened', async () => {
  apiMock.mockResolvedValue({
    items: [
      entity({ id: 'e1', name: 'Азамат' }),
      entity({ id: 'e2', name: 'Мира', description: 'a dispatcher' }),
    ],
  })
  renderLibrary()

  const tiles = await screen.findAllByRole('listitem')
  const first = tiles[0]
  const second = tiles[1]
  if (!first || !second) throw new Error('expected two entity tiles')

  await userEvent.click(within(first).getByRole('button', { name: /actions/i }))
  await userEvent.click(within(first).getByRole('menuitem', { name: /edit/i }))
  expect(screen.getByRole('textbox', { name: /name/i })).toHaveValue('Азамат')

  await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
  await userEvent.click(within(second).getByRole('button', { name: /actions/i }))
  await userEvent.click(within(second).getByRole('menuitem', { name: /edit/i }))

  expect(screen.getByRole('textbox', { name: /name/i })).toHaveValue('Мира')
})
