// apps/web/src/modules/Cinema/components/ShotInspector.test.tsx
// Behavior of the docked shot composer (v6: the "Кадр" block became a fixed
// bottom bar). The load-bearing assertions:
//   * the prompt is ALWAYS on screen and editable; Save persists the draft;
//   * the quick tools (duration · model) live in the toolbar as compact pickers;
//   * everything else (cast, look presets, transition, title, voice) is behind
//     small toggles that reveal a drawer — nothing is lost, just folded;
//   * Generate never fires on an empty prompt.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogAudioModel, CatalogVideoModel, Shot } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { ShotInspector } from './ShotInspector'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot1',
    filmId: 'film1',
    orderIndex: 1,
    // null keeps useShotGeneration disabled — no polling in these tests
    generationId: null,
    prompt: 'a lighthouse in a storm',
    promptPreset: null,
    entityRefs: [],
    modelId: null,
    durationMs: 5000,
    trimStartMs: 0,
    transition: 'none',
    transitionMs: 0,
    title: null,
    voiceover: null,
    audio: false,
    createdAt: '2026-07-09T10:00:00.000Z',
    ...overrides,
  }
}

const videoModel: CatalogVideoModel = {
  id: 'wan-2-7',
  name: 'Wan 2.7',
  providerLabel: 'Alibaba',
  air: 'wan:2.7@1',
  tier: 'pro',
  type: 'video',
  supportsImageInput: false,
  // The cast panel's copy branches on this: with a reference-capable model and
  // an empty library it says "no characters yet" (the state the test asserts)
  referenceMode: 'subject',
  aspectRatios: ['16:9', '9:16'],
  durationOptions: [5, 10],
  creditsByDuration: { '5': 85, '10': 135 },
  // Audio-capable, priced separately — the toggle tests key off this
  nativeAudio: 'switchable',
  creditsByDurationWithAudio: { '5': 170, '10': 270 },
}

// The same model with NO audio capability — the toggle must disable, never 400
const silentModel: CatalogVideoModel = {
  id: 'minimax-hailuo',
  name: 'Motion',
  providerLabel: 'MiniMax',
  air: 'minimax:4@1',
  tier: 'standard',
  type: 'video',
  supportsImageInput: true,
  aspectRatios: ['16:9'],
  durationOptions: [6, 10],
  creditsByDuration: { '6': 35, '10': 60 },
}

const ttsModel: CatalogAudioModel = {
  id: 'inworld-tts',
  name: 'Inworld TTS',
  providerLabel: 'Runware',
  air: 'inworld:tts@2',
  tier: 'fast',
  type: 'audio',
  supportsImageInput: false,
  aspectRatios: ['1:1'],
  credits: 2,
  audioKind: 'tts',
  voices: ['Svetlana', 'Dmitry'],
}

function renderComposer(
  shot: Shot,
  options: { tts?: CatalogAudioModel; models?: CatalogVideoModel[] } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ShotInspector
        filmId="film1"
        shot={shot}
        filmAspect="16:9"
        videoModels={options.models ?? [videoModel]}
        ttsModel={options.tts}
        entities={[]}
        startMs={0}
        isVoiced={false}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('ShotInspector (docked composer)', () => {
  it('shows the shot prompt and saves an edited draft', async () => {
    apiMock.mockResolvedValue(makeShot())
    renderComposer(makeShot())

    const prompt = screen.getByRole('textbox', { name: /prompt/i })
    expect(prompt).toHaveValue('a lighthouse in a storm')

    await userEvent.type(prompt, ', at night')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(apiMock).toHaveBeenCalledWith(
      '/api/films/film1/shots/shot1',
      expect.objectContaining({ method: 'PATCH' }),
    )
    const [, init] = apiMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({
      prompt: 'a lighthouse in a storm, at night',
    })
  })

  it('keeps the duration slider and the model trigger in the toolbar', () => {
    renderComposer(makeShot())
    expect(screen.getByRole('slider', { name: /duration/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^model$/i })).toBeInTheDocument()
  })

  it('picks a model from the model dialog', async () => {
    renderComposer(makeShot(), { models: [videoModel, silentModel] })

    await userEvent.click(screen.getByRole('button', { name: /^model$/i }))
    const dialog = screen.getByRole('dialog', { name: /^model$/i })
    // Rich rows: name + honest provider label + description travel together
    expect(within(dialog).getByText('Alibaba')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: /motion/i }))
    // Picking closes the dialog and the trigger now wears the picked model
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^model$/i })).toHaveTextContent('Motion')
  })

  it('saves the duration picked on the slider', async () => {
    apiMock.mockResolvedValue(makeShot())
    renderComposer(makeShot()) // 5000ms → the 5s stop

    const slider = screen.getByRole('slider', { name: /duration/i })
    // Stops are [2, 3, 5, 8, 10] — index 4 is the 10s stop
    fireEvent.change(slider, { target: { value: '4' } })

    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    const [, init] = apiMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({ durationMs: 10_000 })
  })

  it('reveals the cast panel from its toolbar toggle', async () => {
    renderComposer(makeShot())

    const toggle = screen.getByRole('button', { name: /^cast$/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    // Folded: the cast copy is not on screen
    expect(screen.queryByText(/no characters yet/i)).toBeNull()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/no characters yet/i)).toBeInTheDocument()
  })

  it('reveals the full settings drawer from the expand toggle', async () => {
    renderComposer(makeShot())

    expect(screen.queryByText(/^look$/i)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /more settings/i }))

    expect(screen.getByText(/^look$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /transition/i })).toBeInTheDocument()
  })

  it('disables Generate until the prompt has content', () => {
    renderComposer(makeShot({ prompt: '' }))
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
  })

  it('grows the prompt by dragging its TOP edge up (keyboard mirror)', () => {
    renderComposer(makeShot())

    // The handle sits on the prompt's top edge: UP = grow (the dock is pinned
    // to the viewport bottom, so growth has nowhere to go but up)
    const grip = screen.getByRole('separator', { name: /prompt height/i })
    const before = Number(grip.getAttribute('aria-valuenow'))
    fireEvent.keyDown(grip, { key: 'ArrowUp' })
    expect(Number(grip.getAttribute('aria-valuenow'))).toBeGreaterThan(before)
    fireEvent.keyDown(grip, { key: 'ArrowDown' })
    expect(Number(grip.getAttribute('aria-valuenow'))).toBe(before)
  })

  it('toggles native generation audio and persists it with the draft', async () => {
    apiMock.mockResolvedValue(makeShot())
    renderComposer(makeShot())

    // Switchable model → the label carries the price; off by default
    const toggle = screen.getByRole('button', { name: /generation audio/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    const [, init] = apiMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({ audio: true })
  })

  it('disables the audio toggle when the model has no native audio', () => {
    renderComposer(makeShot(), { models: [silentModel] })
    expect(screen.getByRole('button', { name: /generation audio/i })).toBeDisabled()
  })

  it('offers the voice tool only when the catalog has a TTS model', () => {
    renderComposer(makeShot())
    expect(screen.queryByRole('button', { name: /spoken line/i })).toBeNull()
  })

  it('reveals the voice panel from its toolbar toggle when TTS exists', async () => {
    renderComposer(makeShot(), { tts: ttsModel })

    const toggle = screen.getByRole('button', { name: /spoken line/i })
    await userEvent.click(toggle)
    expect(screen.getByRole('textbox', { name: /what the character says/i })).toBeInTheDocument()
  })
})
