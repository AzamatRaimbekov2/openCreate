// apps/web/src/shared/libs/blobToDataUri.ts
// Read a fetched Blob's bytes into a `data:` URI — the exact payload our upload
// endpoints accept. The twin of readImageFile: that gate VALIDATES a user's File
// (type/size) before reading; this one just READS already-trusted bytes we
// fetched from our OWN /media storage (a gallery pick, or an attached reference
// we are re-homing as a character's photo). One canonical "bytes → URI" shape so
// a fetch-then-POST flow never hand-rolls the FileReader dance a second time.
//
// Domain-agnostic boundary util (no module imports) — exactly what shared/ is
// for, and reachable from any module that Cinema cannot import from. Rejects on
// an unreadable read so the caller can surface ONE localized notice.
export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('unreadable'))
    reader.onerror = () => reject(new Error('unreadable'))
    reader.readAsDataURL(blob)
  })
}
