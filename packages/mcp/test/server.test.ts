import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { ApiClient } from '../src/api-client'
import { buildServer } from '../src/server'

// End-to-end over the real MCP wire (in-memory transport, no network): proves the
// server initializes, advertises the whole tool table, and turns a credential-less
// call into a clean tool error rather than a crash.
async function connectPair() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = buildServer(new ApiClient({ baseUrl: 'http://localhost:8787', email: '', password: '' }))
  await server.connect(serverTransport)
  const client = new Client({ name: 'test', version: '0' }, { capabilities: {} })
  await client.connect(clientTransport)
  return client
}

describe('MCP server (in-memory)', () => {
  it('lists the full tool table with valid input schemas', async () => {
    const client = await connectPair()
    const { tools } = await client.listTools()
    expect(tools.length).toBeGreaterThanOrEqual(40)
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z0-9_]+$/)
      expect((t.inputSchema as { type?: string }).type).toBe('object')
    }
    // A known async submit tool advertises the wait flag.
    const cg = tools.find((t) => t.name === 'create_generation')
    expect((cg?.inputSchema as { properties?: Record<string, unknown> })?.properties).toHaveProperty('wait')
  })

  it('returns a clean tool error (not a crash) when credentials are missing', async () => {
    const client = await connectPair()
    const res = await client.callTool({ name: 'get_me', arguments: {} })
    expect(res.isError).toBe(true)
    const text = (res.content as Array<{ text: string }>)[0]!.text
    expect(text).toMatch(/OPENCREATE_EMAIL|credentials/i)
  })
})
