// apps/web/src/modules/Soul/model/imageToDataUri.ts
// Read one of OUR stored images back as a data URI, so it can travel as
// `inputImage` on a generation request.
//
// WHY THE BYTES MAKE THE ROUND TRIP AT ALL: the generation contract accepts
// `inputImage` as a data URI and nothing else — the API never fetches a
// client-supplied URL (the SSRF guard, entity.ts). "Оживить" animates a portrait
// the user already owns, so the browser fetches it from our own /media origin and
// hands the bytes back. It is a few hundred KB on one explicit, priced click.
//
// The url ALWAYS points at our storage (entity images are copied in on attach —
// never a provider URL), so this is a same-origin read; no CORS mode is set,
// because a cross-origin one would silently return an opaque blob we could not
// encode.

export async function imageToDataUri(url: string): Promise<string> {
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) throw new Error(`Could not read the portrait (${response.status})`)
  const blob = await response.blob()

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    // readAsDataURL always yields a string; the guard keeps the type airtight
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read the portrait'))
    }
    reader.onerror = () => reject(new Error('Could not read the portrait'))
    reader.readAsDataURL(blob)
  })
}
