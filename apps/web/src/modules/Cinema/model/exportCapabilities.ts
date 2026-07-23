// apps/web/src/modules/Cinema/model/exportCapabilities.ts
// The client-export capability gate (ADR: client-side-export §"capability gate").
// WebCodecs (VideoEncoder + AudioEncoder) is REQUIRED — without it there is no
// hardware encode and we must not offer the export. File System Access
// (`showSaveFilePicker`) enables STREAMING the mux straight to disk so memory stays
// flat for a 30-minute film; where it is absent (Safari/Firefox today) the pipeline
// falls back to an in-memory blob download, which grows with length — long films
// degrade there (documented, not a blocker). Pure detection so the UI gate + the
// message are unit-testable by stubbing the globals.

export type ExportCapability = {
  // WebCodecs present → the export can run at all.
  supported: boolean
  // File System Access present → stream to disk (flat memory); else blob fallback.
  streaming: boolean
}

export function exportCapabilities(): ExportCapability {
  const hasWebCodecs =
    typeof globalThis.VideoEncoder !== 'undefined' && typeof globalThis.AudioEncoder !== 'undefined'
  // `showSaveFilePicker` lives on window; typeof-guarded so a non-browser/jsdom
  // environment reads it as absent rather than throwing.
  const hasFileSystemAccess =
    typeof (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'
  return { supported: hasWebCodecs, streaming: hasWebCodecs && hasFileSystemAccess }
}

export function isExportSupported(): boolean {
  return exportCapabilities().supported
}
