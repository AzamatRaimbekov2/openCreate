import { describe, expect, it } from 'vitest'
import {
  buildFfmpegArgs,
  canvasFor,
  escapeDrawtext,
  totalDurationMs,
  type RenderPlan,
  type RenderSegment,
} from '../src/modules/films/render'

// A minimal plan factory — override the pieces each test cares about.
function plan(segments: RenderSegment[], over: Partial<RenderPlan> = {}): RenderPlan {
  return {
    width: 1280,
    height: 720,
    segments,
    audio: [],
    fontPath: null,
    outputPath: '/tmp/out.mp4',
    fps: 30,
    ...over,
  }
}
const videoSeg = (o: Partial<RenderSegment> = {}): RenderSegment => ({
  file: '/media/a.mp4',
  kind: 'video',
  durationSec: 4,
  trimStartSec: 0,
  crossfade: false,
  transitionSec: 0,
  title: null,
  ...o,
})

describe('buildFfmpegArgs', () => {
  it('throws on an empty timeline', () => {
    expect(() => buildFfmpegArgs(plan([]))).toThrow(/no shots/)
  })

  it('single shot aliases [v0] to [outv] and maps it', () => {
    const args = buildFfmpegArgs(plan([videoSeg()]))
    const graph = args[args.indexOf('-filter_complex') + 1]!
    expect(graph).toContain('[v0]null[outv]')
    expect(args).toContain('-map')
    expect(args).toContain('[outv]')
    // No audio → no [outa] map and no aac.
    expect(args).not.toContain('[outa]')
    expect(args).not.toContain('aac')
  })

  it('hard cut between two shots uses concat', () => {
    const graph = buildFfmpegArgs(plan([videoSeg(), videoSeg({ file: '/media/b.mp4' })]))[
      buildFfmpegArgs(plan([videoSeg(), videoSeg({ file: '/media/b.mp4' })])).indexOf('-filter_complex') + 1
    ]!
    expect(graph).toContain('concat=n=2:v=1:a=0[outv]')
    expect(graph).not.toContain('xfade')
  })

  it('crossfade boundary uses xfade with a computed offset', () => {
    const args = buildFfmpegArgs(
      plan([videoSeg({ durationSec: 4 }), videoSeg({ file: '/media/b.mp4', crossfade: true, transitionSec: 1 })]),
    )
    const graph = args[args.indexOf('-filter_complex') + 1]!
    // offset = accLen(4) - t(1) = 3
    expect(graph).toContain('xfade=transition=fade:duration=1.000:offset=3.000[outv]')
  })

  it('clamps a crossfade longer than the shots so xfade never overlaps fully', () => {
    const args = buildFfmpegArgs(
      plan([videoSeg({ durationSec: 2 }), videoSeg({ file: '/media/b.mp4', crossfade: true, transitionSec: 10 })]),
    )
    const graph = args[args.indexOf('-filter_complex') + 1]!
    // t clamped to min(10, 2-0.05, 2-0.05) = 1.95
    expect(graph).toContain('duration=1.950')
  })

  it('renders a title card (no file) as a lavfi color input', () => {
    const args = buildFfmpegArgs(
      plan([{ file: null, kind: 'title', durationSec: 3, trimStartSec: 0, crossfade: false, transitionSec: 0, title: { text: 'THE END', position: 'center' } }]),
    )
    expect(args).toContain('lavfi')
    expect(args.join(' ')).toContain('color=c=black:s=1280x720')
  })

  it('draws the title only when a font is available', () => {
    const seg = videoSeg({ title: { text: 'Hi', position: 'top' } })
    const withFont = buildFfmpegArgs(plan([seg], { fontPath: '/font.ttf' }))
    const noFont = buildFfmpegArgs(plan([seg], { fontPath: null }))
    expect(withFont[withFont.indexOf('-filter_complex') + 1]!).toContain('drawtext')
    expect(noFont[noFont.indexOf('-filter_complex') + 1]!).not.toContain('drawtext')
  })

  it('mixes audio tracks and maps [outa]', () => {
    const args = buildFfmpegArgs(
      plan([videoSeg()], { audio: [{ file: '/media/m.mp3', startSec: 0, gainDb: 0 }, { file: '/media/v.mp3', startSec: 2, gainDb: -6 }] }),
    )
    const graph = args[args.indexOf('-filter_complex') + 1]!
    expect(graph).toContain('amix=inputs=2')
    expect(graph).toContain('adelay=2000|2000')
    expect(args).toContain('[outa]')
    expect(args).toContain('aac')
  })

  // A film is as long as its picture: an over-long music bed is trimmed to the
  // timeline rather than stretching the export (and `-shortest` is not used, as
  // it would truncate the picture when the audio is the shorter stream).
  // Native generation audio (2026-07-15): a clip generated WITH sound carries
  // its own stream into the mix — trimmed to the shot's window and delayed to
  // the segment's timeline start, so picture and soundtrack stay in lockstep.
  it('maps a native-audio segment stream into the mix at its timeline offset', () => {
    const args = buildFfmpegArgs(
      plan([
        videoSeg({ durationSec: 4 }),
        videoSeg({ file: '/media/b.mp4', nativeAudio: true, trimStartSec: 0.5, durationSec: 3 }),
      ]),
    )
    const graph = args[args.indexOf('-filter_complex') + 1]!
    // [1:a] = the second segment's own stream; delayed to its start (4s, hard cut)
    expect(graph).toContain('[1:a]atrim=start=0.500:duration=3.000')
    expect(graph).toContain('adelay=4000|4000[na1]')
    expect(graph).toContain('[na1]amix=inputs=1')
    expect(args).toContain('[outa]')
    expect(args).toContain('aac')
  })

  it('mixes native segment audio together with film tracks', () => {
    const args = buildFfmpegArgs(
      plan([videoSeg({ nativeAudio: true })], {
        audio: [{ file: '/media/m.mp3', startSec: 0, gainDb: 0 }],
      }),
    )
    const graph = args[args.indexOf('-filter_complex') + 1]!
    expect(graph).toContain('[na0]')
    expect(graph).toContain('amix=inputs=2')
  })

  it('a crossfaded native-audio segment starts inside the overlap, like its picture', () => {
    const args = buildFfmpegArgs(
      plan([
        videoSeg({ durationSec: 4 }),
        videoSeg({ file: '/media/b.mp4', nativeAudio: true, crossfade: true, transitionSec: 1 }),
      ]),
    )
    const graph = args[args.indexOf('-filter_complex') + 1]!
    // xfade offset = 4 - 1 = 3s → the clip's sound enters WITH its first frame
    expect(graph).toContain('adelay=3000|3000[na1]')
  })

  it('trims the audio mix to the visible timeline length', () => {
    const args = buildFfmpegArgs(
      plan([videoSeg({ durationSec: 4 }), videoSeg({ file: '/media/b.mp4', crossfade: true, transitionSec: 1 })], {
        audio: [{ file: '/media/m.mp3', startSec: 0, gainDb: 0 }],
      }),
    )
    const graph = args[args.indexOf('-filter_complex') + 1]!
    // visible length = 4 + 4 - 1 = 7
    expect(graph).toContain('atrim=0:7.000')
    expect(args).not.toContain('-shortest')
  })

  it('titles are literal: drawtext runs with expansion disabled', () => {
    const args = buildFfmpegArgs(plan([videoSeg({ title: { text: '%{pts}', position: 'top' } })], { fontPath: '/font.ttf' }))
    expect(args[args.indexOf('-filter_complex') + 1]!).toContain('expansion=none')
  })

  it('trims a video segment to its window but not an image', () => {
    const vid = buildFfmpegArgs(plan([videoSeg({ trimStartSec: 1.5, durationSec: 3 })]))
    expect(vid[vid.indexOf('-filter_complex') + 1]!).toContain('trim=start=1.500:duration=3.000')
    const img = buildFfmpegArgs(plan([videoSeg({ kind: 'image', file: '/media/a.webp' })]))
    // image is bounded by -loop 1 -t on the input, not a trim filter
    expect(img).toContain('-loop')
    expect(img[img.indexOf('-filter_complex') + 1]!).not.toContain('trim=')
  })
})

