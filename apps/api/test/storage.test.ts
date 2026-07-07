// Task 9 tests: the local storage provider downloads provider assets into
// STORAGE_DIR (Runware URLs expire in 7 days — we must own the bytes) and the
// app serves that directory at /media/* via @fastify/static.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStorage } from '../src/storage/local'
import { buildTestApp } from './helpers/build-test-app'

afterEach(() => vi.unstubAllGlobals())

describe('local storage', () => {
  it('downloads a url into STORAGE_DIR and returns /media path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
    )
    const dir = mkdtempSync(join(tmpdir(), 'oc-storage-'))
    const storage = createLocalStorage(dir)
    const url = await storage.saveFromUrl('https://vm.runware.ai/v.mp4', 'gen1', 'mp4')
    expect(url).toBe('/media/gen1.mp4')
    expect(existsSync(join(dir, 'gen1.mp4'))).toBe(true)
  })

  it('throws when the asset download fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gone', { status: 404 })))
    const dir = mkdtempSync(join(tmpdir(), 'oc-storage-'))
    const storage = createLocalStorage(dir)
    await expect(storage.saveFromUrl('https://vm.runware.ai/x.mp4', 'gen2', 'mp4')).rejects.toThrow(
      'asset download failed: 404',
    )
    expect(existsSync(join(dir, 'gen2.mp4'))).toBe(false)
  })

  it('remove deletes the file and is a no-op when already gone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
    )
    const dir = mkdtempSync(join(tmpdir(), 'oc-storage-'))
    const storage = createLocalStorage(dir)
    await storage.saveFromUrl('https://vm.runware.ai/v.mp4', 'gen3', 'mp4')
    await storage.remove('gen3', 'mp4')
    expect(existsSync(join(dir, 'gen3.mp4'))).toBe(false)
    await expect(storage.remove('gen3', 'mp4')).resolves.toBeUndefined()
  })
})

// SSRF defense (review finding): saveFromUrl's input is a provider-reported
// asset URL. A compromised/misbehaving provider response must not be able to
// point our server-side fetch at internal targets (cloud metadata endpoints,
// localhost admin ports). Default-deny: only hosts on the allowlist (default
// runware.ai + subdomains) are ever fetched.
describe('saveFromUrl host allowlist (SSRF)', () => {
  it('refuses a host outside the allowlist and never fetches it', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const dir = mkdtempSync(join(tmpdir(), 'oc-storage-'))
    const storage = createLocalStorage(dir)
    await expect(
      storage.saveFromUrl('https://169.254.169.254/latest/meta-data', 'gen4', 'webp'),
    ).rejects.toThrow(/not allowed/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'gen4.webp'))).toBe(false)
  })

  it('refuses a suffix-spoof host — evilrunware.ai is not a runware.ai subdomain', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const dir = mkdtempSync(join(tmpdir(), 'oc-storage-'))
    const storage = createLocalStorage(dir)
    await expect(
      storage.saveFromUrl('https://evilrunware.ai/x.webp', 'gen5', 'webp'),
    ).rejects.toThrow(/not allowed/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses to follow redirects — a 30x from an allowlisted host is an error, not a hop', async () => {
    // The allowlist gates only the FIRST url. If fetch() followed redirects
    // (its default), an open redirect on an allowlisted host would re-point the
    // server-side request anywhere (metadata endpoints, localhost admin ports)
    // AFTER the gate passed. The fetch must be issued with redirect: 'manual'
    // and any 30x answer must fail the download outright.
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const dir = mkdtempSync(join(tmpdir(), 'oc-storage-'))
    const storage = createLocalStorage(dir)
    await expect(
      storage.saveFromUrl('https://vm.runware.ai/redirect.mp4', 'gen10', 'mp4'),
    ).rejects.toThrow(/redirect/)
    // Exactly one request — the Location target must never be fetched.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Pins the option that stops undici from transparently following the hop
    // before our code ever sees the 30x status.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://vm.runware.ai/redirect.mp4',
      expect.objectContaining({ redirect: 'manual' }),
    )
    expect(existsSync(join(dir, 'gen10.mp4'))).toBe(false)
  })

  it('refuses plain http even to an allowlisted host — https only', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const dir = mkdtempSync(join(tmpdir(), 'oc-storage-'))
    const storage = createLocalStorage(dir)
    await expect(
      storage.saveFromUrl('http://vm.runware.ai/v.mp4', 'gen11', 'mp4'),
    ).rejects.toThrow(/not allowed/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'gen11.mp4'))).toBe(false)
  })

  it('allows the bare allowlisted domain and honors a custom allowlist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
    )
    const dir = mkdtempSync(join(tmpdir(), 'oc-storage-'))
    // Bare apex of the default allowlist passes (not only subdomains).
    const byDefault = createLocalStorage(dir)
    await expect(byDefault.saveFromUrl('https://runware.ai/a.webp', 'gen6', 'webp')).resolves.toBe(
      '/media/gen6.webp',
    )
    // Custom allowlist (ASSET_HOST_ALLOWLIST) replaces the default entirely.
    const custom = createLocalStorage(dir, ['assets.example.com'])
    await expect(
      custom.saveFromUrl('https://cdn.assets.example.com/a.webp', 'gen7', 'webp'),
    ).resolves.toBe('/media/gen7.webp')
    await expect(custom.saveFromUrl('https://vm.runware.ai/v.mp4', 'gen8', 'mp4')).rejects.toThrow(
      /not allowed/,
    )
  })
})

describe('GET /media/*', () => {
  it('serves files from the storage dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-media-'))
    writeFileSync(join(dir, 'gen9.webp'), 'webp-bytes')
    const app = await buildTestApp({ storageDir: dir })
    const res = await app.inject({ method: 'GET', url: '/media/gen9.webp' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('webp-bytes')
  })

  it('404s for a missing asset', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/media/nope.mp4' })
    expect(res.statusCode).toBe(404)
  })
})
