# blobToDataUri.ts — AI component doc

> AI-facing sidecar for `blobToDataUri.ts`. Created 2026-07-24. Keep this in sync with the code on every change.

## Purpose
Read a fetched `Blob`'s bytes into a `data:` URI — the exact payload our upload
endpoints accept. Extracted to `shared/libs` so a fetch-then-POST flow never
hand-rolls the `FileReader` dance a second time (it previously lived, un-exported,
inside `Cinema/components/ShotReferenceImages.tsx`).

## What it does (for an AI reader)
- Responsibilities:
  - Turn already-trusted bytes (fetched from our OWN `/media` storage) into a
    `data:<mime>;base64,...` string a JSON POST can carry.
  - The READ-only twin of `readImageFile` (which VALIDATES a user's `File` before
    reading); this one skips validation because the bytes are already ours.
- Public API / exports / props / endpoints:
  - `blobToDataUri(blob: Blob): Promise<string>` — resolves the data URI, rejects
    (`Error('unreadable')`) on a failed/non-string read.
- Inputs → Outputs: `Blob` → `Promise<string>` (a `data:` URI).
- Side effects (I/O, network, state): none beyond the in-memory `FileReader` read
  (no network, no module state).

## Dependencies
- Imports / depends on: nothing (domain-agnostic; browser `FileReader`/`Blob`).
- Used by: `Cinema/components/ShotReferenceImages.tsx` (gallery-pick attach) and
  `Cinema/model/makeCharacterApi.ts` (re-home a reference as a character photo).

## Diagram
```mermaid
flowchart LR
  BYTES[fetched /media Blob] --> READ[blobToDataUri.ts FileReader] --> URI[data: URI]
  URI --> POST[JSON POST body]
```

## Key decisions / gotchas
- Lives in `shared/libs` (not a module) so both Cinema call sites — and any future
  module that Cinema cannot import from — share one canonical read.
- Rejects rather than resolving a sentinel: callers already own ONE localized
  error notice and prefer a throw they can `catch`/surface.
- Not a validation gate — never pass an unchecked user `File` here; use
  `readImageFile` for that (type/size cap).

## Commits
- _no commit yet_
