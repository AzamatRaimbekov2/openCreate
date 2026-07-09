// apps/api/src/storage/dataUri.ts
// Parse + validate an untrusted image data URI before a single byte is written.
//
// The zod schema at the HTTP boundary already checks `startsWith('data:image/')`
// and a length cap. This module does not trust that, on purpose: the schema
// guards the wire shape, this guards the DISK. Defence at the layer that owns
// the resource, so a future caller that skips the schema cannot hurt us.
//
// Three specific dangers, each with a test in dataUri.test.ts:
//  · `image/svg+xml` is an image mime that carries <script>. Served from our
//    own origin it becomes stored XSS. It is rejected despite being an "image".
//  · The byte cap must be measured on the DECODED buffer. base64 inflates ~4/3,
//    so capping the string length lets ~33% more onto the disk than intended.
//  · A malformed/empty payload must throw, not silently write a 0-byte file that
//    later renders as a broken entity photo with no explanation.

// A REJECTED payload is the client's fault, not ours. A distinct error class lets
// the HTTP layer answer 400 instead of letting a bad upload become a 500 — which
// is exactly what happened before this class existed (svg upload → 500).
export class InvalidImageDataUriError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidImageDataUriError'
  }
}

// Raster formats only. No svg (script carrier), no unbounded "image/*".
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

// data:<mime>;base64,<payload> — the ONLY accepted shape. A data URI may legally
// be percent-encoded instead of base64, but we do not need that and every extra
// accepted shape is an extra parser to get wrong.
const DATA_URI_PATTERN = /^data:([a-z0-9.+/-]+);base64,(.*)$/is

export type ParsedImage = {
  bytes: Buffer
  // File extension for the stored object; drives the served Content-Type
  ext: string
}

export function parseImageDataUri(dataUri: string, maxBytes: number): ParsedImage {
  const match = DATA_URI_PATTERN.exec(dataUri)
  if (!match) throw new InvalidImageDataUriError('malformed data URI')

  const [, mime = '', payload = ''] = match
  const ext = MIME_TO_EXT[mime.toLowerCase()]
  if (!ext) throw new InvalidImageDataUriError(`unsupported image type: ${mime}`)

  if (payload.length === 0) throw new InvalidImageDataUriError('malformed data URI: empty payload')

  // Buffer.from silently DROPS invalid base64 characters rather than throwing,
  // so an empty result is our only signal that the payload was garbage.
  const bytes = Buffer.from(payload, 'base64')
  if (bytes.length === 0) throw new InvalidImageDataUriError('malformed data URI: no bytes decoded')

  // Measured on the decoded buffer — see the header note about base64 inflation
  if (bytes.length > maxBytes) {
    throw new InvalidImageDataUriError(`image too large: ${bytes.length} bytes (max ${maxBytes})`)
  }

  return { bytes, ext }
}
