// apps/api/src/modules/films/render.ts
// The CinemaStudio render pipeline (ADR: cinema-studio §2 "a render is not a
// generation"). Turns a film's ordered timeline into a single mp4 with ffmpeg.
//
// TWO layers, split so the hard part is pure and testable:
//   1. buildFfmpegArgs(plan) — PURE. Given a resolved render plan (canvas, input
//      files, per-shot durations/trims/transitions/titles, audio tracks) it
//      returns the exact ffmpeg argv. No I/O, no spawn — unit-tested against the
//      expected argument structure so a filtergraph regression is caught without
//      running ffmpeg.
//   2. runRender(...) — the side-effecting runner: spawns ffmpeg with the argv,
//      streams -progress to update the row's percent, and resolves/rejects.
//
// A render spends OUR CPU, not a provider invoice, so nothing here touches the
// credit ledger. Concurrency is bounded by a semaphore (ffmpeg is CPU-bound and
// this process also serves the API and holds the SQLite file).
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import ffmpegStatic from 'ffmpeg-static'
import type { AspectRatio, Shot, ShotTitle } from '@opencreate/contracts'

// The ffmpeg binary. ffmpeg-static resolves to the downloaded binary path (its
// postinstall is allowed in pnpm-workspace.yaml). Null/absent → renders fail
// cleanly with a clear message instead of a cryptic spawn error.
export const FFMPEG_PATH: string | null = ffmpegStatic ?? null

// Canvas size per aspect ratio — every shot is scaled+padded to this. 720p-class
// (the hd table) keeps a full film's render fast; the composer's clips are
// already ≤1080p and downscale cleanly. One place owns this so the render and a
// future preview cannot disagree about the frame size.
const CANVAS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1280, height: 720 },
  '1:1': { width: 720, height: 720 },
  '9:16': { width: 720, height: 1280 },
}
export function canvasFor(aspect: AspectRatio): { width: number; height: number } {
  return CANVAS[aspect]
}

// Candidate font files for drawtext titles, in preference order (macOS dev →
// common Linux container). drawtext needs an explicit fontfile because the
// static ffmpeg has no fontconfig. If none exist, titles are silently skipped
// (the render still succeeds — a missing font must never fail an export).
const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
]
export function resolveFontPath(candidates: string[] = FONT_CANDIDATES): string | null {
  return candidates.find((p) => existsSync(p)) ?? null
}

// One resolved timeline segment. `file` is the shot's on-disk media (video or
// image); null = a title card rendered over a solid background. Times are in
// SECONDS (ffmpeg's unit) — the caller converts from the ms the contract uses.
export type RenderSegment = {
  file: string | null
  kind: 'video' | 'image' | 'title'
  durationSec: number
  trimStartSec: number
  // True = crossfade INTO this segment from the previous one; false = hard cut.
  // The boundary before the first segment is always a cut (this is ignored on i=0).
  crossfade: boolean
  // Crossfade duration in seconds (only read when `crossfade` is true).
  transitionSec: number
  title: ShotTitle | null
  // Map this segment's OWN audio stream into the export mix (native generation
  // audio). Only ever true for a video segment whose generation row carries
  // params.audio provenance — mapping [i:a] on a file with no audio stream kills
  // the whole render, so the caller (buildPlan) gates it on the row, never on a
  // guess. Absent/false = the pre-feature behaviour: the clip contributes video only.
  nativeAudio?: boolean
}

export type RenderAudio = {
  file: string
  startSec: number
  gainDb: number
}

export type RenderPlan = {
  width: number
  height: number
  segments: RenderSegment[]
  audio: RenderAudio[]
  fontPath: string | null
  outputPath: string
  fps: number
}

// drawtext y-position expression per title placement. x is always centered.
function titleY(position: ShotTitle['position'], height: number): string {
  if (position === 'top') return `${Math.round(height * 0.08)}`
  if (position === 'bottom') return `h-th-${Math.round(height * 0.08)}`
  return '(h-th)/2'
}

// Escape a user title for drawtext's text= value, which we always emit wrapped in
// single quotes. ffmpeg takes everything between '' literally, so colons,
// backslashes and commas need no escaping — but a literal ' cannot appear inside
// a quoted run at all. The only way to embed one is to close the quote, emit an
// escaped quote, and reopen: '\''. (Backslash-escaping the quote instead ends the
// quoted run early, and ffmpeg then parses the rest of the chain as drawtext
// options — the graph dies with "Option not found".)
//
// The value still passes through drawtext's own text expansion, so the filter
// sets expansion=none; see buildFfmpegArgs. Newlines are dropped to a space.
export function escapeDrawtext(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/'/g, "'\\''")
}

// The normalize chain applied to EVERY segment so heterogeneous sources (a 1080p
// mp4, a square webp, a title card) become one uniform stream that concat/xfade
// can join: scale to fit, pad to the canvas, square pixels, fixed fps, yuv420p.
function normalizeChain(width: number, height: number, fps: number): string {
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
    `fps=${fps}`,
    'format=yuv420p',
  ].join(',')
}

