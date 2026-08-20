// Local storage provider (plan Task 9; reshaped for object storage — ADR
// railway-deployment D2). Runware asset URLs expire after 7 days, so the
// moment a generation succeeds we download the bytes into our own
// STORAGE_DIR and hand the SPA a stable /media/<key>.<ext> path. Shaped as a
// StorageProvider interface so an R2 provider (storage/r2.ts) answers the
// same calls without touching a caller.
import { existsSync, mkdirSync } from 'node:fs'
import { rename, unlink } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { downloadToFile, type DownloadLimits } from './download'
import { parseImageDataUri } from './dataUri'

// Thrown by materialize() when the requested object does not exist — the
// provider-agnostic replacement for the caller-side `existsSync(localPath)`
// check the filesystem shape used to allow. Both providers throw this exact
// type so callers (films/service.ts, models3d/service.ts) can react to "the
// asset was never downloaded / was pruned" the same way regardless of backend.
export class StorageObjectNotFoundError extends Error {
  constructor(publicPath: string) {
    super(`storage object not found: ${publicPath}`)
  }
}

export type StorageProvider = {
  // Downloads `url` and stores it as <key>.<ext>; returns the public
  // "/media/<key>.<ext>" path that goes into generation.mediaJson.
  saveFromUrl(url: string, key: string, ext: string): Promise<string>
  // Stores the bytes of a user-supplied image data URI (entity photos). No
  // network, so no SSRF gate — but parseImageDataUri still guards the DISK:
  // raster mimes only (no svg → stored XSS), cap measured on decoded bytes.
  saveDataUri(dataUri: string, key: string): Promise<string>
  // Reads a stored object BACK as a data URI. Needed because Runware conditions
  // on reference images given as data URIs, and our /media/* paths are not
  // publicly reachable in development (or behind a private asset host), so
  // handing over a URL would fail precisely where we test it.
  readAsDataUri(publicPath: string): Promise<string>
  // How app.ts should answer a GET /media/<publicPath> request: serve a local
  // file straight off `root`, or 302 the browser at a public object-storage URL.
  serve(publicPath: string): Promise<{ kind: 'file'; root: string } | { kind: 'redirect'; url: string }>
  remove(key: string, ext: string): Promise<void>
  // Guarantees a REAL LOCAL FILE ffmpeg can read for <key>.<ext>, plus a
  // release() the caller MUST call in a `finally` once done with it. The local
  // provider returns the stored file itself with a no-op release; an object
  // storage provider downloads to a scratch file and unlinks it on release.
  // Throws StorageObjectNotFoundError if the object does not exist.
  materialize(key: string, ext: string): Promise<{ path: string; release(): Promise<void> }>
  // Where ffmpeg may WRITE <key>.<ext> — a scratch input (never published) or a
  // render's output (published via publishLocalFile below once ffmpeg succeeds).
  // No I/O, no await: pure path computation, safe to call before the file exists.
  scratchPath(key: string, ext: string): string
  // Turns a file written at `path` (normally storage.scratchPath's own return
  // value) into a stored, servable asset at "/media/<key>.<ext>". The local
  // provider's publish is a rename into place; an object storage provider
  // uploads then deletes the scratch file.
  publishLocalFile(path: string, key: string, ext: string): Promise<string>
}

// Download hardening defaults (review finding). Without a deadline, a single
// stalled provider stream held its settlement await forever (get() would
// retry only on the NEXT poll, but the hung handler and its socket leaked);
// without a size cap, one malicious/broken provider response could fill the
// disk that also holds the SQLite database. 120s is generous for the ~tens of
// MB a video asset actually is; 512MB is far above any legitimate asset while
// still bounding the damage. Both are env-tunable (ASSET_FETCH_TIMEOUT_MS /
// ASSET_MAX_BYTES → config.ts) and defaulted HERE too so the constructor
// stays safe-by-default for any caller that forgets to pass config values.
// Reverse of dataUri.ts's MIME_TO_EXT — the extension we stored decides the mime
// we hand back. Same closed raster set: nothing here can reintroduce svg.
export const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

