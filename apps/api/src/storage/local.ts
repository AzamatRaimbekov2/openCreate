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

// SSRF gate for saveFromUrl (review finding). The URL we fetch comes from a
// PROVIDER RESPONSE, not from our own code — a compromised or misbehaving
// provider payload could otherwise point our server-side fetch at internal
// targets (169.254.169.254 cloud metadata, localhost admin ports, private
// VPC services) and exfiltrate whatever they answer into /media/*.
// Default-deny: a host passes only if it IS an allowlisted domain or a true
// subdomain of one ('vm.runware.ai' → 'runware.ai'). Plain suffix matching
// would be spoofable ('evilrunware.ai' ends with 'runware.ai'), hence the
// exact-or-dot-boundary comparison.
function assertAllowedAssetUrl(url: string, allowedHosts: string[]): void {
  let host: string
  try {
    // Also rejects non-URL garbage and hostless schemes (file:, data:) —
    // their hostname is empty and never matches an allowlist entry.
    host = new URL(url).hostname.toLowerCase()
  } catch {
    throw new Error('asset url not allowed: unparseable')
  }
  const ok = allowedHosts.some((allowed) => {
    const a = allowed.toLowerCase()
    return host === a || host.endsWith(`.${a}`)
  })
  if (!ok) throw new Error(`asset host not allowed: ${host}`)
}

// `allowedHosts` comes from config.assetHostAllowlist (ASSET_HOST_ALLOWLIST,
// default runware.ai) — configurable so a provider/CDN change is an env edit,
// not a code change. The default here keeps the constructor safe-by-default
// for any caller that forgets to pass the config value.
export function createLocalStorage(
  dir: string,
  allowedHosts: string[] = ['runware.ai'],
): StorageProvider {
  // Resolve to absolute up front: config allows relative paths ('./data/media')
  // but @fastify/static requires an absolute root — normalize once here.
  const root = resolve(dir)
  mkdirSync(root, { recursive: true })
  return {
    dir: root,
    async saveFromUrl(url, key, ext) {
      // Gate BEFORE the fetch — a forbidden host must never see the request.
      assertAllowedAssetUrl(url, allowedHosts)
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