// Build the complete ffmpeg argv for a render plan. PURE — this is the tested
// surface. The graph is a left-fold over segments: each boundary is either an
// xfade overlap (crossfade) or a concat (hard cut), so mixed transitions compose
// correctly and the accumulated stream's visible length is tracked for xfade
// offsets.
export function buildFfmpegArgs(plan: RenderPlan): string[] {
  const { width, height, segments, audio, fontPath, outputPath, fps } = plan
  if (segments.length === 0) throw new Error('cannot render a film with no shots')

  const inputs: string[] = []
  const filters: string[] = []

  // ── Inputs ────────────────────────────────────────────────────────────────
  // Video: plain -i. Image: -loop 1 -t <dur> so a still fills its slot. Title
  // card (no file): a lavfi color source sized to the canvas for <dur>.
  segments.forEach((seg) => {
    if (seg.kind === 'title' || seg.file === null) {
      inputs.push(
        '-f',
        'lavfi',
        '-t',
        seg.durationSec.toFixed(3),
        '-i',
        `color=c=black:s=${width}x${height}:r=${fps}`,
      )
    } else if (seg.kind === 'image') {
      inputs.push('-loop', '1', '-t', seg.durationSec.toFixed(3), '-i', seg.file)
    } else {
      inputs.push('-i', seg.file)
    }
  })
  // Audio inputs follow the video inputs; their input index is offset by the
  // number of video segments.
  audio.forEach((track) => inputs.push('-i', track.file))

  // ── Per-segment video normalize (+ trim for video, + title overlay) ─────────
  segments.forEach((seg, i) => {
    const parts: string[] = []
    // A real video clip is trimmed to its [start, start+duration) window; images
    // and title cards are already bounded by -t on the input.
    if (seg.kind === 'video' && seg.file !== null) {
      parts.push(
        `trim=start=${seg.trimStartSec.toFixed(3)}:duration=${seg.durationSec.toFixed(3)}`,
        'setpts=PTS-STARTPTS',
      )
    }
    parts.push(normalizeChain(width, height, fps))
    // Title overlay — only when a font was resolved (a missing font skips the
    // text rather than failing the whole export). expansion=none makes the title
    // literal: by default drawtext substitutes `%{...}` tokens per frame, so a
    // title like "50%{done}" would render as evaluated metadata instead of the
    // words the user typed.
    if (seg.title && fontPath) {
      const text = escapeDrawtext(seg.title.text)
      parts.push(
        `drawtext=fontfile='${fontPath}':expansion=none:text='${text}':fontcolor=white:fontsize=${Math.round(
          height * 0.06,
        )}:box=1:boxcolor=black@0.5:boxborderw=${Math.round(height * 0.02)}:x=(w-tw)/2:y=${titleY(
          seg.title.position,
          height,
        )}`,
      )
    }
    filters.push(`[${i}:v]${parts.join(',')}[v${i}]`)
  })

  // ── Fold the segments into one [outv] via xfade (crossfade) or concat (cut) ──
  // The fold also records each segment's START on the final timeline (a cut
  // starts where the accumulated stream ends; a crossfade starts t earlier,
  // inside the overlap) — the native-audio chains below delay each clip's own
  // soundtrack to exactly this offset, so picture and sound stay in lockstep
  // through any mix of cuts and fades.
  const segmentStartSec: number[] = [0]
  let acc = '[v0]'
  let accLen = segments[0]!.durationSec
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]!
    const next = `[v${i}]`
    const out = i === segments.length - 1 ? '[outv]' : `[x${i}]`
    // Clamp a crossfade to strictly less than both neighbouring durations, else
    // xfade produces a black/garbled overlap.
    const t = Math.min(seg.transitionSec, accLen - 0.05, seg.durationSec - 0.05)
    if (!seg.crossfade || t <= 0) {
      filters.push(`${acc}${next}concat=n=2:v=1:a=0${out}`)
      segmentStartSec.push(accLen)
      accLen = accLen + seg.durationSec
    } else {
      const offset = accLen - t
      filters.push(
        `${acc}${next}xfade=transition=fade:duration=${t.toFixed(3)}:offset=${offset.toFixed(3)}${out}`,
      )
      segmentStartSec.push(offset)
      accLen = accLen + seg.durationSec - t
    }
    acc = out
  }
  // Single-shot film: no boundary was folded, so [v0] never got renamed. Alias it.
  if (segments.length === 1) filters.push(`[v0]null[outv]`)

  // ── Audio: native clip soundtracks + film tracks → one mix, capped to film ──
  // Native audio (a clip generated WITH sound, shot.audio on): the clip's own
  // stream is trimmed to the shot's window and delayed to the segment's timeline
  // start recorded by the fold above. During a crossfade two soundtracks overlap
  // for the fade's length — the same overlap the PICTURE has, which is what a
  // crossfade sounds like everywhere else.
  const mixLabels: string[] = []
  segments.forEach((seg, i) => {
    if (!seg.nativeAudio) return
    const delayMs = Math.round((segmentStartSec[i] ?? 0) * 1000)
    filters.push(
      `[${i}:a]atrim=start=${seg.trimStartSec.toFixed(3)}:duration=${seg.durationSec.toFixed(3)},` +
        `asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[na${i}]`,
    )
    mixLabels.push(`[na${i}]`)
  })
  // Film tracks (music beds / voiceover): delay each to its start, apply gain.
  // The film's length is the VIDEO timeline (accLen). A music bed longer than the
  // timeline must not stretch the export, so the mix is trimmed to accLen. We
  // cannot use `-shortest` for this: when a track is SHORTER than the timeline
  // (a voiceover over a long film) it would truncate the video instead. atrim
  // caps a long mix and leaves a short one alone, which is the behaviour we want
  // in both directions.
  const audioBase = segments.length
  audio.forEach((track, j) => {
    const idx = audioBase + j
    const delayMs = Math.round(track.startSec * 1000)
    const volume = Math.pow(10, track.gainDb / 20) // dB → linear amplitude
    filters.push(`[${idx}:a]adelay=${delayMs}|${delayMs},volume=${volume.toFixed(3)}[a${j}]`)
    mixLabels.push(`[a${j}]`)
  })
  let hasAudio = false
  if (mixLabels.length > 0) {
    filters.push(
      `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:normalize=0[amixed]`,
    )
    filters.push(`[amixed]atrim=0:${accLen.toFixed(3)},asetpts=PTS-STARTPTS[outa]`)
    hasAudio = true
  }

  return [
    '-hide_banner',
    '-nostdin',
    ...inputs,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[outv]',
    ...(hasAudio ? ['-map', '[outa]'] : []),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : []),
    '-movflags',
    '+faststart',
    // Progress on stdout so the runner can parse out_time_ms without touching stderr.
    '-progress',
    'pipe:1',
    '-y',
    outputPath,
  ]
}

