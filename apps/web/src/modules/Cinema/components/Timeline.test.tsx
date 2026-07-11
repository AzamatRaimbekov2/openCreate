// apps/web/src/modules/Cinema/components/Timeline.test.tsx
// Behavior of the film strip. The load-bearing assertion is a LAYOUT regression
// guard: "add shot" and "title card" used to live at the tail of the horizontally
// scrolling rail, so on a film with many shots the primary way to add a shot was
// scrolled off the right edge. They now belong to the timeline header and must
// stay OUT of the rail (the rail is the <ul> of shots) — that is what a real
// editor does, and what a keyboard user needs.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FilmDetail, Shot } from '@opencreate/contracts'
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
    modelId: null,
    durationMs: 4000,
    trimStartMs: 0,
    transition: 'none',
    transitionMs: 0,
    title: null,
    voiceover: null,
    createdAt: '2026-07-09T10:00:00.000Z',
    ...overrides,
  }
}

function makeFilm(shots: Shot[]): FilmDetail {
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
    audio: [],
  }
}

function renderTimeline(shots: Shot[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSelectShot = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <Timeline
        film={makeFilm(shots)}
        selectedShotId={null}
        onSelectShot={onSelectShot}
        onOpenStoryboard={vi.fn()}
      />
    </QueryClientProvider>,
  )
  return { onSelectShot }
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('Timeline', () => {
  it('keeps the add-shot controls reachable outside the scrolling shot rail', () => {
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

    // …while both add controls, and the storyboard CTA, stay in the header
    expect(screen.getByRole('button', { name: /add shot/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /title card/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /storyboard/i })).toBeInTheDocument()
  })

  it('offers the same controls on an empty film, next to the empty hint', () => {
    renderTimeline([])
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText(/no shots yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add shot/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /title card/i })).toBeInTheDocument()
  })

  it('adds a shot and selects it', async () => {
    apiMock.mockResolvedValue(makeShot({ id: 'new' }))
    const { onSelectShot } = renderTimeline([])

    await userEvent.click(screen.getByRole('button', { name: /add shot/i }))

    expect(apiMock).toHaveBeenCalledWith(
      '/api/films/film1/shots',
      expect.objectContaining({ method: 'POST' }),
    )
    await vi.waitFor(() => expect(onSelectShot).toHaveBeenCalledWith('new'))
  })

  it('adds a title card as a shot with title text', async () => {
    apiMock.mockResolvedValue(makeShot({ id: 'card' }))
    renderTimeline([])

    await userEvent.click(screen.getByRole('button', { name: /title card/i }))

    const [, init] = apiMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({
      generationId: null,
      title: { position: 'center' },
    })
  })
})
