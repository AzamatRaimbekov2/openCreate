// Normalize a browser-rendered turntable into a universally playable mp4.
//
// The client already encodes H.264 via WebCodecs, so this is NOT a rescue job —
// it is a GUARANTEE. Three things it buys, none of which the browser promises:
//   +faststart  — the moov atom moves to the front, so the clip streams instead of
//                 waiting for a full download (a WebCodecs mux puts it at the end)
//   yuv420p     — Safari and QuickTime refuse 4:4:4 and 10-bit; a Chrome encode can
//                 legally produce either
//   a height cap — an oversized upload cannot silently become an oversized asset
//
// PURE argv builder, exactly like films/render.ts's buildFfmpegArgs: the graph is
// the tested surface, so a filtergraph regression is caught without running ffmpeg.
export type NormalizePlan = {
  inputPath: string
  outputPath: string
  // Absent → no scale filter at all. Re-scaling a clip that is already the right
  // size is pure quality loss, so the cap must be opt-in rather than a default.
  maxHeight?: number
}

export function buildNormalizeArgs(plan: NormalizePlan): string[] {
  const { inputPath, outputPath, maxHeight } = plan
  // Two things this expression has to get right at once:
  //  · min(1, cap/ih) clamps the scale factor to at most 1 — a 720p input stays
  //    720p rather than being blown up to meet the cap.
  //  · trunc(../2)*2 forces BOTH dimensions even, which yuv420p requires (it
  //    subsamples chroma 2x2); an odd dimension makes ffmpeg refuse the encode.
  const scale = maxHeight
    ? [
        '-vf',
        `scale='trunc(iw*min(1,${maxHeight}/ih)/2)*2':'trunc(min(ih,${maxHeight})/2)*2'`,
      ]
    : []
  return [
    '-hide_banner',
    '-nostdin',
    '-i',
    inputPath,
    ...scale,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    // A turntable is silent. Dropping any audio track keeps the artifact small and
    // removes a whole class of container surprises.
    '-an',
    '-movflags',
    '+faststart',
    '-y',
    outputPath,
  ]
}
