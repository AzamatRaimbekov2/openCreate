// apps/web/src/shared/ui/EnhanceButton.test.tsx
// Behavior of the shared prompt-enhancer affordance (POST /api/prompt/enhance,
// mode 'enhance'). The load-bearing contract, shared by the /create composer and
// the Cinema shot prompt:
//   * the icon is disabled with nothing to enhance (empty / below the min length);
//   * a click posts the raw text and REPLACES the field with the returned prompt;
//   * an "Undo" affordance restores the exact original draft (never lost);
//   * a [[eN]] cast token survives the enhance+replace round-trip untouched;
//   * a 502 provider_error surfaces the calm "unavailable" notice, never a dead click;
//   * while in flight the icon shows a spinner and disables (no double fire);
//   * the idle nudge appears at most once per session and never after dismiss.
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { useEnhanceNudge } from 'shared/model'
import { ENHANCE_NUDGE_IDLE_MS, EnhanceButton } from './EnhanceButton'
// i18n init — the button renders localized aria-labels and copy itself
import 'shared/config/i18n'

// Mock ONLY api(); the real ApiClientError class must survive for instanceof
vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

// A realistic controlled host: the enhanced text really lands back in the field,
// so Undo (which watches value) and token preservation are tested end-to-end.
function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <textarea aria-label="prompt" value={value} onChange={(e) => setValue(e.target.value)} />
      <EnhanceButton value={value} onEnhanced={setValue} />
    </>
  )
}

function renderHarness(initial = '') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  )
}

const enhanceButton = () => screen.getByRole('button', { name: /enhance prompt/i })
const promptField = () => screen.getByRole('textbox', { name: /prompt/i })

beforeEach(() => {
  apiMock.mockReset()
  // Module-level session singleton — pristine per test
  useEnhanceNudge.setState({ dismissed: false })
})

describe('EnhanceButton', () => {
  it('disables the icon when there is nothing to enhance', async () => {
    renderHarness('')
    expect(enhanceButton()).toBeDisabled()
    // A single character is below the min — still nothing worth a round-trip
    await userEvent.type(promptField(), 'a')
    expect(enhanceButton()).toBeDisabled()
    await userEvent.type(promptField(), 'b')
    expect(enhanceButton()).toBeEnabled()
  })

  it('posts the raw text and replaces the field with the enhanced prompt', async () => {
    apiMock.mockResolvedValue({ prompt: 'A cinematic wide shot of a lone cat in neon rain' })
    renderHarness('a cat')

    await userEvent.click(enhanceButton())

    expect(apiMock).toHaveBeenCalledWith(
      '/api/prompt/enhance',
      expect.objectContaining({ method: 'POST' }),
    )
    const [, init] = apiMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'a cat', mode: 'enhance' })
    expect(await screen.findByDisplayValue(/cinematic wide shot/i)).toBeInTheDocument()
  })

  it('restores the exact original draft when Undo is clicked', async () => {
    apiMock.mockResolvedValue({ prompt: 'An elaborate enhanced prompt' })
    renderHarness('a rough idea')

    await userEvent.click(enhanceButton())
    expect(await screen.findByDisplayValue('An elaborate enhanced prompt')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /undo/i }))
    expect(promptField()).toHaveValue('a rough idea')
    // One undo only — the affordance retires once used
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument()
  })

  it('keeps a [[eN]] cast token intact through enhance and replace', async () => {
    apiMock.mockResolvedValue({
      prompt: 'A moody close-up of [[e1]] walking through neon rain, cinematic',
    })
    renderHarness('hero [[e1]] in the rain')

    await userEvent.click(enhanceButton())

    // Sent out untouched...
    const [, init] = apiMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body)).text).toBe('hero [[e1]] in the rain')
    // ...and the token survives in what lands back in the field
    expect(await screen.findByDisplayValue(/\[\[e1\]\]/)).toBeInTheDocument()
  })

  it('surfaces the calm unavailable notice on a 502 provider error', async () => {
    apiMock.mockRejectedValue(new ApiClientError('provider_error', 'key missing', 502))
    renderHarness('a cat in the rain')

    await userEvent.click(enhanceButton())

    expect(await screen.findByText(/unavailable/i)).toBeInTheDocument()
    // Never a dead click — the field is untouched on failure
    expect(promptField()).toHaveValue('a cat in the rain')
  })

  it('shows a spinner and disables the icon while the request is in flight', async () => {
    // A never-resolving request keeps the pending state on screen
    apiMock.mockReturnValue(new Promise(() => {}))
    renderHarness('a cat in the rain')

    await userEvent.click(enhanceButton())

    expect(enhanceButton()).toBeDisabled()
    expect(enhanceButton()).toHaveAttribute('aria-busy', 'true')
  })

  it('nudges once after an idle rough prompt and never again after dismiss', () => {
    vi.useFakeTimers()
    try {
      const { unmount } = renderHarness('a cat')
      // Nothing yet — the hint waits for the idle pause
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(ENHANCE_NUDGE_IDLE_MS)
      })
      expect(screen.getByRole('tooltip')).toBeInTheDocument()

      // Dismiss it — keyboard-operable close, focus never stolen
      fireEvent.click(screen.getByRole('button', { name: /dismiss hint/i }))
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

      // A fresh mount in the same session must not re-arm the hint
      unmount()
      renderHarness('a dog')
      act(() => {
        vi.advanceTimersByTime(ENHANCE_NUDGE_IDLE_MS)
      })
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
