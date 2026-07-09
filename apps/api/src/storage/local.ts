// Local storage provider (plan Task 9). Runware asset URLs expire after 7 days,
// so the moment a generation succeeds we download the bytes into our own
// STORAGE_DIR and hand the SPA a stable /media/<key>.<ext> path served by
// @fastify/static (wired in app.ts). Shaped as a StorageProvider interface so
// an S3/R2 provider can replace it post-MVP without touching callers.
import { createWriteStream, mkdirSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import { readFile, writeFile } from 'node:fs/promises'
import { parseImageDataUri } from './dataUri'

export type StorageProvider = {
  // Downloads `url` and stores it as <dir>/<key>.<ext>; returns the public
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
  // Absolute directory @fastify/static serves as /media/* (see app.ts).
  dir: string
  remove(key: string, ext: string): Promise<void>
  // Absolute on-disk path of a stored asset — the local file the CinemaStudio
  // ffmpeg render reads (shot media) and writes (the finished mp4). No I/O, no
  // await: it just joins <dir>/<key>.<ext>. Because every finished generation
  // asset is already downloaded into STORAGE_DIR (Runware URLs expire in 7 days),
  // the render's inputs are always local files — ffmpeg needs no network and the
  // SSRF gate is not in the picture. An S3 provider would implement this by
  // staging to a temp dir first; noted in the ADR, not built.
  localPath(key: string, ext: string): string
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
const MIME_BY_EXT: Record<string, string> = {
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

// SSRF gate for saveFromUrl (review finding). The URL we fetch comes from a
// PROVIDER RESPONSE, not from our own code — a compromised or misbehaving
// provider payload could otherwise point our server-side fetch at internal
// targets (169.254.169.254 cloud metadata, localhost admin ports, private
// VPC services) and exfiltrate whatever they answer into /media/*.
// Default-deny: a host passes only if it IS an allowlisted domain or a true
// subdomain of one ('vm.runware.ai' → 'runware.ai'). Plain suffix matching
// would be spoofable ('evilrunware.ai' ends with 'runware.ai'), hence the
// exact-or-dot-boundary comparison. Scheme is https-only: provider asset URLs
// are always https, and plain http to an allowlisted host would hand the
// bytes (and the request) to any on-path attacker.
function assertAllowedAssetUrl(url: string, allowedHosts: string[]): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('asset url not allowed: unparseable')
  }
  // Rejects file:, data:, ftp: and downgraded http: in one check — hostless
  // schemes never reach the host comparison at all.
  if (parsed.protocol !== 'https:') throw new Error('asset url not allowed: https required')
  const host = parsed.hostname.toLowerCase()
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
  limits: StorageLimits = {},
): StorageProvider {
  // Resolve to absolute up front: config allows relative paths ('./data/media')
  // but @fastify/static requires an absolute root — normalize once here.
  const root = resolve(dir)
  mkdirSync(root, { recursive: true })
  const fetchTimeoutMs = limits.fetchTimeoutMs ?? DEFAULT_ASSET_FETCH_TIMEOUT_MS
  const maxBytes = limits.maxBytes ?? DEFAULT_ASSET_MAX_BYTES
  return {
    dir: root,
    async saveDataUri(dataUri, key) {
      // Entity photos are ours forever (Runware URLs expire after 7 days), so
      // they land in the same STORAGE_DIR the generations use. Reuses the asset
      // byte cap: one number governs "how big may a stored image be".
      const { bytes, ext } = parseImageDataUri(dataUri, maxBytes)
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
      // Gate BEFORE the fetch — a forbidden host must never see the request.
      assertAllowedAssetUrl(url, allowedHosts)
      // One AbortController spans the ENTIRE download — the fetch (headers)
      // AND the body pipeline below share its signal. A deadline on fetch
      // alone would be a half-measure: undici resolves fetch() at headers, so
      // a provider that answers fast and then streams forever would still
      // hold this settlement await indefinitely. `timedOut` disambiguates the
      // deadline from the manual abort() in the pipeline error handler.
      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, fetchTimeoutMs)
      const file = join(root, `${key}.${ext}`)
      try {
        // redirect: 'manual' closes the allowlist-bypass hop: the gate above only
        // ever saw the FIRST url, so with fetch's default ('follow') a single 30x
        // on an allowlisted host (open redirect, compromised provider) would
        // re-point this server-side request at internal targets — metadata
        // endpoints, localhost admin ports — and publish the response under
        // /media/*. Provider asset URLs are direct links; a redirect is treated
        // as hostile and fails the download outright instead of being re-vetted.
        // Browser User-Agent: some asset hosts sit behind Cloudflare, which
        // 403s (CF 1010) a bare Node fetch — notably our RunPod ComfyUI /view
        // URLs. Harmless for hosts that don't care (Runware).
        const res = await fetch(url, {
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          },
        })
        if (res.status >= 300 && res.status < 400)
          throw new Error(`asset redirect not allowed: ${res.status}`)
        if (!res.ok || !res.body) throw new Error(`asset download failed: ${res.status}`)
        // Byte cap enforced WHILE streaming (review finding): the counter sits
        // between the network and the disk, so not one byte past the cap is
        // written. Content-Length is deliberately ignored — a header can lie
        // in both directions; only counted bytes are trusted.
        let received = 0
        const capBytes = new Transform({
          transform(chunk: Buffer, _enc, done) {
            received += chunk.length
            if (received > maxBytes) done(new Error(`asset too large: exceeded ${maxBytes} bytes`))
            else done(null, chunk)
          },
        })
        // Stream to disk — videos can be tens of MB; never buffer them in memory.
        // (Cast: DOM ReadableStream and node:stream/web ReadableStream are
        // structurally identical here but nominally distinct types.)
        try {
          await pipeline(
            Readable.fromWeb(res.body as unknown as NodeReadableStream<Uint8Array>),
            capBytes,
            createWriteStream(file),
            { signal: controller.signal },
          )
        } catch (err) {
          // Any mid-stream failure (cap trip, timeout abort, network drop):
          // release the provider socket and remove the partial file — a
          // truncated asset must never be served from /media/* as if whole.
          controller.abort()
          await unlink(file).catch(() => undefined)
          throw err
        }
        return `/media/${key}.${ext}`
      } catch (err) {
        // The deadline may fire before headers (fetch rejects with AbortError)
        // or mid-stream (pipeline rejects) — either way, surface a stable,
        // caller-meaningful message instead of a generic abort error.
        if (timedOut) throw new Error(`asset download timed out after ${fetchTimeoutMs}ms`)
        throw err
      } finally {
        clearTimeout(timer)
      }
    },
    async remove(key, ext) {
      // Idempotent delete: a missing file is fine (already cleaned up or the
      // generation failed before download) — callers must not have to care.
      await unlink(join(root, `${key}.${ext}`)).catch(() => undefined)
    },
    localPath(key, ext) {
      // Pure path join against the resolved absolute root. Callers (the render
      // pipeline) pass their own keys/exts; this never touches the network or
      // the filesystem, so it is safe to call for a path that does not exist yet
      // (the render OUTPUT path is computed before ffmpeg writes it).
      return join(root, `${key}.${ext}`)
    },
  }
}
