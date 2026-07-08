// apps/web/src/modules/Generator/components/ModelSelect.test.tsx
// Behavior of the custom model listbox: the trigger shows the selected model
// (logo + name + provider + credit price); opening lists ALL catalog models
// grouped Images/Video, each with name, provider label, tier, tariff (cr + $)
// and a localized description; full keyboard nav (arrows/Enter/Esc/Home/End/
// typeahead) selects and manages focus; click-outside closes; and the catalog
// query drives the four states (loading / error / empty / data).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogModel } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { ModelSelect } from './ModelSelect'
// i18n init — the component renders localized labels itself
import 'shared/config/i18n'

// Mock ONLY api(); the real ApiClientError class must survive for instanceof
vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

// The full catalog (mirror of apps/api catalog.ts) — the select shows all eight
const models: CatalogModel[] = [
  {
    id: 'flux-schnell',
    type: 'image',
    name: 'Flash',
    providerLabel: 'FLUX schnell',
    air: 'runware:100@1',
    tier: 'fast',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 1,
  },
  {
    id: 'flux-dev',
    type: 'image',
    name: 'Studio',
    providerLabel: 'FLUX dev',
    air: 'runware:101@1',
    tier: 'quality',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 2,
  },
  {
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
  },
  {
    id: 'minimax-hailuo',
    type: 'video',
    name: 'Motion',
    providerLabel: 'MiniMax Hailuo 2.3',
    air: 'minimax:4@1',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9'],
    durationOptions: [6, 10],
    creditsByDuration: { '6': 35, '10': 60 },
  },
  {
    id: 'seedance-1-5-pro',
    type: 'video',
    name: 'Pulse',
    providerLabel: 'Seedance 1.5 Pro',
    air: 'bytedance:seedance@1.5-pro',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 10],
    creditsByDuration: { '5': 35, '10': 70 },
  },
  {
    id: 'wan-2-7',
    type: 'video',
    name: 'Cinema',
    providerLabel: 'Wan 2.7',
    air: 'alibaba:wan@2.7',
    tier: 'plus',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 8],
    creditsByDuration: { '5': 55, '8': 88 },
  },
  {
    id: 'kling-3-pro',
    type: 'video',
    name: 'Director',
    providerLabel: 'Kling 3.0 Pro',
    air: 'klingai:kling-video@3-pro',
    tier: 'pro',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 10],
    creditsByDuration: { '5': 80, '10': 160 },
  },
  {
    id: 'veo-3-1-fast',
    type: 'video',
    name: 'Premiere',
    providerLabel: 'Veo 3.1 Fast',
    air: 'google:3@2',
    tier: 'premium',
    supportsImageInput: true,
    aspectRatios: ['16:9', '9:16'],
    durationOptions: [8],
    creditsByDuration: { '8': 140 },
  },
]

function renderSelect(props?: { selectedId?: string | null; onSelect?: (id: string) => void }) {
  const onSelect = props?.onSelect ?? vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ModelSelect selectedId={props?.selectedId ?? 'flux-schnell'} onSelect={onSelect} />
    </QueryClientProvider>,
  )
  return { onSelect, ...utils }
}

// Open the listbox by clicking the trigger, then return it
async function open(user: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole('button', { name: /flash/i })
  await user.click(trigger)
  return { trigger, listbox: screen.getByRole('listbox', { name: /model/i }) }
}

beforeEach(() => {
  apiMock.mockReset()
  apiMock.mockImplementation((path) => {
    if (path === '/api/catalog') return Promise.resolve({ models })
    return Promise.reject(new Error(`unexpected call ${String(path)}`))
  })
})

describe('ModelSelect', () => {
  it('renders the trigger with the selected model, its provider and credit price', async () => {
    renderSelect({ selectedId: 'flux-schnell' })
    const trigger = await screen.findByRole('button', { name: /flash/i })
    expect(trigger).toHaveTextContent('Flash')
    expect(trigger).toHaveTextContent('FLUX schnell')
    expect(trigger).toHaveTextContent('1 cr')
    // The provider logo is an inline decorative svg inside the trigger
    expect(trigger.querySelector('svg')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens on click and lists all models grouped by type with price + description', async () => {
    const user = userEvent.setup()
    renderSelect()
    const { trigger, listbox } = await open(user)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(within(listbox).getAllByRole('option')).toHaveLength(8)
    // Grouped sections carry accessible group names
    expect(within(listbox).getByRole('group', { name: /images/i })).toBeInTheDocument()
    expect(within(listbox).getByRole('group', { name: /video/i })).toBeInTheDocument()
    // A representative image row: name, provider, tariff (cr + $) and description
    const flash = within(listbox).getByRole('option', { name: /flash/i })
    expect(flash).toHaveTextContent('FLUX schnell')
    expect(flash).toHaveTextContent('1 cr · $0.01')
    expect(flash).toHaveTextContent(/fastest images/i)
    expect(flash).toHaveAttribute('aria-selected', 'true')
    // A video row quotes its BASE-duration price
    const pulse = within(listbox).getByRole('option', { name: /pulse/i })
    expect(pulse).toHaveTextContent('35 cr · $0.35')
    expect(pulse).toHaveTextContent(/native audio/i)
  })

  it('calls onSelect with the model id and closes when an option is clicked', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderSelect()
    const { listbox } = await open(user)
    await user.click(within(listbox).getByRole('option', { name: /pulse/i }))
    expect(onSelect).toHaveBeenCalledWith('seedance-1-5-pro')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('moves the active option with ArrowDown and selects it with Enter', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderSelect({ selectedId: 'flux-schnell' })
    await open(user)
    // Active starts on the selected first option; ArrowDown -> second (Studio)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('flux-dev')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderSelect()
    const { trigger } = await open(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('jumps to the last option with End and selects it', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderSelect()
    await open(user)
    await user.keyboard('{End}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('veo-3-1-fast')
  })

  it('supports typeahead by model name', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderSelect()
    await open(user)
    // "m" -> Motion is the first name starting with M
    await user.keyboard('m{Enter}')
    expect(onSelect).toHaveBeenCalledWith('minimax-hailuo')
  })

  it('closes when clicking outside', async () => {
    const user = userEvent.setup()
    renderSelect()
    await open(user)
    await user.click(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows a skeleton while the catalog is loading', () => {
    apiMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderSelect({ selectedId: null })
    expect(container.querySelector('.animate-skeleton')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows a retry affordance when the catalog fails to load', async () => {
    apiMock.mockRejectedValueOnce(new ApiClientError('internal_error', 'boom', 500))
    renderSelect({ selectedId: null })
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows a disabled placeholder trigger when the catalog is empty', async () => {
    apiMock.mockResolvedValue({ models: [] })
    const user = userEvent.setup()
    renderSelect({ selectedId: null })
    const trigger = await screen.findByRole('button', { name: /select a model/i })
    expect(trigger).toBeDisabled()
    await user.click(trigger)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
