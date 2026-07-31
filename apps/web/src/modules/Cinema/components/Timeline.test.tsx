// apps/web/src/modules/Cinema/components/Timeline.test.tsx
// Behavior of the film strip. Two load-bearing groups:
//   * AUTHORING lives behind ONE "+" trigger that opens an actions dialog.
//     The trigger is a dashed tile riding the video lane (2026-07-17) — a
//     SIBLING of the shot <ul>, so the ACTIONS never sit inside the list
//     (the old regression: "add shot" scrolled off the right edge of an
//     8-shot film) and the listitem count stays "the shots".
//   * The strip is RESIZABLE via the keyboard-operable separator, surfaced
//     through aria-valuenow — the tests read the accessible value, not pixels
//     (the size Select died with the chrome row, 2026-07-17).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  CatalogAudioModel,
  FilmAudio,
  FilmDetail,
  Generation,
  Shot,
} from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { Timeline } from './Timeline'
import { useTimelineClock } from '../model/timelineClock'
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
    referenceImages: [],
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
      coverUrl: null,
      createdAt: '2026-07-09T10:00:00.000Z',
      updatedAt: '2026-07-09T10:00:00.000Z',
    },
    shots,
    audio,
    // The timeline does not read the render; null keeps the fixture honest about
    // a film nobody has exported yet.
    latestRender: null,
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
  options: {
    audio?: FilmAudio[]
    audioModels?: CatalogAudioModel[]
    selectedShotId?: string | null
  } = {},
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
        selectedShotId={options.selectedShotId ?? null}
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

// An audio generation in a chosen state — what POST /api/generations really
// returns (async: 202 `processing`) and what the lane's poll reads back.
function makeGeneration(status: Generation['status']): Generation {
  return {
    id: 'gen1',
    type: 'audio',
    mode: 'text',
    status,
    prompt: 'slow heavy strings',
    modelId: 'minimax-music',
    params: {},
    costCredits: 15,
    mediaUrls: status === 'succeeded' ? ['/media/gen1.mp3'] : [],
    errorMessage: null,
    createdAt: '2026-07-20T10:00:00.000Z',
    completedAt: null,
  }
}

// Open the "+" dialog, switch to the music mini-form, type a prompt, submit.
async function openMusicForm(prompt: string) {
  await chooseAction(/add music/i)
  const dialog = screen.getByRole('dialog', { name: /^add$/i })
  await userEvent.type(within(dialog).getByRole('textbox'), prompt)
  await userEvent.click(
    within(dialog).getByRole('button', { name: /voice it|generate|озвучить|сгенерир/i }),
  )
}