export const DEFAULT_ASSET_FETCH_TIMEOUT_MS = 120_000
export const DEFAULT_ASSET_MAX_BYTES = 512 * 1024 * 1024

export type StorageLimits = {
  // Hard deadline for the WHOLE download (headers + body streaming).
  fetchTimeoutMs?: number
  // Max bytes accepted, counted while streaming — headers are never trusted.
  maxBytes?: number
}

// `allowedHosts` comes from config.assetHostAllowlist (ASSET_HOST_ALLOWLIST,
// default runware.ai) — configurable so a provider/CDN change is an env edit,
// not a code change. The default here keeps the constructor safe-by-default
// for any caller that forgets to pass the config value.
export function createLocalStorage(
  dir: string,
  allowedHosts: string[] = ['runware.ai'],
  limits: StorageLimits = {},
): StorageProvider {
  // Resolve to absolute up front: config allows relative paths ('./data/media')
  // but @fastify/static requires an absolute root — normalize once here.
  const root = resolve(dir)
  mkdirSync(root, { recursive: true })
  const downloadLimits: DownloadLimits = {
    fetchTimeoutMs: limits.fetchTimeoutMs ?? DEFAULT_ASSET_FETCH_TIMEOUT_MS,
    maxBytes: limits.maxBytes ?? DEFAULT_ASSET_MAX_BYTES,
  }
  return {
    async saveDataUri(dataUri, key) {
      // Entity photos are ours forever (Runware URLs expire after 7 days), so
      // they land in the same STORAGE_DIR the generations use. Reuses the asset
      // byte cap: one number governs "how big may a stored image be".
      const { bytes, ext } = parseImageDataUri(dataUri, downloadLimits.maxBytes)
      await writeFile(join(root, `${key}.${ext}`), bytes)
      return `/media/${key}.${ext}`
    },
    async readAsDataUri(publicPath) {
      // publicPath is "/media/<key>.<ext>" — a path WE minted, never client input.
      // basename() still guards it: a future caller passing "/media/../../etc/passwd"
      // must not escape the storage root.
      const fileName = basename(publicPath)
      const mime = MIME_BY_EXT[extname(fileName).slice(1).toLowerCase()]
      if (!mime) throw new Error(`unsupported stored asset: ${fileName}`)
      const bytes = await readFile(join(root, fileName))
      return `data:${mime};base64,${bytes.toString('base64')}`
    },
    async saveFromUrl(url, key, ext) {
      const file = join(root, `${key}.${ext}`)
      await downloadToFile(url, allowedHosts, downloadLimits, file)
      return `/media/${key}.${ext}`
    },
    async serve() {
      // Every /media/* file lives directly under root; app.ts resolves the
      // requested filename against it (and gets @fastify/static's own
      // path-traversal guard for free).
      return { kind: 'file', root }
    },
    async remove(key, ext) {
      // Idempotent delete: a missing file is fine (already cleaned up or the
      // generation failed before download) — callers must not have to care.
      await unlink(join(root, `${key}.${ext}`)).catch(() => undefined)
    },
    async materialize(key, ext) {
      const path = join(root, `${key}.${ext}`)
      if (!existsSync(path)) throw new StorageObjectNotFoundError(`${key}.${ext}`)
      return { path, release: async () => undefined }
    },
    scratchPath(key, ext) {
      // Local has no separate scratch area: the directory @fastify/static
      // serves IS the publish target, so ffmpeg writes straight to its final
      // resting place (matches the pre-R2 behaviour exactly).
      return join(root, `${key}.${ext}`)
    },
    async publishLocalFile(path, key, ext) {
      const dest = join(root, `${key}.${ext}`)
      if (path !== dest) await rename(path, dest)
      return `/media/${key}.${ext}`
    },
  }
}
