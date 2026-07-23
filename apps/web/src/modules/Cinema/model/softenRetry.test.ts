// apps/web/src/modules/Cinema/model/softenRetry.test.ts
// The content_blocked "soften and retry" money-path. `softenPrompt` calls the
// shared rewrite endpoint in 'soften' mode and validates the reply against the
// contract; `createSoftenRetry` orchestrates it into a regenerate — and,
// crucially, DEGRADES to a plain "edit it yourself" toast when the endpoint is
// missing (404 because the provider isn't configured/deployed) so the action is
// never a dead click and never leaks a raw error.
import { ApiClientError } from 'shared/libs/apiClient'
import i18n from 'shared/config/i18n'
import { useToastStore } from 'shared/ui'
import { createSoftenRetry, softenPrompt } from './softenRetry'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const { api } = await import('shared/libs/apiClient')
const apiMock = vi.mocked(api)

beforeEach(() => {
  apiMock.mockReset()
  useToastStore.getState().clear()
})

describe('softenPrompt', () => {
  it('POSTs the soften request and returns the rewritten prompt', async () => {
    apiMock.mockResolvedValue({ prompt: 'a calm, peaceful scene' })
    const result = await softenPrompt('a violent scene')
    expect(result).toBe('a calm, peaceful scene')
    expect(apiMock).toHaveBeenCalledWith(
      '/api/prompt/enhance',
      expect.objectContaining({ method: 'POST' }),
    )
    const [, init] = apiMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'a violent scene', mode: 'soften' })
  })
})

describe('createSoftenRetry', () => {
  it('regenerates with the softened prompt on success', async () => {
    apiMock.mockResolvedValue({ prompt: 'a calm, peaceful scene' })
    const onSoftened = vi.fn()
    const run = createSoftenRetry({ text: 'a violent scene', onSoftened, t: i18n.t })
    await run()
    expect(onSoftened).toHaveBeenCalledWith('a calm, peaceful scene')
    // A clean run raises no fallback toast
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('degrades to a manual-edit toast when the endpoint is absent (404)', async () => {
    apiMock.mockRejectedValue(new ApiClientError('not_found', 'raw server text', 404))
    const onSoftened = vi.fn()
    const run = createSoftenRetry({ text: 'a violent scene', onSoftened, t: i18n.t })
    await run()
    // Never regenerates on a failed enhance — no surprise charge
    expect(onSoftened).not.toHaveBeenCalled()
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.variant).toBe('info')
    expect(toasts[0]?.description).toMatch(/edit the prompt/i)
    // The raw server text never reaches the user
    expect(JSON.stringify(toasts[0])).not.toContain('raw server text')
  })
})
