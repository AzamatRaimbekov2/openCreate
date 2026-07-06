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
