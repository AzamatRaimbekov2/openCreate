// apps/web/src/modules/Cinema/components/Timeline.test.tsx
// Behavior of the film strip. Two load-bearing groups:
//   * AUTHORING lives behind ONE "+" trigger that opens an actions dialog —
//     the strip band stays clean, and none of the actions ever sit inside the
//     horizontally scrolling rail (the old regression: "add shot" scrolled off
//     the right edge of an 8-shot film).
//   * The strip is RESIZABLE: a size Select with three presets and a keyboard-
//     operable separator drive one height value, surfaced via aria-valuenow —
//     the tests read the accessible value, not pixels.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogAudioModel, FilmAudio, FilmDetail, Shot } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { Timeline } from './Timeline'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function makeShot(overrides: Partial<Shot>): Shot {
  return {
    id: 'shot1',
    filmId: 'film1',
    orderIndex: 1,
    // null keeps useShotGeneration disabled — the thumbs make no requests here
    generationId: null,
    prompt: '',
    promptPreset: null,
    entityRefs: [],
    modelId: null,
    durationMs: 4000,
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

function makeFilm(shots: Shot[], audio: FilmAudio[] = []): FilmDetail {
  return {
    film: {
      id: 'film1',
      title: 'Neon Drift',
      aspectRatio: '16:9',
      defaultStyleId: null,
      templateId: null,
      createdAt: '2026-07-09T10:00:00.000Z',
      updatedAt: '2026-07-09T10:00:00.000Z',
    },
    shots,
    audio,
  }
}

const musicModel: CatalogAudioModel = {
  id: 'minimax-music',
  name: 'Score',
  providerLabel: 'MiniMax',
  air: 'minimax:music@2.6',
  tier: 'standard',
  type: 'audio',
  supportsImageInput: false,
  aspectRatios: ['1:1'],
  credits: 15,
  audioKind: 'music',
}

function makeTrack(overrides: Partial<FilmAudio>): FilmAudio {
  return {
    id: 'a1',
    filmId: 'film1',
    kind: 'music',
    generationId: 'gen-audio',
    shotId: null,
    startMs: 0,
    gainDb: 0,
    ...overrides,
  }
}

function renderTimeline(
  shots: Shot[],
  options: { audio?: FilmAudio[]; audioModels?: CatalogAudioModel[] } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSelectShot = vi.fn()
  const onOpenStoryboard = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <Timeline
        film={makeFilm(shots, options.audio ?? [])}
        audioModels={options.audioModels ?? []}
        musicPrompt={null}
        selectedShotId={null}
        onSelectShot={onSelectShot}
        onOpenStoryboard={onOpenStoryboard}
      />
    </QueryClientProvider>,
  )
  return { onSelectShot, onOpenStoryboard }
}

