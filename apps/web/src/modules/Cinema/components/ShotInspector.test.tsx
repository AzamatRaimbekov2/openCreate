// apps/web/src/modules/Cinema/components/ShotInspector.test.tsx
// Behavior of the docked shot composer (v6: the "Кадр" block became a fixed
// bottom bar). The load-bearing assertions:
//   * the prompt is ALWAYS on screen and editable; Save persists the draft;
//   * the quick tools (duration · model) live in the toolbar as compact pickers;
//   * everything else (cast, look presets, transition, title, voice) is behind
//     small toggles that reveal a drawer — nothing is lost, just folded;
//   * Generate never fires on an empty prompt.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogAudioModel, CatalogVideoModel, Shot, Style } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { ShotInspector } from './ShotInspector'
import type { CastableEntity } from './ShotCastField'
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
    referenceImages: [],
    modelId: null,
    aspectRatio: null,
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

// A style that PINS a model: the catalog entry recommends one, so choosing this
// style must take the model decision out of the user's hands (it is "already
// configured under the hood").
function style(overrides: Partial<Style> & Pick<Style, 'id' | 'name'>): Style {
  return {
    kind: 'prompt',
    builtin: false,
    fragment: 'neon rain, anamorphic flare',
    negative: '',
    recommendedModelId: null,
    previewUrl: null,
    referenceImages: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

function renderComposer(
  shot: Shot,
  options: {
    tts?: CatalogAudioModel
    models?: CatalogVideoModel[]
    entities?: CastableEntity[]
    styles?: Style[]
  } = {},
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
        entities={options.entities ?? []}
        styles={options.styles ?? []}
        startMs={0}
        isVoiced={false}
      />
    </QueryClientProvider>,
  )
}

// The look chips live in the expand drawer; every test below has to open it first
async function openLookDrawer() {
  await userEvent.click(screen.getByRole('button', { name: /more settings/i }))
}

async function pickFromChip(chip: RegExp, option: RegExp | string) {
  await userEvent.click(screen.getByRole('button', { name: chip }))
  await userEvent.click(screen.getByRole('menuitem', { name: option }))
}

// The body of the first PATCH — what Save actually persisted
function savedBody() {
  const patch = apiMock.mock.calls.find((call) => call[1]?.method === 'PATCH')
  return JSON.parse(String(patch?.[1]?.body))
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
    // Folded: the drawer content (the reference-images attach group) is not on
    // screen. There are no section captions any more, so we key off the control
    // that always renders — ShotReferenceImages' own role=group.
    expect(screen.queryByRole('group', { name: /reference images/i })).toBeNull()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    // Opened: the reference-images attach group renders inside the drawer
    expect(screen.getByRole('group', { name: /reference images/i })).toBeInTheDocument()
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

  // ── Inline "@" mention picker ────────────────────────────────────────────────
  // The prompt textarea speaks the same "@" protocol as the /create composer:
  // typing "@" pops a picker over the CAST-ABLE characters AND the shot's
  // attached photos, and picking splices an opaque [[eN]] token at the caret.

  it('tags a character from the inline "@" picker at the caret', async () => {
    apiMock.mockResolvedValue(makeShot())
    renderComposer(makeShot(), { entities: [{ id: 'ent1', name: 'Fox', imageUrl: null }] })

    const prompt = screen.getByRole('textbox', { name: /prompt/i })
    await userEvent.type(prompt, ' @fo')

    // The picker is open and offers the matching character
    const listbox = screen.getByRole('listbox', { name: /tag a photo/i })
    expect(within(listbox).getByRole('option', { name: /fox/i })).toBeInTheDocument()

    // Enter picks the highlighted row: the "@fo" run becomes the [[e1]] token
    await userEvent.keyboard('{Enter}')
    expect(prompt).toHaveValue('a lighthouse in a storm [[e1]] ')
    expect(screen.queryByRole('listbox')).toBeNull()

    // The tag rides the draft to the wire as a live entity ref
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    const [, init] = apiMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({
      prompt: 'a lighthouse in a storm [[e1]]',
      entityRefs: [{ placeholder: 'e1', entityId: 'ent1' }],
    })
  })

  it('closes the inline "@" picker on Escape without touching the prompt', async () => {
    renderComposer(makeShot(), { entities: [{ id: 'ent1', name: 'Fox', imageUrl: null }] })

    const prompt = screen.getByRole('textbox', { name: /prompt/i })
    await userEvent.type(prompt, ' @')
    expect(screen.getByRole('listbox', { name: /tag a photo/i })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(prompt).toHaveValue('a lighthouse in a storm @')
  })

  it('names an attached photo into the cast from the inline "@" picker', async () => {
    // Three channels through the one api mock: the character SHELL, its reference
    // PHOTO, and the raw ref DELETE — same seams the PersonIcon bridge uses.
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/entities' && init?.method === 'POST') {
        return Promise.resolve({ id: 'e9', kind: 'character', name: 'Girl', primaryImageId: null })
      }
      if (path === '/api/entities/e9/images' && init?.method === 'POST') {
        return Promise.resolve({ id: 'e9', kind: 'character', name: 'Girl', primaryImageId: 'img1' })
      }
      return Promise.resolve(makeShot())
    })
    // The create fetches the /media bytes → blob → data URI
    const blob = new Blob(['png-bytes'], { type: 'image/png' })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }),
    )
    renderComposer(makeShot({ referenceImages: [{ id: 'r1', path: '/media/r1.png' }] }))

    const prompt = screen.getByRole('textbox', { name: /prompt/i })
    await userEvent.type(prompt, ' @')

    // The attached photo shows up as a picker row; picking it asks for a name
    await userEvent.click(screen.getByRole('option', { name: /photo 1/i }))
    await userEvent.type(screen.getByLabelText(/character name/i), 'Girl')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    // The fresh character lands where the "@" was typed…
    await waitFor(() => expect(prompt).toHaveValue('a lighthouse in a storm [[e1]] '))
    // …and the raw ref is removed so the image is never sent twice
    expect(apiMock).toHaveBeenCalledWith(
      '/api/films/film1/shots/shot1/references/r1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

// ── Per-shot aspect ratio ────────────────────────────────────────────────────
// New in 2026-08-02: a shot may be generated in its OWN shape (a vertical insert
// inside a widescreen film). null = no opinion → the film canvas, which is what
// every shot did before this control existed. The render scales/pads to the film
// canvas either way, so this only decides the shape of the RAW clip.
describe('ShotInspector · per-shot aspect ratio', () => {
  it('saves the shot own aspect override', async () => {
    apiMock.mockResolvedValue(makeShot())
    renderComposer(makeShot())

    await openLookDrawer()
    await pickFromChip(/shot aspect ratio/i, '9:16')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(savedBody()).toMatchObject({ aspectRatio: '9:16' })
  })

  // null travels as a real PATCH value — "clear the override", not "leave alone"
  it('clears an override back to the film canvas', async () => {
    apiMock.mockResolvedValue(makeShot())
    renderComposer(makeShot({ aspectRatio: '1:1' }))

    await openLookDrawer()
    await pickFromChip(/shot aspect ratio/i, /same as film/i)
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(savedBody().aspectRatio).toBeNull()
  })

  it('opens on the shot stored override', async () => {
    renderComposer(makeShot({ aspectRatio: '9:16' }))
    await openLookDrawer()

    expect(screen.getByRole('button', { name: /shot aspect ratio/i })).toHaveAttribute(
      'title',
      expect.stringContaining('9:16'),
    )
  })

  // The money path: the override must reach the GENERATION request, not just the
  // saved row — otherwise the control is decoration.
  it('generates the clip in the shot own shape, not the film canvas', async () => {
    apiMock.mockImplementation((path: string) =>
      path === '/api/generations'
        ? Promise.resolve({ id: 'gen1', status: 'processing' })
        : Promise.resolve(makeShot()),
    )
    // The film is 16:9 (renderComposer), the shot asks for 9:16, the model offers both
    renderComposer(makeShot({ aspectRatio: '9:16' }))

    await userEvent.click(screen.getByRole('button', { name: /generate/i }))

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        '/api/generations',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const submit = apiMock.mock.calls.find(([path]) => path === '/api/generations')
    expect(JSON.parse(String((submit?.[1] as RequestInit | undefined)?.body))).toMatchObject({
      aspectRatio: '9:16',
    })
  })
})

// ── Style → model lock ───────────────────────────────────────────────────────
// A style whose catalog entry recommends a model has already made the model
// decision "under the hood" (owner, 2026-08-02). While such a style is active the
// model picker is not a choice, so it must not pretend to be one. The lock is
// REACTIVE — it follows the style picker live, not just at shot creation.
describe('ShotInspector · style locks the model', () => {
  const lockingStyle = style({
    id: 'uuid-neon',
    name: 'Neon noir',
    recommendedModelId: 'minimax-hailuo',
  })

  it('pins the model to the style recommendation and disables the picker', async () => {
    renderComposer(makeShot(), { models: [videoModel, silentModel], styles: [lockingStyle] })

    const trigger = screen.getByRole('button', { name: /^model$/i })
    expect(trigger).toHaveTextContent('Wan 2.7')
    expect(trigger).toBeEnabled()

    await openLookDrawer()
    await pickFromChip(/^style$/i, 'Neon noir')

    expect(trigger).toHaveTextContent('Motion')
    expect(trigger).toBeDisabled()
    // …and it says WHY, naming the style that took the decision
    expect(trigger).toHaveAttribute('title', expect.stringContaining('Neon noir'))
  })

  it('hands the model back when the style is cleared', async () => {
    renderComposer(makeShot({ promptPreset: { styleId: 'uuid-neon' } }), {
      models: [videoModel, silentModel],
      styles: [lockingStyle],
    })

    await openLookDrawer()
    expect(screen.getByRole('button', { name: /^model$/i })).toBeDisabled()

    await pickFromChip(/^style$/i, /no style/i)
    expect(screen.getByRole('button', { name: /^model$/i })).toBeEnabled()
  })

  // THE LOCK SHADOWS, IT DOES NOT OVERWRITE. A user who hand-picked a model, then
  // tried a recommending style, then dropped that style, gets THEIR model back —
  // not the recommendation, and not the catalog's first row.
  it('restores the user own pick once the lock lifts', async () => {
    // This style recommends the OTHER model, so the lock and the hand-pick differ
    const wanStyle = style({ id: 'uuid-wan', name: 'Wan look', recommendedModelId: 'wan-2-7' })
    renderComposer(makeShot(), { models: [videoModel, silentModel], styles: [wanStyle] })

    // A deliberate hand-pick first: Motion is not the default (Wan 2.7 is)
    await userEvent.click(screen.getByRole('button', { name: /^model$/i }))
    await userEvent.click(
      within(screen.getByRole('dialog', { name: /^model$/i })).getByRole('button', {
        name: /motion/i,
      }),
    )
    expect(screen.getByRole('button', { name: /^model$/i })).toHaveTextContent('Motion')

    // A style that recommends Wan 2.7 takes over…
    await openLookDrawer()
    await pickFromChip(/^style$/i, 'Wan look')
    expect(screen.getByRole('button', { name: /^model$/i })).toHaveTextContent('Wan 2.7')

    // …and dropping it must return the user's own choice, not the recommendation
    await pickFromChip(/^style$/i, /no style/i)
    expect(screen.getByRole('button', { name: /^model$/i })).toHaveTextContent('Motion')
  })

  it('ignores a recommendation this catalog does not offer', async () => {
    renderComposer(makeShot(), {
      models: [videoModel],
      styles: [style({ id: 'uuid-x', name: 'Ghost', recommendedModelId: 'not-in-catalog' })],
    })

    await openLookDrawer()
    await pickFromChip(/^style$/i, 'Ghost')

    // No usable recommendation → the user keeps the decision
    const trigger = screen.getByRole('button', { name: /^model$/i })
    expect(trigger).toBeEnabled()
    expect(trigger).toHaveTextContent('Wan 2.7')
  })
})