beforeEach(() => {
  apiMock.mockReset()
  // The clock is a singleton — reset it so a prior test's playhead never leaks.
  useTimelineClock.getState().reset()
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

  it('adds a music bed through the "+" dialog form — and ATTACHES it', async () => {
    // A path-ROUTING mock, not a blanket mockResolvedValue. The blanket version
    // this replaces resolved every call identically, so it could not tell the
    // charge apart from the attach — which is exactly how the 2026-07-20 bug
    // (attach rejected 100% of the time, after charging) hid in a green suite.
    // The generation is returned as `processing`, because that is what an async
    // audio job really returns; the attach must still be made and must succeed.
    apiMock.mockImplementation((path: string) => {
      if (path === '/api/generations') return Promise.resolve(makeGeneration('processing'))
      if (path === '/api/films/film1/audio') return Promise.resolve(makeTrack({ id: 'new' }))
      return Promise.reject(new Error(`unexpected path ${path}`))
    })
    renderTimeline([], { audioModels: [musicModel] })

    await openMusicForm('slow heavy strings')

    // Leg 1 — the charge
    expect(apiMock).toHaveBeenCalledWith(
      '/api/generations',
      expect.objectContaining({ method: 'POST' }),
    )
    // Leg 2 — THE ONE THAT WAS BROKEN. Assert the body, not just the call: the
    // track must cite the generation the charge just created.
    const attach = apiMock.mock.calls.find(([path]) => path === '/api/films/film1/audio')
    expect(attach).toBeDefined()
    expect(JSON.parse(String(attach?.[1]?.body))).toMatchObject({
      kind: 'music',
      generationId: 'gen1',
    })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows a localized error when the attach fails, instead of failing silently', async () => {
    // Before this, a failed attach left the dialog open with no feedback at all —
    // the spinner just stopped. Whatever the reason, the user must be told.
    apiMock.mockImplementation((path: string) => {
      if (path === '/api/generations') return Promise.resolve(makeGeneration('processing'))
      return Promise.reject(new ApiClientError('validation_failed', 'raw server text', 400))
    })
    renderTimeline([], { audioModels: [musicModel] })

    await openMusicForm('slow heavy strings')

    const alert = await screen.findByRole('alert')
    expect(alert).toBeInTheDocument()
    // Localized copy, never the server's own words
    expect(alert).not.toHaveTextContent('raw server text')
    // The form stays open so the attempt is not lost
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('marks a still-rendering track as pending on the lane', async () => {
    // This is what replaces the server-side status gate: a pending track is now
    // legal, so it must be VISIBLE as pending rather than looking finished.
    apiMock.mockImplementation((path: string) => {
      if (path === '/api/generations/gen-audio') {
        return Promise.resolve(makeGeneration('processing'))
      }
      return Promise.reject(new Error(`unexpected path ${path}`))
    })
    renderTimeline([makeShot({ id: 'a' })], { audio: [makeTrack({ id: 'm1' })] })

    expect(await screen.findByText(/rendering|готовится/i)).toBeInTheDocument()
  })

  it('marks a failed track as failed on the lane', async () => {
    // A failed track BLOCKS the export (buildPlan refuses it), so the lane has to
    // say so — otherwise the export stops for a reason nothing on screen explains.
    apiMock.mockImplementation((path: string) => {
      if (path === '/api/generations/gen-audio') return Promise.resolve(makeGeneration('failed'))
      return Promise.reject(new Error(`unexpected path ${path}`))
    })
    renderTimeline([makeShot({ id: 'a' })], { audio: [makeTrack({ id: 'm1' })] })

    expect(await screen.findByText(/failed|ошибка/i)).toBeInTheDocument()
  })

  it('shows no status chip once the track is ready', async () => {
    // Ready is the normal state and needs no decoration — a permanent badge on
    // every finished track is noise on a lane that is mostly finished tracks.
    apiMock.mockImplementation((path: string) => {
      if (path === '/api/generations/gen-audio') return Promise.resolve(makeGeneration('succeeded'))
      return Promise.reject(new Error(`unexpected path ${path}`))
    })
    renderTimeline([makeShot({ id: 'a' })], { audio: [makeTrack({ id: 'm1' })] })

    await screen.findByText(/music|музык/i)
    expect(screen.queryByText(/rendering|готовится/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^failed$|^ошибка$/i)).not.toBeInTheDocument()
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

// The v8 NLE spine: the tiles, the ruler and the playhead all hang off the one
// timeline clock. Clicking a tile jumps the playhead to that shot; the ruler is a
// scrub slider; both are read back through the slider's aria-valuenow so the tests
// assert TIME, not pixels.
describe('Timeline — playhead & seek', () => {
  it('seeks the playhead to a shot start AND selects it when a tile is clicked', async () => {
    const { onSelectShot } = renderTimeline([
      makeShot({ id: 'a', orderIndex: 1, durationMs: 4000 }),
      makeShot({ id: 'b', orderIndex: 2, durationMs: 6000 }),
    ])

    await userEvent.click(screen.getByRole('button', { name: /select shot 2/i }))

    // Selection still fires (composer), and the clock jumps to shot b's start.
    expect(onSelectShot).toHaveBeenCalledWith('b')
    expect(useTimelineClock.getState().playheadMs).toBe(4000)
  })

  it('scrubs to a time when the ruler slider is dragged', () => {
    renderTimeline([makeShot({ id: 'a', durationMs: 4000 }), makeShot({ id: 'b', durationMs: 6000 })])

    const slider = screen.getByRole('slider', { name: /seek|перемот/i })
    // jsdom rects are zero-origin, so clientX maps straight through PX_PER_SEC=24:
    // 48px → 2000ms.
    fireEvent.pointerDown(slider, { clientX: 48, pointerId: 1 })

    expect(useTimelineClock.getState().playheadMs).toBe(2000)
    expect(slider).toHaveAttribute('aria-valuenow', '2000')
    // The slider spans the whole film (10s), so the max is the film length.
    expect(slider).toHaveAttribute('aria-valuemax', '10000')
  })

  it('nudges the playhead from the keyboard on the ruler slider', () => {
    renderTimeline([makeShot({ id: 'a', durationMs: 4000 }), makeShot({ id: 'b', durationMs: 6000 })])

    const slider = screen.getByRole('slider', { name: /seek|перемот/i })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(useTimelineClock.getState().playheadMs).toBe(1000)
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(useTimelineClock.getState().playheadMs).toBe(0)
  })
})

// Phase 2: 10-minute-film ergonomics — zoom (px/sec) drives the shared scale and
// the ruler shows real timecodes. The math lives in the store/geometry (tested
// there); here we pin the toolbar wiring and that the ruler renders labels.
describe('Timeline — zoom & ruler', () => {
  it('zooms the scale in and out from the toolbar', async () => {
    renderTimeline([makeShot({ id: 'a', durationMs: 6000 })])

    await userEvent.click(screen.getByRole('button', { name: /zoom in|приблиз/i }))
    expect(useTimelineClock.getState().zoom).toBe(36) // 24 × 1.5
    await userEvent.click(screen.getByRole('button', { name: /zoom out|отдал/i }))
    expect(useTimelineClock.getState().zoom).toBe(24) // 36 / 1.5
  })

  it('fits the film to the strip (an unmeasured strip falls back to the default scale)', async () => {
    renderTimeline([makeShot({ id: 'a', durationMs: 6000 })])

    await userEvent.click(screen.getByRole('button', { name: /zoom in|приблиз/i }))
    expect(useTimelineClock.getState().zoom).toBe(36)
    // jsdom does not lay out, so the measured strip width is 0 → fit → default.
    await userEvent.click(screen.getByRole('button', { name: /fit|вместить/i }))
    expect(useTimelineClock.getState().zoom).toBe(24)
  })

  it('labels the ruler with m:ss timecodes', () => {
    renderTimeline([makeShot({ id: 'a', durationMs: 12_000 })])

    // Default zoom 24 → a 5s tick interval → 0:00, 0:05, 0:10.
    expect(screen.getByText('0:05')).toBeInTheDocument()
    expect(screen.getByText('0:10')).toBeInTheDocument()
  })
})

// Phase 3: on-timeline editing. The drag DECISIONS are pure (geometry tests); here
// we pin the WIRING — a pointer drag on a tile's edge/grip → the existing PATCH /
// reorder mutation with the right payload, and no leaked window listeners.
describe('Timeline — trim & reorder', () => {
  it('trims a shot out-point via the right handle and PATCHes the new duration', async () => {
    apiMock.mockResolvedValue(makeShot({ id: 'a', durationMs: 7000 }))
    renderTimeline([makeShot({ id: 'a', durationMs: 5000, trimStartMs: 0 })])

    const handle = screen.getByRole('button', { name: /trim out-point of shot 1|обрезать конец кадра 1/i })
    fireEvent.pointerDown(handle, { clientX: 200 })
    // +48px at zoom 24 = +2000ms; the up event drives the commit.
    fireEvent.pointerUp(window, { clientX: 248 })

    await waitFor(() => {
      const patch = apiMock.mock.calls.find(
        ([path, init]) => path === '/api/films/film1/shots/a' && init?.method === 'PATCH',
      )
      expect(patch).toBeDefined()
      expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ trimStartMs: 0, durationMs: 7000 })
    })
  })

  it('reorders shots by dragging the grip and POSTs the moved order', async () => {
    apiMock.mockResolvedValue({ items: [] })
    renderTimeline([
      makeShot({ id: 'a', durationMs: 5000 }),
      makeShot({ id: 'b', durationMs: 5000 }),
      makeShot({ id: 'c', durationMs: 5000 }),
    ])

    // Each tile is 120px (5s × 24px/s); dragging shot 1's grip to x=260 lands past
    // tile 1's midpoint → slot 2 → [b, c, a].
    const grip = screen.getByRole('button', { name: /reorder shot 1|переставить кадр 1/i })
    fireEvent.pointerDown(grip, { clientX: 0 })
    fireEvent.pointerUp(window, { clientX: 260 })

    await waitFor(() => {
      const call = apiMock.mock.calls.find(([path]) => path === '/api/films/film1/shots/reorder')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ shotIds: ['b', 'c', 'a'] })
    })
  })

  it('removes its drag window-listeners when the drag ends (no leak)', () => {
    apiMock.mockResolvedValue(makeShot({ id: 'a' }))
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    renderTimeline([makeShot({ id: 'a', durationMs: 5000, trimStartMs: 0 })])

    const handle = screen.getByRole('button', { name: /trim out-point of shot 1|обрезать конец кадра 1/i })
    fireEvent.pointerDown(handle, { clientX: 200 })
    fireEvent.pointerUp(window, { clientX: 248 })

    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))
    removeSpy.mockRestore()
  })
})

