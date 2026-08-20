// Shared SSRF-gated, deadline+cap-enforced asset download. Extracted from the
// local provider (storage/local.ts) so the R2 provider enforces byte-for-byte
// identical download hardening — the ADR requires it to pass the SAME tests
// as local with only the destination swapped (docs/wiki/architecture/
// infrastructure-railway.md §4.4).
import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'

export type DownloadLimits = {
  fetchTimeoutMs: number
  maxBytes: number
}

// SSRF gate. The URL comes from a PROVIDER RESPONSE, not our own code — a
// compromised or misbehaving provider payload could otherwise point our
// server-side fetch at internal targets (cloud metadata, localhost admin
// ports, private VPC services). Default-deny: a host passes only if it IS an
// allowlisted domain or a true subdomain of one. Scheme is https-only.
export function assertAllowedAssetUrl(url: string, allowedHosts: string[]): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('asset url not allowed: unparseable')
  }
  if (parsed.protocol !== 'https:') throw new Error('asset url not allowed: https required')
  const host = parsed.hostname.toLowerCase()
  const ok = allowedHosts.some((allowed) => {
    const a = allowed.toLowerCase()
    return host === a || host.endsWith(`.${a}`)
  })
  if (!ok) throw new Error(`asset host not allowed: ${host}`)
}

// Downloads `url` to `filePath` under the SSRF gate, a whole-download deadline
// and a streaming byte cap. Any failure (gate, status, timeout, cap) removes a
// partial file — a truncated asset must never be mistaken for a whole one.
export async function downloadToFile(
  url: string,
  allowedHosts: string[],
  limits: DownloadLimits,
  filePath: string,
): Promise<void> {
  assertAllowedAssetUrl(url, allowedHosts)
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, limits.fetchTimeoutMs)
  try {
    // redirect: 'manual' — the gate above only ever saw the FIRST url; a 30x
    // on an allowlisted host must fail outright, not be re-vetted.
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
    let received = 0
    const capBytes = new Transform({
      transform(chunk: Buffer, _enc, done) {
        received += chunk.length
        if (received > limits.maxBytes)
          done(new Error(`asset too large: exceeded ${limits.maxBytes} bytes`))
        else done(null, chunk)
      },
    })
    try {
      await pipeline(
        Readable.fromWeb(res.body as unknown as NodeReadableStream<Uint8Array>),
        capBytes,
        createWriteStream(filePath),
        { signal: controller.signal },
      )
    } catch (err) {
      controller.abort()
      await unlink(filePath).catch(() => undefined)
      throw err
    }
  } catch (err) {
    if (timedOut) throw new Error(`asset download timed out after ${limits.fetchTimeoutMs}ms`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}
