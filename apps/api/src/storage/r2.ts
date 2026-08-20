// Cloudflare R2 storage provider (ADR railway-deployment D2; spec
// docs/wiki/architecture/infrastructure-railway.md §4). R2 speaks the S3 API,
// so @aws-sdk/client-s3 talks to it directly with no presigner needed — reads
// are a 302 to R2's public bucket domain (see serve()), not a signed GET.
//
// Same interface as storage/local.ts, same download hardening (shared via
// storage/download.ts) — the provider swap changes WHERE bytes end up, not
// what is allowed to reach us or how large it may be.
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { downloadToFile, type DownloadLimits } from './download'
import { parseImageDataUri } from './dataUri'
import { MIME_BY_EXT, StorageObjectNotFoundError, type StorageLimits, type StorageProvider } from './local'

export type R2Config = {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  // Public bucket domain reads redirect to, e.g. "https://media.example.com".
  // NOT the S3 endpoint — that one is private, credentialed, and used only by
  // this process to PUT/GET/DELETE.
  publicBaseUrl: string
}

function isNoSuchKey(err: unknown): boolean {
  // The SDK v3 error shape varies by how R2 answers; both the typed error
  // name and a plain 404 are treated as "missing", matching S3's own
  // GetObject behaviour for an absent key.
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404
}

// `allowedHosts`/limits mirror storage/local.ts's constructor exactly — same
// SSRF gate, same deadline/cap discipline, applied to saveFromUrl's download.
export function createR2Storage(
  config: R2Config,
  allowedHosts: string[] = ['runware.ai'],
  limits: StorageLimits = {},
): StorageProvider {
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: 'auto',
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  const downloadLimits: DownloadLimits = {
    fetchTimeoutMs: limits.fetchTimeoutMs ?? 120_000,
    maxBytes: limits.maxBytes ?? 512 * 1024 * 1024,
  }
  // Ephemeral working directory for the two things that must touch local disk
  // even on an object-storage backend: materialize()'s ffmpeg-input download
  // and saveFromUrl's / publishLocalFile's stage-then-upload. Never served —
  // nothing under here is reachable from /media/*.
  const scratchDir = join(tmpdir(), 'opencreate-r2-scratch')
  mkdir(scratchDir, { recursive: true }).catch(() => undefined)

  async function uploadFile(path: string, key: string): Promise<void> {
    const { size } = await stat(path)
    const mime = MIME_BY_EXT[extname(key).slice(1).toLowerCase()]
    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: createReadStream(path),
        ContentLength: size,
        ...(mime ? { ContentType: mime } : {}),
      }),
    )
  }

  return {
    async saveDataUri(dataUri, key) {
      const { bytes, ext } = parseImageDataUri(dataUri, downloadLimits.maxBytes)
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: `${key}.${ext}`,
          Body: bytes,
          ContentLength: bytes.length,
          ContentType: MIME_BY_EXT[ext],
        }),
      )
      return `/media/${key}.${ext}`
    },
    async readAsDataUri(publicPath) {
      const fileName = basename(publicPath)
      const mime = MIME_BY_EXT[extname(fileName).slice(1).toLowerCase()]
      if (!mime) throw new Error(`unsupported stored asset: ${fileName}`)
      let res
      try {
        res = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: fileName }))
      } catch (err) {
        if (isNoSuchKey(err)) throw new StorageObjectNotFoundError(fileName)
        throw err
      }
      const chunks: Buffer[] = []
      for await (const chunk of res.Body as Readable) chunks.push(chunk as Buffer)
      return `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`
    },
    async saveFromUrl(url, key, ext) {
      const scratchFile = join(scratchDir, `upload-${key}.${ext}`)
      try {
        await downloadToFile(url, allowedHosts, downloadLimits, scratchFile)
        await uploadFile(scratchFile, `${key}.${ext}`)
      } finally {
        await unlink(scratchFile).catch(() => undefined)
      }
      return `/media/${key}.${ext}`
    },
    async serve(publicPath) {
      // R2_PUBLIC_BASE_URL has no /media prefix (it IS the media domain), so
      // strip the /media the app-level path always carries: "/media/<key>.<ext>"
      // → "<base>/<key>.<ext>".
      return { kind: 'redirect', url: config.publicBaseUrl + publicPath.replace(/^\/media/, '') }
    },
    async remove(key, ext) {
      // Idempotent, like local's unlink().catch(): a delete of an already-gone
      // (or never-uploaded) key must not fail the caller.
      await s3
        .send(new DeleteObjectCommand({ Bucket: config.bucket, Key: `${key}.${ext}` }))
        .catch(() => undefined)
    },
    async materialize(key, ext) {
      const objectKey = `${key}.${ext}`
      const path = join(scratchDir, `materialize-${key}.${ext}`)
      let res
      try {
        res = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }))
      } catch (err) {
        if (isNoSuchKey(err)) throw new StorageObjectNotFoundError(objectKey)
        throw err
      }
      await pipeline(res.Body as Readable, createWriteStream(path))
      return { path, release: () => unlink(path).catch(() => undefined) }
    },
    scratchPath(key, ext) {
      return join(scratchDir, `${key}.${ext}`)
    },
    async publishLocalFile(path, key, ext) {
      await uploadFile(path, `${key}.${ext}`)
      await unlink(path).catch(() => undefined)
      return `/media/${key}.${ext}`
    },
  }
}
