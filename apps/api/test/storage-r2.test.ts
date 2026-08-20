// R2 provider tests (ADR railway-deployment D2). The S3 SDK is mocked at the
// module boundary — these tests pin OUR logic (key naming, the SSRF gate
// reused from local.ts, the redirect shape, scratch-file lifecycle), not
// AWS's wire protocol. saveFromUrl's download hardening itself is exercised
// once, end to end, against local.ts's suite (test/storage.test.ts) via the
// shared storage/download.ts helper — duplicating those cases here would test
// vitest's mocks, not the code.
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const s3Mocks = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  // A constructor-returning-an-object function, not an arrow function: `new`
  // on an arrow function throws "is not a constructor" (a language rule), and
  // r2.ts constructs `new S3Client(...)`.
  return {
    ...actual,
    S3Client: vi.fn().mockImplementation(function FakeS3Client() {
      return { send: s3Mocks.send }
    }),
  }
})

const { createR2Storage } = await import('../src/storage/r2')
const { StorageObjectNotFoundError } = await import('../src/storage/local')

const R2_CONFIG = {
  endpoint: 'https://acct.r2.cloudflarestorage.com',
  bucket: 'opencreate-media',
  accessKeyId: 'ak',
  secretAccessKey: 'sk',
  publicBaseUrl: 'https://media.example.com',
}

const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const noSuchKey = () => Object.assign(new Error('not found'), { name: 'NoSuchKey' })

beforeEach(() => s3Mocks.send.mockReset())
afterEach(() => vi.unstubAllGlobals())

describe('R2 storage', () => {
  it('serve() redirects to the public bucket domain, stripping the /media prefix', async () => {
    const storage = createR2Storage(R2_CONFIG)
    await expect(storage.serve('/media/gen1.mp4')).resolves.toEqual({
      kind: 'redirect',
      url: 'https://media.example.com/gen1.mp4',
    })
  })

  it('saveDataUri uploads the decoded bytes under <key>.<ext> with the right content-type', async () => {
    s3Mocks.send.mockResolvedValueOnce({})
    const storage = createR2Storage(R2_CONFIG)
    await expect(storage.saveDataUri(GIF, 'entity1')).resolves.toBe('/media/entity1.gif')
    expect(s3Mocks.send).toHaveBeenCalledTimes(1)
    const input = s3Mocks.send.mock.calls[0]![0].input
    expect(input).toMatchObject({ Bucket: 'opencreate-media', Key: 'entity1.gif', ContentType: 'image/gif' })
  })

  it('readAsDataUri throws StorageObjectNotFoundError for a missing key', async () => {
    s3Mocks.send.mockRejectedValueOnce(noSuchKey())
    const storage = createR2Storage(R2_CONFIG)
    await expect(storage.readAsDataUri('/media/missing.webp')).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    )
  })

  it('materialize downloads to a scratch file and release() removes it', async () => {
    s3Mocks.send.mockResolvedValueOnce({ Body: Readable.from([Buffer.from('video-bytes')]) })
    const storage = createR2Storage(R2_CONFIG)
    const { path, release } = await storage.materialize('gen1', 'mp4')
    expect(existsSync(path)).toBe(true)
    await release()
    expect(existsSync(path)).toBe(false)
  })

  it('materialize throws StorageObjectNotFoundError for a missing key', async () => {
    s3Mocks.send.mockRejectedValueOnce(noSuchKey())
    const storage = createR2Storage(R2_CONFIG)
    await expect(storage.materialize('missing', 'mp4')).rejects.toBeInstanceOf(StorageObjectNotFoundError)
  })

  it('publishLocalFile uploads the scratch file then deletes it', async () => {
    s3Mocks.send.mockResolvedValueOnce({})
    const storage = createR2Storage(R2_CONFIG)
    const scratch = storage.scratchPath('render1', 'mp4')
    await writeFile(scratch, 'rendered-bytes')
    await expect(storage.publishLocalFile(scratch, 'render1', 'mp4')).resolves.toBe('/media/render1.mp4')
    expect(existsSync(scratch)).toBe(false)
    const input = s3Mocks.send.mock.calls[0]![0].input
    expect(input).toMatchObject({ Bucket: 'opencreate-media', Key: 'render1.mp4' })
  })

  it('saveFromUrl enforces the SSRF gate before ever calling S3', async () => {
    const storage = createR2Storage(R2_CONFIG, ['runware.ai'])
    await expect(storage.saveFromUrl('https://evil.com/x.mp4', 'gen2', 'mp4')).rejects.toThrow(
      /not allowed/,
    )
    expect(s3Mocks.send).not.toHaveBeenCalled()
  })

  it('remove is idempotent even when the object is already gone', async () => {
    s3Mocks.send.mockRejectedValueOnce(noSuchKey())
    const storage = createR2Storage(R2_CONFIG)
    await expect(storage.remove('gen1', 'mp4')).resolves.toBeUndefined()
  })
})
