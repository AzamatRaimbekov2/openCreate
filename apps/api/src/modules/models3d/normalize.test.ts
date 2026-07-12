// Studio3D Task 9. The argv IS the tested surface (same bargain as films/render.ts's
// buildFfmpegArgs): a filtergraph regression is caught here without ever spawning
// ffmpeg, so these tests stay fast and hermetic.
import { describe, expect, it } from 'vitest'
import { buildNormalizeArgs } from './normalize'

describe('buildNormalizeArgs', () => {
  it('emits faststart and yuv420p', () => {
    const args = buildNormalizeArgs({ inputPath: '/in.mp4', outputPath: '/out.mp4' })
    expect(args).toContain('+faststart') // streams without downloading the whole file
    expect(args).toContain('yuv420p') // Safari/QuickTime refuse 4:4:4 and 10-bit
  })

  it('overwrites the output and reads nothing from stdin', () => {
    const args = buildNormalizeArgs({ inputPath: '/in.mp4', outputPath: '/out.mp4' })
    expect(args).toContain('-y')
    expect(args).toContain('-nostdin')
    expect(args[args.length - 1]).toBe('/out.mp4') // output is always last
  })

  it('drops audio — a turntable is silent', () => {
    // Not cosmetic: an audio track we never asked for is a whole class of container
    // surprises (and bytes) on an artifact that is by definition mute.
    expect(buildNormalizeArgs({ inputPath: '/in.mp4', outputPath: '/out.mp4' })).toContain('-an')
  })

  it('adds no scale filter when no cap is asked for', () => {
    // Absent maxHeight, the pixels must pass through untouched — re-scaling a clip
    // that is already the right size is pure quality loss.
    expect(buildNormalizeArgs({ inputPath: '/in.mp4', outputPath: '/out.mp4' })).not.toContain('-vf')
  })

  it('caps the output height so an oversized upload cannot become an oversized asset', () => {
    const args = buildNormalizeArgs({ inputPath: '/in.mp4', outputPath: '/out.mp4', maxHeight: 1080 })
    const vf = args[args.indexOf('-vf') + 1]
    expect(vf).toContain('1080')
    // min(1, cap/ih) means the scale factor never exceeds 1: a 720p input stays
    // 720p instead of being blown up to the cap.
    expect(vf).toContain('min(1,1080/ih)')
    // yuv420p subsamples chroma 2x2, so BOTH dimensions must be even or ffmpeg
    // refuses the encode outright. trunc(../2)*2 is what guarantees that.
    expect(vf).toContain('trunc')
    expect(vf).toContain('/2)*2')
  })
})