// Total timeline duration in ms (accounting for crossfade overlaps) — the runner
// divides ffmpeg's out_time by this to compute a 0–100 percent.
export function totalDurationMs(shots: Pick<Shot, 'durationMs' | 'transition' | 'transitionMs'>[]): number {
  let total = 0
  shots.forEach((shot, i) => {
    total += shot.durationMs
    if (i > 0 && shot.transition === 'crossfade') total -= Math.min(shot.transitionMs, shot.durationMs)
  })
  return Math.max(total, 1)
}

export type RenderRunResult = { ok: true } | { ok: false; error: string }

// Spawn ffmpeg with the built argv and resolve when it exits. `onProgress` is
// called with 0–100 as -progress lines arrive. Injectable `spawnFn` lets tests
// drive the runner without a real ffmpeg. Never throws — a non-zero exit or a
// missing binary resolves to { ok:false } so the caller settles the render row.
export async function runFfmpeg(
  args: string[],
  totalMs: number,
  onProgress: (percent: number) => void,
  ffmpegPath: string | null = FFMPEG_PATH,
  spawnFn: typeof spawn = spawn,
): Promise<RenderRunResult> {
  if (!ffmpegPath) return { ok: false, error: 'ffmpeg binary not available' }
  return new Promise<RenderRunResult>((resolve) => {
    let child
    try {
      child = spawnFn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      resolve({ ok: false, error: err instanceof Error ? err.message : 'spawn failed' })
      return
    }
    let stderrTail = ''
    child.stdout?.on('data', (buf: Buffer) => {
      // -progress emits `out_time_ms=<micros>` lines (the key is ms but the value
      // is microseconds in ffmpeg 6). Map to percent, clamped.
      const text = buf.toString()
      const match = /out_time_ms=(\d+)/.exec(text)
      if (match) {
        const outMs = Number(match[1]) / 1000
        const pct = Math.max(0, Math.min(99, Math.round((outMs / totalMs) * 100)))
        onProgress(pct)
      }
    })
    child.stderr?.on('data', (buf: Buffer) => {
      // Keep only the tail — ffmpeg stderr is verbose; the last lines carry the
      // real failure reason.
      stderrTail = (stderrTail + buf.toString()).slice(-2000)
    })
    child.on('error', (err: Error) => resolve({ ok: false, error: err.message }))
    child.on('close', (code: number | null) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, error: stderrTail.trim().split('\n').slice(-3).join(' ') || `ffmpeg exited ${code}` })
    })
  })
}

// A tiny counting semaphore bounding concurrent renders across the process.
export function createSemaphore(max: number) {
  let active = 0
  const queue: Array<() => void> = []
  return {
    async acquire(): Promise<() => void> {
      if (active >= max) await new Promise<void>((r) => queue.push(r))
      active++
      let released = false
      return () => {
        if (released) return
        released = true
        active--
        queue.shift()?.()
      }
    },
    get active() {
      return active
    },
  }
}
