// apps/web/src/modules/Styles/components/StyleEditor.test.tsx
// Behavior of the style constructor. Load-bearing assertions:
//   * the fragment field carries the sparkle (mandatory on EVERY prompt field
//     in this app) and enhancing REPLACES what gets saved, not a copy of it;
//   * create and edit are one modal, and only edit can preview — a preview
//     cites a style by id, and a style being typed has none;
//   * the preview button SAVES first and hands the SAVED row upward, so the
//     sample renders the fragment on screen rather than the one the server last
//     heard about (the run itself is owned by the library, which outlives this
//     modal — a poll that died on close would strand a paid generation);
//   * the preview price comes from the model that will actually run it.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogModel, Style } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { StyleEditor } from './StyleEditor'
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

// Two image models, priced apart, so an assertion on the price is an assertion
// about WHICH model the preview will use.
function imageModel(id: string, name: string, credits: number): CatalogModel {
  return {
    id,
    name,
    providerLabel: 'Runware',
    air: `runware:${credits}@1`,
    tier: 'fast',
    supportsImageInput: false,
    aspectRatios: ['1:1'],
    type: 'image',
    credits,
  }
}

const MODELS: CatalogModel[] = [
  imageModel('flux-schnell', 'Flash', 1),
  imageModel('flux-dev', 'Studio', 4),
]

function renderEditor(style: Style | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onPreview = vi.fn()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <StyleEditor
        style={style}
        models={MODELS}
        isOpen
        onClose={vi.fn()}
        onPreview={onPreview}
        isPreviewPending={false}
      />
    </QueryClientProvider>,
  )
  return { ...view, onPreview }
}

beforeEach(() => {
  apiMock.mockReset()
})

it('creates a style from a name and a fragment', async () => {
  apiMock.mockResolvedValue(styleRow())
  renderEditor(null)

  await userEvent.type(screen.getByRole('textbox', { name: /name/i }), 'Neon noir')
  await userEvent.type(screen.getByRole('textbox', { name: /style fragment/i }), 'neon noir')
  await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith('/api/styles', {
      method: 'POST',
      body: JSON.stringify({ name: 'Neon noir', fragment: 'neon noir', negative: '' }),
    }),
  )
})

it('refuses to submit a style with no fragment — there would be nothing to apply', async () => {
  renderEditor(null)

  await userEvent.type(screen.getByRole('textbox', { name: /name/i }), 'Neon noir')

  expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled()
})

it('carries the sparkle on the fragment field, and saves what it produced', async () => {
  apiMock
    // the enhance round-trip
    .mockResolvedValueOnce({ prompt: 'neon noir, rain-slicked streets, hard rim light' })
    .mockResolvedValueOnce(styleRow())
  renderEditor(null)

  await userEvent.type(screen.getByRole('textbox', { name: /name/i }), 'Neon noir')
  await userEvent.type(screen.getByRole('textbox', { name: /style fragment/i }), 'neon noir')
  await userEvent.click(screen.getByRole('button', { name: /enhance prompt/i }))

  const fragment = await screen.findByRole('textbox', { name: /style fragment/i })
  await waitFor(() => expect(fragment).toHaveValue('neon noir, rain-slicked streets, hard rim light'))

  await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
  await waitFor(() =>
    expect(String(apiMock.mock.calls.at(-1)?.[1]?.body)).toContain('hard rim light'),
  )
})

it('offers no preview while the style is still being typed', () => {
  renderEditor(null)

  expect(screen.queryByRole('button', { name: /generate preview/i })).not.toBeInTheDocument()
})

it('prices the preview from the model that will actually run it', async () => {
  renderEditor(styleRow({ recommendedModelId: 'flux-dev' }))

  expect(screen.getByRole('button', { name: /generate preview · 4 credits/i })).toBeInTheDocument()
})

it('prices the preview at the fallback model when the style recommends none', () => {
  renderEditor(styleRow({ recommendedModelId: null }))

  expect(screen.getByRole('button', { name: /generate preview · 1 credit/i })).toBeInTheDocument()
})

it('saves the open edits before spending a credit on the preview', async () => {
  const saved = styleRow({ fragment: 'sun-bleached super 8' })
  apiMock.mockResolvedValue(saved)
  const { onPreview } = renderEditor(styleRow())

  const fragment = screen.getByRole('textbox', { name: /style fragment/i })
  await userEvent.clear(fragment)
  await userEvent.type(fragment, 'sun-bleached super 8')
  await userEvent.click(screen.getByRole('button', { name: /generate preview/i }))

  // The PATCH lands FIRST, carrying the text on screen — otherwise the sample
  // would render the fragment the server last heard about
  await waitFor(() => expect(onPreview).toHaveBeenCalledWith(saved))
  expect(apiMock).toHaveBeenCalledWith('/api/styles/st1', {
    method: 'PATCH',
    body: expect.stringContaining('sun-bleached super 8'),
  })
})
