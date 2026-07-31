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
    referenceImages: [],
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

it('shows the package on the tile — how many references a style carries', async () => {
  apiMock.mockResolvedValue({
    items: [
      styleRow({
        referenceImages: [
          { id: 'r1', url: '/media/a.png' },
          { id: 'r2', url: '/media/b.png' },
        ],
      }),
    ],
  })
  renderLibrary()

  const mine = await screen.findByRole('listitem', { name: /neon noir/i })
  // A style is a PACKAGE (fragments + pictures); the library must say so, or the
  // second half is invisible until you open the constructor.
  expect(within(mine).getByText(/2 refs/i)).toBeInTheDocument()
})

it('says nothing about references on a style that carries none', async () => {
  apiMock.mockResolvedValue({ items: [BUILTIN, styleRow()] })
  renderLibrary()

  const mine = await screen.findByRole('listitem', { name: /neon noir/i })
  expect(within(mine).queryByText(/ref/i)).not.toBeInTheDocument()
  // A builtin can never carry any — no empty badge on the reference shelf either
  const builtin = screen.getByRole('listitem', { name: /anime/i })
  expect(within(builtin).queryByText(/ref/i)).not.toBeInTheDocument()
})

it('re-initialises the draft when a different style is opened', async () => {
  // The editor holds its draft in useState, so without a key the SECOND style
  // opened would show the FIRST one's text — the bug the Cinema inspector avoids
  // by keying on shot.id.
  apiMock.mockResolvedValue({
    items: [styleRow(), styleRow({ id: 'st2', name: 'Super 8', fragment: 'sun-bleached grain' })],
  })
  renderLibrary()

  const first = await screen.findByRole('listitem', { name: /neon noir/i })
  await userEvent.click(within(first).getByRole('button', { name: /actions/i }))
  await userEvent.click(within(first).getByRole('menuitem', { name: /edit/i }))
  expect(screen.getByRole('textbox', { name: /name/i })).toHaveValue('Neon noir')
  await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

  const second = screen.getByRole('listitem', { name: /super 8/i })
  await userEvent.click(within(second).getByRole('button', { name: /actions/i }))
  await userEvent.click(within(second).getByRole('menuitem', { name: /edit/i }))

  expect(screen.getByRole('textbox', { name: /name/i })).toHaveValue('Super 8')
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
