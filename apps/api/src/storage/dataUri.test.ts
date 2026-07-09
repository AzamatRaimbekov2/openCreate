// Parsing an untrusted data URI before any of its bytes touch the disk.
// Everything here is a way a malicious or broken client could hurt us.
import { describe, expect, it } from 'vitest'
import { parseImageDataUri } from './dataUri'

// 1x1 transparent GIF — the smallest real image
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

describe('parseImageDataUri', () => {
  it('parses a valid base64 image data URI into bytes and an extension', () => {
    const result = parseImageDataUri(GIF, 1_000_000)
    expect(result.ext).toBe('gif')
    expect(result.bytes.length).toBeGreaterThan(0)
  })

  it('maps jpeg to a jpg extension', () => {
    const result = parseImageDataUri('data:image/jpeg;base64,/9j/4AAQSkZJRg==', 1_000_000)
    expect(result.ext).toBe('jpg')
  })

  it('rejects a non-image mime type', () => {
    // "data:image/..." is checked by zod at the boundary, but the storage layer
    // must not TRUST that — it is the last gate before bytes hit the disk
    expect(() => parseImageDataUri('data:text/html;base64,PHNjcmlwdD4=', 1_000_000)).toThrow(
      /unsupported/i,
    )
  })

  it('rejects an svg (it is an image mime that can carry script)', () => {
    expect(() => parseImageDataUri('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 1_000_000)).toThrow(
      /unsupported/i,
    )
  })

  it('rejects a URI that is not base64-encoded', () => {
    expect(() => parseImageDataUri('data:image/png,rawtext', 1_000_000)).toThrow(/malformed/i)
  })

  it('rejects payloads over the byte cap, measured on the DECODED bytes', () => {
    // The cap must be enforced after decoding: base64 inflates ~4/3, so a
    // string-length check would let ~33% more onto the disk than intended
    expect(() => parseImageDataUri(GIF, 10)).toThrow(/too large/i)
  })

  it('rejects garbage that decodes to nothing', () => {
    expect(() => parseImageDataUri('data:image/png;base64,', 1_000_000)).toThrow(/malformed/i)
  })
})
