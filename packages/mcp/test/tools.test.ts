import { describe, expect, it, vi } from 'vitest'
import { ApiError, type RestClient } from '../src/api-client'
import { extractBody, toInputSchema } from '../src/registry'
import { dispatch } from '../src/server'
import { tools } from '../src/tools'

type StubClient = RestClient & {
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
    const out = await dispatch(client, 'films', { action: 'get', filmId: 'f1' })
    expect(out.isError).toBeFalsy()
    expect(client.request).toHaveBeenCalledWith('GET', '/api/films/f1', undefined)
  })

  it('rejects a missing path param before any request', async () => {
    const client = stub()
    const out = await dispatch(client, 'films', { action: 'get' })
    expect(out.isError).toBe(true)
    expect(client.request).not.toHaveBeenCalled()
  })

  it('splits body from args and fills schema defaults', async () => {
    const client = stub()
    await dispatch(client, 'enhance_prompt', { action: 'enhance', text: 'hello' })
    expect(client.request).toHaveBeenCalledWith('POST', '/api/prompt/enhance', {
      text: 'hello',
      mode: 'enhance',
    })
  })

  it('rejects an invalid body with the contract schema, before any request', async () => {
    const client = stub()
    const out = await dispatch(client, 'create_generation', { action: 'create', modelId: 'm1' }) // no prompt
    expect(out.isError).toBe(true)
    expect(client.request).not.toHaveBeenCalled()
  })

  it('appends query params', async () => {
    const client = stub()
    await dispatch(client, 'generations', { action: 'list', limit: '10' })
    expect(client.request).toHaveBeenCalledWith('GET', '/api/generations?limit=10', undefined)
  })

  it('surfaces an ApiError as an isError result', async () => {
    const client = stub(() => {
      throw new ApiError(402, 'insufficient_credits', 'not enough credits')
    })
    const out = await dispatch(client, 'account', { action: 'me' })
    expect(out.isError).toBe(true)
    expect(out.content[0]!.text).toContain('insufficient_credits')
  })
})

describe('dispatch — async polling', () => {
  it('polls a processing job to completion by default', async () => {
    const client = stub(() => ({ id: 'g1', status: 'processing' }))
    const out = await dispatch(client, 'create_generation', { action: 'create', modelId: 'm1', prompt: 'a cat' })
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
      action: 'create',
      modelId: 'm1',
      prompt: 'a cat',
      wait: false,
    })
    expect(client.pollUntil).not.toHaveBeenCalled()
    expect(out.content[0]!.text).toContain('processing')
  })

  it('builds the render poll path from filmId + render id', async () => {
    const client = stub(() => ({ id: 'r9', status: 'processing' }))
    await dispatch(client, 'render_film', { action: 'start', filmId: 'f1' })
    expect(client.pollUntil).toHaveBeenCalledWith(
      '/api/films/f1/renders/r9',
      expect.any(Function),
      expect.objectContaining({ timeoutMs: 300_000 }),
    )
  })
})

// ── The action contract itself (ADR mcp-server §P2.5) ───────────────────────
// Collapsing 43 endpoint tools into 16 action tools moved the "which endpoint"
// decision from the tool NAME into an argument. These cover the two ways that
// can go wrong and one property it must preserve.

describe('actions', () => {
  it('refuses a tool call with no action, and names the valid ones', async () => {
    const client = stub()
    const out = await dispatch(client, 'films', {})
    expect(out.isError).toBe(true)
    // Naming them matters: a model that guessed wrong corrects itself from this
    // line instead of re-listing every tool.
    expect(out.content[0]!.text).toContain('create')
    expect(client.request).not.toHaveBeenCalled()
  })

  it('refuses an unknown action rather than falling through to some default', async () => {
    const client = stub()
    const out = await dispatch(client, 'films', { action: 'destroy_everything' })
    expect(out.isError).toBe(true)
    expect(client.request).not.toHaveBeenCalled()
  })

  it('never lets `action` or `wait` into the request body', () => {
    // Both are OUR control keys and neither is a field of any API contract.
    //
    // Asserted against extractBody DIRECTLY rather than through dispatch: a
    // dispatch-level assertion passes even with the omission removed, because
    // zod strips unknown keys on the way through and would hide the bug. That
    // stripping is a second line of defence, not the guarantee — a schema that
    // ever passes through unknown keys would leak both straight to the API.
    const action = {
      summary: 's',
      method: 'POST' as const,
      pathParams: ['filmId'],
      query: ['limit'],
      path: () => '/x',
    }
    const body = extractBody(action, {
      action: 'update',
      wait: false,
      filmId: 'f1',
      limit: '10',
      title: 'keep me',
    })
    expect(body).toEqual({ title: 'keep me' })
  })

  it('keeps the whole API reachable — every action resolves to a path', () => {
    // The consolidation must not have DROPPED capability, only names. If an
    // action ever loses its path builder this fails before anyone ships it.
    for (const t of tools) {
      expect(Object.keys(t.actions).length).toBeGreaterThan(0)
      for (const [name, a] of Object.entries(t.actions)) {
        expect(typeof a.path, `${t.name}.${name}`).toBe('function')
        expect(a.summary.length, `${t.name}.${name}`).toBeGreaterThan(0)
      }
    }
  })

  it('stays inside the context budget the ADR set', () => {
    // ~15 was the target; 16 is what the families collapsed to. This is a
    // ratchet: the next person adding a module must fold it into an existing
    // tool or argue for the 17th, which is exactly the conversation §P2.5 wants.
    expect(tools.length).toBeLessThanOrEqual(16)
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
