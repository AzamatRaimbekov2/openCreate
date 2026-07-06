// Local storage provider (plan Task 9). Runware asset URLs expire after 7 days,
// so the moment a generation succeeds we download the bytes into our own
// STORAGE_DIR and hand the SPA a stable /media/<key>.<ext> path served by
// @fastify/static (wired in app.ts). Shaped as a StorageProvider interface so
// an S3/R2 provider can replace it post-MVP without touching callers.
import { createWriteStream, mkdirSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'

export type StorageProvider = {
  // Downloads `url` and stores it as <dir>/<key>.<ext>; returns the public
  // "/media/<key>.<ext>" path that goes into generation.mediaJson.
  saveFromUrl(url: string, key: string, ext: string): Promise<string>
  // Absolute directory @fastify/static serves as /media/* (see app.ts).
  dir: string
  remove(key: string, ext: string): Promise<void>
}

export function createLocalStorage(dir: string): StorageProvider {
  // Resolve to absolute up front: config allows relative paths ('./data/media')
  // but @fastify/static requires an absolute root — normalize once here.
  const root = resolve(dir)
  mkdirSync(root, { recursive: true })
  return {
    dir: root,
    async saveFromUrl(url, key, ext) {
      const res = await fetch(url)
      if (!res.ok || !res.body) throw new Error(`asset download failed: ${res.status}`)
      const file = join(root, `${key}.${ext}`)
      // Stream to disk — videos can be tens of MB; never buffer them in memory.
      // (Cast: DOM ReadableStream and node:stream/web ReadableStream are
      // structurally identical here but nominally distinct types.)
      await pipeline(
        Readable.fromWeb(res.body as unknown as NodeReadableStream<Uint8Array>),
        createWriteStream(file),
      )
      return `/media/${key}.${ext}`
    },
    async remove(key, ext) {
      // Idempotent delete: a missing file is fine (already cleaned up or the
      // generation failed before download) — callers must not have to care.
      await unlink(join(root, `${key}.${ext}`)).catch(() => undefined)
    },
  }
}
