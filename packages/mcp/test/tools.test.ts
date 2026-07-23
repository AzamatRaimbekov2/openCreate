import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../src/api-client'
import { toInputSchema } from '../src/registry'
import { dispatch } from '../src/server'
import { tools } from '../src/tools'

type StubClient = ApiClient & {
  request: ReturnType<typeof vi.fn>
  pollUntil: ReturnType<typeof vi.fn>
}

function stub(reqImpl?: (...a: unknown[]) => unknown): StubClient {
  return {
    request: vi.fn(reqImpl ?? (() => ({ ok: true }))),
    pollUntil: vi.fn(() => ({ id: 'g1', status: 'succeeded' })),
  } as unknown as StubClient
}

describe('dispatch — request building', () => {
  it('builds a path-param GET with no body', async () => {
    const client = stub()
    const out = await dispatch(client, 'get_film', { filmId: 'f1' })
    expect(out.isError).toBeFalsy()
    expect(client.request).toHaveBeenCalledWith('GET', '/api/films/f1', undefined)
  })

  it('rejects a missing path param before any request', async () => {
    const client = stub()
    const out = await dispatch(client, 'get_film', {})
    expect(out.isError).toBe(true)
    expect(client.request).not.toHaveBeenCalled()
  })

  it('splits body from args and fills schema defaults', async () => {
    const client = stub()
    await dispatch(client, 'enhance_prompt', { text: 'hello' })
    expect(client.request).toHaveBeenCalledWith('POST', '/api/prompt/enhance', {
      text: 'hello',
      mode: 'enhance',
    })
  })

  it('rejects an invalid body with the contract schema, before any request', async () => {
    const client = stub()
    const out = await dispatch(client, 'create_generation', { modelId: 'm1' }) // no prompt
    expect(out.isError).toBe(true)
    expect(client.request).not.toHaveBeenCalled()
  })

  it('appends query params', async () => {
    const client = stub()
    await dispatch(client, 'list_generations', { limit: '10' })
    expect(client.request).toHaveBeenCalledWith('GET', '/api/generations?limit=10', undefined)
  })

  it('surfaces an ApiError as an isError result', async () => {
    const client = stub(() => {
      throw new ApiError(402, 'insufficient_credits', 'not enough credits')
    })
    const out = await dispatch(client, 'get_me', {})
    expect(out.isError).toBe(true)
    expect(out.content[0]!.text).toContain('insufficient_credits')
  })
})

describe('dispatch — async polling', () => {
  it('polls a processing job to completion by default', async () => {
    const client = stub(() => ({ id: 'g1', status: 'processing' }))
    const out = await dispatch(client, 'create_generation', { modelId: 'm1', prompt: 'a cat' })
    expect(client.pollUntil).toHaveBeenCalledWith(
      '/api/generations/g1',
      expect.any(Function),
      expect.objectContaining({ timeoutMs: 120_000 }),
    )
    expect(out.content[0]!.text).toContain('succeeded')
  })

  it('skips polling when wait:false', async () => {
    const client = stub(() => ({ id: 'g1', status: 'processing' }))
    const out = await dispatch(client, 'create_generation', {
      modelId: 'm1',
      prompt: 'a cat',
      wait: false,
    })
    expect(client.pollUntil).not.toHaveBeenCalled()
    expect(out.content[0]!.text).toContain('processing')
  })

  it('builds the render poll path from filmId + render id', async () => {
    const client = stub(() => ({ id: 'r9', status: 'processing' }))
    await dispatch(client, 'render_film', { filmId: 'f1' })
    expect(client.pollUntil).toHaveBeenCalledWith(
      '/api/films/f1/renders/r9',
      expect.any(Function),
      expect.objectContaining({ timeoutMs: 300_000 }),
    )
  })
})

describe('tool table', () => {
  it('every tool produces a valid object input schema', () => {
    for (const t of tools) {
      const schema = toInputSchema(t)
      expect(schema.type).toBe('object')
      expect(schema.properties).toBeTypeOf('object')
    }
  })

  it('has unique tool names', () => {
    const names = tools.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