describe('escapeDrawtext', () => {
  // The value is emitted inside single quotes, where ffmpeg takes every character
  // literally. Only the quote itself must be broken out as '\'' — escaping it as
  // \' ends the quoted run early and ffmpeg then reads the rest of the chain as
  // drawtext options. See render-ffmpeg.test.ts, which pins this against ffmpeg.
  it("breaks single quotes out of the quoted run as '\\''", () => {
    expect(escapeDrawtext("it's")).toBe("it'\\''s")
    expect(escapeDrawtext("'a'")).toBe("'\\''a'\\''")
  })

  it('leaves colons, backslashes and commas untouched (quotes already protect them)', () => {
    expect(escapeDrawtext('a:b,c\\d')).toBe('a:b,c\\d')
  })

  it('flattens newlines to a space', () => {
    expect(escapeDrawtext('line1\nline2')).toBe('line1 line2')
  })
})

describe('totalDurationMs', () => {
  it('sums durations and subtracts crossfade overlaps', () => {
    expect(
      totalDurationMs([
        { durationMs: 4000, transition: 'none', transitionMs: 0 },
        { durationMs: 4000, transition: 'crossfade', transitionMs: 1000 },
      ]),
    ).toBe(7000)
  })
  it('never returns below 1', () => {
    expect(totalDurationMs([])).toBe(1)
  })
})

describe('canvasFor', () => {
  it('maps each aspect ratio to a canvas', () => {
    expect(canvasFor('16:9')).toEqual({ width: 1280, height: 720 })
    expect(canvasFor('9:16')).toEqual({ width: 720, height: 1280 })
    expect(canvasFor('1:1')).toEqual({ width: 720, height: 720 })
  })
})
