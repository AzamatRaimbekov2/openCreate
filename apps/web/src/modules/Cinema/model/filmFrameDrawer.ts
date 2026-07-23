// apps/web/src/modules/Cinema/model/filmFrameDrawer.ts
// Draw one export frame onto the canvas (ADR: client-side-export §Video) — the
// browser counterpart of render.ts's per-segment normalize + xfade + drawtext. For
// each `FramePlanEntry` it seeks the shot's clip `<video>` to `sourceMs`, draws it
// letterboxed (object-contain over black), cross-dissolves the outgoing shot
// beneath the incoming one (`entry.fade.alpha`), and paints the title card.
//
// ⚠️ IN-BROWSER VERIFIED ONLY — seeked `<video>` + canvas 2d have no jsdom
// equivalent; the pure `exportPlan` this consumes is unit-tested, this raster step
// is verified by a real-browser export. Decode approach = a SEEKED `<video>` per
// clip (not VideoDecoder): it reuses the browser's demux/decode for arbitrary
// codecs the /media clips ship in, and `requestVideoFrameCallback` guarantees the
// frame is present before we grab it. VideoDecoder would need per-codec config we
// do not have client-side.
import type { Shot, ShotTitle } from '@opencreate/contracts'
import type { FramePlanEntry } from './exportPlan'
import type { DrawFilmFrame } from './filmExportPorts'
import type { ResolveMediaUrl } from './filmExportAudio'

export type FilmFrameDrawer = { draw: DrawFilmFrame; dispose: () => void }

// Seek a video and resolve once THAT frame is actually decoded on screen.
// `requestVideoFrameCallback` (Safari/older) is not in every lib, so it is probed
// via a cast rather than `in` (which would narrow the element to `never`).
function seekTo(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve) => {
    const rvfc = (video as { requestVideoFrameCallback?: (cb: () => void) => number })
      .requestVideoFrameCallback
    if (typeof rvfc === 'function') {
      video.currentTime = seconds
      rvfc.call(video, () => resolve())
    } else {
      video.addEventListener('seeked', () => resolve(), { once: true })
      video.currentTime = seconds
    }
  })
}

export function createFilmFrameDrawer(
  canvas: HTMLCanvasElement,
  shots: readonly Shot[],
  resolveUrl: ResolveMediaUrl,
): FilmFrameDrawer {
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('The export canvas has no 2d context.')
  const width = canvas.width
  const height = canvas.height
  const byId = new Map(shots.map((shot) => [shot.id, shot]))
  // One <video> per generation, reused + re-seeked across frames (a 30-min film
  // must not allocate a decoder per frame).
  const videos = new Map<string, HTMLVideoElement>()

  const videoFor = (generationId: string): HTMLVideoElement | null => {
    const cached = videos.get(generationId)
    if (cached !== undefined) return cached
    const url = resolveUrl(generationId)
    if (url === null) return null
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.crossOrigin = 'anonymous'
    videos.set(generationId, video)
    return video
  }

  // object-contain a source into the canvas, over black.
  const drawContained = (image: CanvasImageSource, iw: number, ih: number, alpha: number) => {
    const scale = Math.min(width / iw, height / ih)
    const dw = iw * scale
    const dh = ih * scale
    ctx.globalAlpha = alpha
    ctx.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh)
    ctx.globalAlpha = 1
  }

  const drawShot = async (shotId: string, sourceMs: number, alpha: number) => {
    const shot = byId.get(shotId)
    if (shot === undefined || shot.generationId === null) return // title/empty → black beneath
    const video = videoFor(shot.generationId)
    if (video === null) return
    await seekTo(video, sourceMs / 1000)
    drawContained(video, video.videoWidth || width, video.videoHeight || height, alpha)
  }

  const drawTitle = (title: ShotTitle) => {
    const fontSize = Math.round(height * 0.06)
    ctx.font = `${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const y = title.position === 'top' ? height * 0.12 : title.position === 'bottom' ? height * 0.88 : height / 2
    const metrics = ctx.measureText(title.text)
    const padX = Math.round(height * 0.02)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(width / 2 - metrics.width / 2 - padX, y - fontSize / 2 - padX, metrics.width + padX * 2, fontSize + padX * 2)
    ctx.fillStyle = 'white'
    ctx.fillText(title.text, width / 2, y)
  }

  const draw: DrawFilmFrame = async (entry: FramePlanEntry) => {
    ctx.globalAlpha = 1
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, width, height)
    // Crossfade: the OUTGOING shot at full, then the INCOMING at alpha on top.
    if (entry.fade !== null) {
      await drawShot(entry.fade.fromShotId, entry.fade.fromSourceMs, 1)
      await drawShot(entry.shotId, entry.sourceMs, entry.fade.alpha)
    } else {
      await drawShot(entry.shotId, entry.sourceMs, 1)
    }
    const shot = byId.get(entry.shotId)
    if (shot?.title != null) drawTitle(shot.title)
  }

  const dispose = () => {
    videos.forEach((video) => {
      video.removeAttribute('src')
      video.load()
    })
    videos.clear()
  }

  return { draw, dispose }
}