// Phase 4: split-at-playhead. The scissors button targets the SELECTED shot and is
// enabled only when the playhead sits strictly inside it (the pure `splitTargetAt`
// decision is geometry-tested; here we pin the button wiring + the atMs it sends).
describe('Timeline — split at playhead', () => {
  it('splits the selected shot at the playhead offset', async () => {
    apiMock.mockResolvedValue({ film: {}, shots: [], audio: [], latestRender: null })
    renderTimeline([makeShot({ id: 'a', durationMs: 4000 }), makeShot({ id: 'b', durationMs: 6000 })], {
      selectedShotId: 'b',
    })

    // Move the playhead 2000ms into shot b (b spans [4000, 10000]).
    act(() => useTimelineClock.getState().seek(6000, 10_000))
    await userEvent.click(screen.getByRole('button', { name: /split at playhead|разрезать/i }))

    await waitFor(() => {
      const call = apiMock.mock.calls.find(([path]) => path === '/api/films/film1/shots/b/split')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ atMs: 2000 })
    })
  })

  it('disables the split control on a shot boundary', () => {
    renderTimeline([makeShot({ id: 'a', durationMs: 4000 }), makeShot({ id: 'b', durationMs: 6000 })], {
      selectedShotId: 'b',
    })
    // The playhead is parked at 0 (reset) — b's boundary is at 4000, so there is
    // nothing to split inside the selected shot.
    expect(screen.getByRole('button', { name: /split at playhead|разрезать/i })).toBeDisabled()
  })
})
