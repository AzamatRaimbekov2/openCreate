// apps/web/src/modules/Cinema/model/exportCapabilities.test.ts
// The export capability gate: WebCodecs (VideoEncoder + AudioEncoder) is required;
// File System Access (showSaveFilePicker) enables STREAMING to disk (flat memory),
// its absence falls back to an in-memory blob (long films degrade — Safari/FF).
// jsdom has neither, so the default is "unsupported"; the tests stub the globals.
import { exportCapabilities, isExportSupported } from './exportCapabilities'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('exportCapabilities', () => {
  it('reports UNSUPPORTED without WebCodecs (jsdom default)', () => {
    expect(isExportSupported()).toBe(false)
    expect(exportCapabilities().supported).toBe(false)
  })

  it('is supported + streaming when WebCodecs AND File System Access exist', () => {
    vi.stubGlobal('VideoEncoder', class {})
    vi.stubGlobal('AudioEncoder', class {})
    vi.stubGlobal('showSaveFilePicker', () => undefined)
    expect(exportCapabilities()).toEqual({ supported: true, streaming: true })
    expect(isExportSupported()).toBe(true)
  })

  it('is supported but NOT streaming when File System Access is missing (blob fallback)', () => {
    vi.stubGlobal('VideoEncoder', class {})
    vi.stubGlobal('AudioEncoder', class {})
    expect(exportCapabilities()).toEqual({ supported: true, streaming: false })
  })

  it('is unsupported when only the video encoder exists (no AudioEncoder)', () => {
    vi.stubGlobal('VideoEncoder', class {})
    expect(exportCapabilities().supported).toBe(false)
  })
})
