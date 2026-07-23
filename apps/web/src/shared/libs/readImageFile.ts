// apps/web/src/shared/libs/readImageFile.ts
// Shared client-side validation + data-URI read for any user-attached image.
//
// WHY IT LIVES IN shared/ (moved here 2026-07-22): three modules now attach the
// same kind of file — the Generator composer's paperclip / dropzone, and the
// Cinema shot's reference images. If each kept its own type/size checks they
// would drift, and the drift lands on the WIRE: contracts caps the reference
// data-URI at 14MB of base64, so a component that forgot the 10MB file cap would
// produce a request the API rejects with a 400 the user cannot decode. One gate,
// many call sites — and Cinema cannot import from modules/Generator (the
// cross-module law), so the gate belongs in domain-agnostic shared/, not a fork.
//
// It is pure boundary validation (no business logic, no imports from modules) —
// exactly what shared/ is for.

// 10MB file cap — base64 inflates ~4/3, keeping us under the wire schema's 14MB
export const MAX_FILE_BYTES = 10 * 1024 * 1024

// Errors are returned as i18n KEYS (never rendered strings) so a language
// switch re-localizes an error that is already on screen. The keys stay under
// the generator.* namespace they were minted in — moving the file does not move
// the copy, and re-namespacing would churn every unrelated call site.
export type ReadImageError = 'generator.image.errors.type' | 'generator.image.errors.size'

export type ReadImageResult = { ok: true; dataUri: string } | { ok: false; errorKey: ReadImageError }

export function readImageFile(file: File): Promise<ReadImageResult> {
  if (!file.type.startsWith('image/')) {
    return Promise.resolve({ ok: false, errorKey: 'generator.image.errors.type' })
  }
  if (file.size > MAX_FILE_BYTES) {
    return Promise.resolve({ ok: false, errorKey: 'generator.image.errors.size' })
  }
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      // readAsDataURL always yields a string; the guard keeps the type airtight
      if (typeof reader.result === 'string') resolve({ ok: true, dataUri: reader.result })
      else resolve({ ok: false, errorKey: 'generator.image.errors.type' })
    }
    // A read failure is indistinguishable from an unreadable file to the user
    reader.onerror = () => resolve({ ok: false, errorKey: 'generator.image.errors.type' })
    reader.readAsDataURL(file)
  })
}
