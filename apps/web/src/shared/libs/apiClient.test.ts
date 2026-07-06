// apps/web/src/shared/libs/apiClient.test.ts
// Behavior: api() parses JSON on 2xx, resolves undefined on 204, and on non-2xx
// throws ApiClientError carrying {code,message} from the API error envelope
// (falling back to internal_error when the body is not an envelope).
import { ApiClientError, api } from './apiClient'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Helper: a JSON Response like our Fastify API produces
function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api', () => {
  it('parses JSON on 2xx and sends cookies + JSON content type', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'u1', creditsBalance: 200 }, 200))
    await expect(api<{ id: string; creditsBalance: number }>('/api/me')).resolves.toEqual({
      id: 'u1',
      creditsBalance: 200,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('resolves undefined on 204 (no body to parse)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(api<undefined>('/api/generations/g1', { method: 'DELETE' })).resolves.toBe(
      undefined,
    )
  })

  it('throws ApiClientError with code+message from the error envelope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'insufficient_credits', message: 'Not enough credits' } }, 402),
    )
    const thrown = await api('/api/generations', { method: 'POST' }).catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(ApiClientError)
    if (thrown instanceof ApiClientError) {
      expect(thrown.code).toBe('insufficient_credits')
      expect(thrown.message).toBe('Not enough credits')
      expect(thrown.status).toBe(402)
    }
  })

  it('falls back to internal_error when the body is not a valid envelope', async () => {
    // e.g. an HTML error page from a proxy — json() fails, envelope parse fails
    fetchMock.mockResolvedValue(new Response('Bad Gateway', { status: 502 }))
    const thrown = await api('/api/me').catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(ApiClientError)
    if (thrown instanceof ApiClientError) {
      expect(thrown.code).toBe('internal_error')
      expect(thrown.status).toBe(502)
    }
  })
})