// The "+" trigger, then the action row inside the opened dialog
async function chooseAction(name: RegExp) {
  await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
  const dialog = screen.getByRole('dialog', { name: /^add$/i })
  await userEvent.click(within(dialog).getByRole('button', { name }))
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('Timeline', () => {
  it('keeps ALL authoring behind the "+" dialog, never inside the scrolling rail', async () => {
    renderTimeline([
      makeShot({ id: 'a', orderIndex: 1 }),
      makeShot({ id: 'b', orderIndex: 2 }),
      makeShot({ id: 'c', orderIndex: 3 }),
    ])

    // The rail is the list of shots — the only thing that scrolls sideways
    const rail = screen.getByRole('list')
    expect(within(rail).getAllByRole('listitem')).toHaveLength(3)
    expect(within(rail).queryByRole('button', { name: /add shot/i })).toBeNull()
    expect(within(rail).queryByRole('button', { name: /title card/i })).toBeNull()

    // Collapsed: only the "+" trigger is visible, no action buttons on screen
    expect(screen.queryByRole('button', { name: /add shot/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /storyboard/i })).toBeNull()

    // Open the dialog — all three actions are there
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    const dialog = screen.getByRole('dialog', { name: /^add$/i })
    expect(within(dialog).getByRole('button', { name: /add shot/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /title card/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /storyboard/i })).toBeInTheDocument()
  })

  it('offers the same "+" dialog on an empty film, next to the empty hint', () => {
    renderTimeline([])
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText(/no shots yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument()
  })

  it('adds a shot from the dialog and selects it', async () => {
    apiMock.mockResolvedValue(makeShot({ id: 'new' }))
    const { onSelectShot } = renderTimeline([])

    await chooseAction(/add shot/i)

    expect(apiMock).toHaveBeenCalledWith(
      '/api/films/film1/shots',
      expect.objectContaining({ method: 'POST' }),
    )
    await vi.waitFor(() => expect(onSelectShot).toHaveBeenCalledWith('new'))
    // Choosing an action closes the dialog — no stacked modal left behind
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('adds a title card as a shot with title text', async () => {
    apiMock.mockResolvedValue(makeShot({ id: 'card' }))
    renderTimeline([])

    await chooseAction(/title card/i)

    const [, init] = apiMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({
      generationId: null,
      title: { position: 'center' },
    })
  })

  it('hands storyboard off to the editor and closes the dialog', async () => {
    const { onOpenStoryboard } = renderTimeline([])

    await chooseAction(/storyboard/i)

    expect(onOpenStoryboard).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // The audio lane is the v7 point: sound is a TRACK under the footage, on the
  // same clock, deletable in place — not a sidebar list.
  it('renders the audio lane with named tracks and deletes one in place', async () => {
    apiMock.mockResolvedValue(undefined)
    renderTimeline([makeShot({ id: 'a', durationMs: 5000 })], {
      audio: [
        makeTrack({ id: 'm1', kind: 'music' }),
        makeTrack({ id: 'v1', kind: 'voiceover', shotId: 'a', startMs: 0 }),
      ],
    })

    // The music bed and the beat-named voiceover are both on the lane
    expect(screen.getByText(/music|музык/i)).toBeInTheDocument()
    expect(screen.getByText(/beat 1|бит 1/i)).toBeInTheDocument()

    const removeButtons = screen.getAllByRole('button', { name: /remove|убрать/i })
    await userEvent.click(removeButtons[0]!)
    expect(apiMock).toHaveBeenCalledWith(
      '/api/films/film1/audio/m1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('adds a music bed through the "+" dialog form', async () => {
    apiMock.mockResolvedValue({ id: 'gen1' })
    renderTimeline([], { audioModels: [musicModel] })

    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    const dialog = screen.getByRole('dialog', { name: /^add$/i })
    await userEvent.click(within(dialog).getByRole('button', { name: /add music/i }))

    // The dialog switched to the mini-form instead of closing
    const prompt = within(dialog).getByRole('textbox')
    await userEvent.type(prompt, 'slow heavy strings')
    await userEvent.click(within(dialog).getByRole('button', { name: /voice it|generate|озвучить|сгенерир/i }))

    // One charged action: the audio generation first, then the track link
    expect(apiMock).toHaveBeenCalledWith(
      '/api/generations',
      expect.objectContaining({ method: 'POST' }),
    )
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('resizes via the size preset select', async () => {
    renderTimeline([makeShot({ id: 'a' })])

    // Medium is the default — the separator announces its value
    const separator = screen.getByRole('separator', { name: /strip height/i })
    expect(separator).toHaveAttribute('aria-valuenow', '64')

    await userEvent.click(screen.getByRole('button', { name: /size/i }))
    await userEvent.click(screen.getByRole('option', { name: /small/i }))
    expect(separator).toHaveAttribute('aria-valuenow', '48')

    await userEvent.click(screen.getByRole('button', { name: /size/i }))
    await userEvent.click(screen.getByRole('option', { name: /large/i }))
    expect(separator).toHaveAttribute('aria-valuenow', '88')
  })

  it('resizes from the keyboard on the separator', () => {
    renderTimeline([makeShot({ id: 'a' })])

    const separator = screen.getByRole('separator', { name: /strip height/i })
    fireEvent.keyDown(separator, { key: 'ArrowDown' })
    expect(separator).toHaveAttribute('aria-valuenow', '72')
    fireEvent.keyDown(separator, { key: 'ArrowUp' })
    expect(separator).toHaveAttribute('aria-valuenow', '64')
  })
})
