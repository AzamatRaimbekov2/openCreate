// Unit tests for the Qwen-Image-Max synchronous client (deepinfra-image.ts).
// fetch is injected (same seam as the Groq completer tests) so every provider
// outcome — success, HTTP error, garbage body, network failure — is scripted
// without touching the real DeepInfra.
import { describe, expect, it, vi } from 'vitest'
import {
  DeepinfraImageError,
  generateQwenImage,
} from '../src/integrations/deepinfra/deepinfra-image'

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

describe('generateQwenImage', () => {
  it('POSTs the verified request shape and returns imageUrl + costUsd', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ images: [DATA_URL], inference_status: { cost: 0.075 } }),
    )

    const result = await generateQwenImage('di-test-key', 'a cat', fetchMock)

    expect(result).toEqual({ imageUrl: DATA_URL, costUsd: 0.075 })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.deepinfra.com/v1/inference/Qwen/Qwen-Image-Max')
    const headers = init!.headers as Record<string, string>
    // lowercase 'bearer' is what DeepInfra's own examples send
    expect(headers.Authorization).toBe('bearer di-test-key')
    const body = JSON.parse(init!.body as string) as Record<string, unknown>
    // The VERIFIED contract: prompt + size "W*H" + watermark off. The plan
    // doc's guessed fields (resolution/aspect_ratio) must never appear.
    expect(body).toEqual({ prompt: 'a cat', size: '1280*1280', watermark: false })
  })

  it('returns costUsd null when the provider omits inference_status', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ images: [DATA_URL] }))
    const result = await generateQwenImage('k', 'a cat', fetchMock)
    expect(result.costUsd).toBeNull()
  })

  it('throws a sanitized error on a non-2xx reply, keeping detail off message', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ detail: 'account acc-123 has no balance' }, 402),
    )
    const err = await generateQwenImage('k', 'a cat', fetchMock).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DeepinfraImageError)
    const typed = err as DeepinfraImageError
    // The browser-visible message never carries the upstream's words…
    expect(typed.message).toBe('DeepInfra HTTP 402')
    // …which travel on providerDetail for the server log only.
    expect(typed.providerDetail).toBe('account acc-123 has no balance')
    expect(typed.statusCode).toBe(502)
    expect(typed.apiCode).toBe('provider_error')
  })

  it('throws "returned no image" on an ok reply with an empty images array', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ images: [] }))
    await expect(generateQwenImage('k', 'a cat', fetchMock)).rejects.toThrow(
      'DeepInfra returned no image',
    )
  })

  it('throws "returned no image" on an ok reply with a non-JSON body', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('<html>', { status: 200 }))
    await expect(generateQwenImage('k', 'a cat', fetchMock)).rejects.toThrow(
      'DeepInfra returned no image',
    )
  })

  it('maps a network failure to a clean provider error', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    const err = await generateQwenImage('k', 'a cat', fetchMock).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DeepinfraImageError)
    expect((err as DeepinfraImageError).message).toBe('DeepInfra request failed')
    expect((err as DeepinfraImageError).providerDetail).toBe('fetch failed')
  })

  it('maps an abort/timeout to the 120s timeout message', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError')
    })
    await expect(generateQwenImage('k', 'a cat', fetchMock)).rejects.toThrow(
      'image generation timed out (120s limit)',
    )
  })
})
