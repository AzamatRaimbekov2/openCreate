// apps/web/src/modules/Styles/components/StyleLibrary.test.tsx
// Behavior of the /styles page body. Load-bearing assertions:
//   * all four states off ONE async source (['styles']);
//   * a builtin is READ-ONLY — it carries the badge and offers no edit/delete,
//     because it is code shipped to everyone, not a row this user owns;
//   * "no styles of your own" is the empty state, even though the list is never
//     literally empty (the builtins always arrive);
//   * deleting asks first — a style is one field, but it disappears from every
//     picker in the app.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogModel, Style } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { StyleLibrary } from './StyleLibrary'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function styleRow(overrides: Partial<Style> = {}): Style {
  return {
    id: 'st1',
    name: 'Neon noir',
    kind: 'prompt',
    builtin: false,
    fragment: 'neon noir, rain-slicked streets',
    negative: '',
    recommendedModelId: null,
    previewUrl: null,
    createdAt: '2026-07-31T10:00:00.000Z',
    updatedAt: '2026-07-31T10:00:00.000Z',
    ...overrides,
  }
}

const BUILTIN = styleRow({
  id: 'anime',
  name: 'Anime',
  builtin: true,
  createdAt: null,
  updatedAt: null,
})

const MODELS: CatalogModel[] = []

function renderLibrary() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <StyleLibrary models={MODELS} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
})

it('shows skeletons, never an empty screen, while the registry loads', () => {
  apiMock.mockReturnValue(new Promise(() => {}))
  const { container } = renderLibrary()

  expect(container.querySelectorAll('.animate-skeleton').length).toBeGreaterThan(0)
})

it('offers a retry when the registry fails to load', async () => {
  apiMock.mockRejectedValue(new Error('boom'))
  renderLibrary()

  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  // The raw failure never reaches the user
  expect(screen.queryByText(/boom/)).not.toBeInTheDocument()
})

it('marks a builtin style read-only — badge, no edit, no delete', async () => {
  apiMock.mockResolvedValue({ items: [BUILTIN] })
  renderLibrary()

  const builtin = await screen.findByRole('listitem', { name: /anime/i })
  expect(within(builtin).getByText(/built-in/i)).toBeInTheDocument()
  // No action menu at all — there is nothing a user may do to code
  expect(within(builtin).queryByRole('button', { name: /actions/i })).not.toBeInTheDocument()
})

it('names the empty state after MY styles, since the builtins always arrive', async () => {
  apiMock.mockResolvedValue({ items: [BUILTIN] })
  renderLibrary()

  expect(await screen.findByText(/no styles of your own/i)).toBeInTheDocument()
})

it('renders my style with its preview image and an edit affordance', async () => {
  apiMock.mockResolvedValue({ items: [BUILTIN, styleRow({ previewUrl: '/media/a.png' })] })
  renderLibrary()

  const mine = await screen.findByRole('listitem', { name: /neon noir/i })
  expect(within(mine).getByRole('img')).toHaveAttribute('src', '/media/a.png')

  await userEvent.click(within(mine).getByRole('button', { name: /actions/i }))
  expect(within(mine).getByRole('menuitem', { name: /edit/i })).toBeInTheDocument()
  expect(screen.queryByText(/no styles of your own/i)).not.toBeInTheDocument()
})

it('asks before deleting — the style disappears from every picker in the app', async () => {
  apiMock.mockResolvedValue({ items: [styleRow()] })
  renderLibrary()

  const mine = await screen.findByRole('listitem', { name: /neon noir/i })
  await userEvent.click(within(mine).getByRole('button', { name: /actions/i }))
  await userEvent.click(within(mine).getByRole('menuitem', { name: /delete/i }))

  // Nothing left yet — the confirm is the gate
  expect(apiMock).not.toHaveBeenCalledWith('/api/styles/st1', { method: 'DELETE' })
  const dialog = await screen.findByRole('dialog', { name: /delete this style/i })

  await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }))
  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith('/api/styles/st1', { method: 'DELETE' }),
  )
})
