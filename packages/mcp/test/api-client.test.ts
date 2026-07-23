import { describe, expect, it, vi } from 'vitest'
import { ApiClient, ApiError, type FetchLike } from '../src/api-client'

const cfg = { baseUrl: 'http://localhost:8787', email: 'a@b.com', password: 'pw' }

// Minimal Response stub — only the members ApiClient reads.
function res(opts: { status?: number; body?: string; cookies?: string[] }): Response {
  const status = opts.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { getSetCookie: () => opts.cookies ?? [] },
    text: async () => opts.body ?? '',
  } as unknown as Response
}

function loginRes() {
  return res({ status: 200, cookies: ['oc.session=abc; Path=/; HttpOnly'] })
}

describe('ApiClient', () => {
  it('logs in on first request and replays the cookie', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(loginRes())
      .mockResolvedValueOnce(res({ body: JSON.stringify({ id: 'u1' }) }))
    const client = new ApiClient(cfg, fetchMock)

    const out = await client.request('GET', '/api/me')

    expect(out).toEqual({ id: 'u1' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Call 0 = sign-in with credentials
    const [loginUrl, loginInit] = fetchMock.mock.calls[0]!
    expect(loginUrl).toBe('http://localhost:8787/api/auth/sign-in/email')
    expect(JSON.parse(String(loginInit!.body))).toEqual({ email: 'a@b.com', password: 'pw' })
    // Call 1 = the actual request, carrying the cookie head (attributes stripped)
    const [, getInit] = fetchMock.mock.calls[1]!
    expect((getInit!.headers as Record<string, string>).cookie).toBe('oc.session=abc')
  })

  it('re-logs-in exactly once and retries on a 401', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(loginRes()) // initial login
      .mockResolvedValueOnce(res({ status: 401 })) // stale cookie
      .mockResolvedValueOnce(loginRes()) // re-login
      .mockResolvedValueOnce(res({ body: JSON.stringify({ ok: true }) })) // retry succeeds
    const client = new ApiClient(cfg, fetchMock)

    const out = await client.request('GET', '/api/films')

    expect(out).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('does NOT retry a second 401 (bad creds fail fast)', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(loginRes())
      .mockResolvedValueOnce(res({ status: 401 }))
      .mockResolvedValueOnce(loginRes())
      .mockResolvedValueOnce(res({ status: 401, body: JSON.stringify({ error: { code: 'unauthorized', message: 'nope' } }) }))
    const client = new ApiClient(cfg, fetchMock)

    await expect(client.request('GET', '/api/films')).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('maps the error envelope to a typed ApiError', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(loginRes())
      .mockResolvedValueOnce(
        res({ status: 400, body: JSON.stringify({ error: { code: 'validation_failed', message: 'bad prompt' } }) }),
      )
    const client = new ApiClient(cfg, fetchMock)

    await expect(client.request('POST', '/api/generations', { x: 1 })).rejects.toMatchObject({
      code: 'validation_failed',
      message: 'bad prompt',
      status: 400,
    })
  })

  it('gives a readable error when sign-in fails', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(res({ status: 401 }))
    const client = new ApiClient(cfg, fetchMock)

    await expect(client.request('GET', '/api/me')).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('fails clearly when credentials are missing', async () => {
    const fetchMock = vi.fn<FetchLike>()
    const client = new ApiClient({ ...cfg, email: '', password: '' }, fetchMock)

    await expect(client.request('GET', '/api/me')).rejects.toThrow(/Missing credentials/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('polls until the job leaves the processing state', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(loginRes())
      .mockResolvedValueOnce(res({ body: JSON.stringify({ id: 'g1', status: 'processing' }) }))
      .mockResolvedValueOnce(res({ body: JSON.stringify({ id: 'g1', status: 'succeeded' }) }))
    const client = new ApiClient(cfg, fetchMock)

    const out = await client.pollUntil<{ status: string }>(
      '/api/generations/g1',
      (r) => r.status !== 'processing',
      { timeoutMs: 1_000, intervalMs: 1 },
    )

    expect(out).toEqual({ id: 'g1', status: 'succeeded' })
  })
})
