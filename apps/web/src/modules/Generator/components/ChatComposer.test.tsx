// apps/web/src/modules/Generator/components/ChatComposer.test.tsx
// Behavior of the docked /create composer's IMAGE-ATTACH gestures. Click already
// worked (AttachImage); this covers the owner's ask that a screenshot PASTE and a
// drag-DROP onto the composer set the same inputImage, through the one shared
// readImageFile gate. Only exercised when the selected model can take an image.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { CatalogModel } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { useGeneratorStore } from '../model/generatorStore'
import { ChatComposer } from './ChatComposer'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

// A video model that takes an image reference — the only case where the attach
// affordance (and thus paste/drop) is live.
const i2vModel: CatalogModel = {
  id: 'pixverse-v6',
  type: 'video',
  name: 'Swift',
  providerLabel: 'PixVerse V6',
  air: 'pixverse:1@8',
  tier: 'standard',
  supportsImageInput: true,
  aspectRatios: ['16:9', '1:1', '9:16'],
  durationOptions: [5, 8],
  creditsByDuration: { '5': 35, '8': 56 },
}

function renderComposer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatComposer />
    </QueryClientProvider>,
  )
}

type Taggable = { id: string; name: string; imageUrl?: string | null }
function renderComposerWith(taggableEntities: Taggable[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatComposer taggableEntities={taggableEntities} />
    </QueryClientProvider>,
  )
}

const pngFile = () => new File(['fake-bytes'], 'screenshot.png', { type: 'image/png' })

beforeEach(() => {
  apiMock.mockReset()
  apiMock.mockImplementation((path) => {
    if (path === '/api/catalog') return Promise.resolve({ models: [i2vModel] })
    return Promise.reject(new Error(`unexpected call ${String(path)}`))
  })
  // Reset the module-singleton store so a prior test's inputImage cannot leak
  useGeneratorStore.setState({
    models: [],
    type: 'image',
    modelId: null,
    prompt: '',
    aspectRatio: '1:1',
    duration: undefined,
    inputImage: null,
    mentions: [],
  })
})

describe('ChatComposer image attach (paste + drop)', () => {
  it('accepts a pasted screenshot as the composer input image', async () => {
    renderComposer()
    // Wait for the catalog → the attach affordance mounts only for an i2v model
    await screen.findByRole('button', { name: /animate an image/i })

    const textarea = screen.getByRole('textbox')
    fireEvent.paste(textarea, { clipboardData: { files: [pngFile()] } })

    // The chip replaces the "+" once the store has the data URI
    expect(await screen.findByRole('img', { name: /uploaded reference image/i })).toBeInTheDocument()
    expect(useGeneratorStore.getState().inputImage).toMatch(/^data:image\//)
  })

  it('accepts an image dropped onto the composer', async () => {
    renderComposer()
    const region = await screen.findByRole('region', { name: /create|создать|создай/i })

    fireEvent.drop(region, { dataTransfer: { files: [pngFile()] } })

    expect(await screen.findByRole('img', { name: /uploaded reference image/i })).toBeInTheDocument()
  })

  it('ignores a pasted screenshot when the model cannot take an image', async () => {
    // A text/image model with no image input: paste must NOT set an input image.
    apiMock.mockImplementation((path) => {
      if (path === '/api/catalog')
        return Promise.resolve({ models: [{ ...i2vModel, supportsImageInput: false }] })
      return Promise.reject(new Error(`unexpected call ${String(path)}`))
    })
    renderComposer()
    const region = await screen.findByRole('region', { name: /create|создать|создай/i })

    fireEvent.paste(region, { clipboardData: { files: [pngFile()] } })

    // No attach affordance, and the store stays clean
    expect(screen.queryByLabelText(/animate an image/i)).toBeNull()
    expect(useGeneratorStore.getState().inputImage).toBeNull()
  })
})

describe('ChatComposer inline @ mention picker', () => {
  const boran: Taggable = { id: 'e-1', name: 'Boran', imageUrl: null }

  it('opens a listbox of entities when you type @', async () => {
    renderComposerWith([boran])
    const textarea = await screen.findByRole('textbox')
    fireEvent.change(textarea, { target: { value: '@', selectionStart: 1 } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Boran/ })).toBeInTheDocument()
  })

  it('filters the list by the text typed after @', async () => {
    renderComposerWith([boran, { id: 'e-2', name: 'Zara' }])
    const textarea = await screen.findByRole('textbox')
    fireEvent.change(textarea, { target: { value: '@bo', selectionStart: 3 } })
    expect(screen.getByRole('option', { name: /Boran/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Zara/ })).toBeNull()
  })

  it('inserts the entity token and registers the mention on select', async () => {
    renderComposerWith([boran])
    const textarea = await screen.findByRole('textbox')
    fireEvent.change(textarea, { target: { value: '@Bo', selectionStart: 3 } })
    // onMouseDown is what selects (keeps textarea focus) — mirror it in the test
    fireEvent.mouseDown(screen.getByRole('option', { name: /Boran/ }))
    expect(useGeneratorStore.getState().prompt).toContain('[[e1]]')
    expect(useGeneratorStore.getState().mentions).toEqual([{ placeholder: 'e1', entityId: 'e-1' }])
  })

  it('Enter picks the highlighted entity instead of submitting', async () => {
    renderComposerWith([boran])
    const textarea = await screen.findByRole('textbox')
    fireEvent.change(textarea, { target: { value: '@Bo', selectionStart: 3 } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(useGeneratorStore.getState().prompt).toContain('[[e1]]')
  })

  it('does not open when the entity library is empty', async () => {
    renderComposerWith([])
    const textarea = await screen.findByRole('textbox')
    fireEvent.change(textarea, { target: { value: '@', selectionStart: 1 } })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
