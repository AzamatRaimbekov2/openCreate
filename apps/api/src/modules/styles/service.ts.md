# service.ts (styles) — AI component doc

> AI-facing sidecar for `modules/styles/service.ts`. Created 2026-07-31. Keep this in sync with the code on every change.

## Purpose
The **style registry** (ADR `docs/wiki/decisions/style-studio.md` D1) — the service that answers
"what does `styleId` X mean, for THIS caller?" from two sources: the seven builtin styles that ship
as code (`STYLE_PRESETS`), and the caller's own rows in the `style` table. Also the owner-scoped CRUD
behind `/api/styles`.

## What it does (for an AI reader)
- Responsibilities: list builtin + own styles; create/update/delete a user's own style; attach and
  detach the style package's reference images; resolve a style id to prompt fragments **and stored
  image paths** for the generation service; resolve a cited preview generation to a media URL.
- Public API / exports:
  - `createStyleService({ db, storage }) → StyleService`
  - `listStyles(userId) → Style[]` (builtins first, then own, oldest first)
  - `createStyle(userId, CreateStyleInput) → Style`
  - `updateStyle(userId, styleId, UpdateStyleInput) → Style`
  - `deleteStyle(userId, styleId) → void`
  - `addReference(userId, styleId, dataUri) → Promise<Style>` (cap `STYLE_MAX_REFERENCES` = 3)
  - `removeReference(userId, styleId, refId) → Style` (unknown refId = no-op)
  - `resolveStyle(userId, styleId) → ResolvedStyle | null` where
    `ResolvedStyle = { fragment, negative, referenceImagePaths }`
  - Errors: `StyleNotFoundError` (→404), `StyleValidationError` (→400)
- Inputs → Outputs: wire inputs validated by the contracts schemas in `routes.ts` → `Style` DTOs; a
  style id + caller id → `{ fragment, negative, referenceImagePaths }` or `null`.
- Side effects: reads/writes the `style` table; READS the `generation` table (never writes it);
  WRITES uploaded reference bytes through `storage.saveDataUri` (never deletes them — see below).
  No network, **no credit ledger**.

## Dependencies
- Imports / depends on: `@opencreate/contracts` (`resolveBuiltinStyle`, `STYLE_PRESETS`,
  `STYLE_MAX_REFERENCES`, types), `db/schema` (`style`, `generation`), `db/client` (`Db`),
  `storage/local` (`StorageProvider`), `storage/dataUri` (`InvalidImageDataUriError`), drizzle,
  `node:crypto`.
- Used by: `modules/styles/routes.ts`; `app.ts` (constructs it before the generation service);
  the generation service via the injected `resolveStyle` function.

## Diagram
```mermaid
flowchart TD
  R["/api/styles routes"] --> S[styleService]
  S --> BI["STYLE_PRESETS<br/>(builtin, code)"]
  S --> T[("style table<br/>user rows")]
  S -.->|"read-only: own + succeeded + image"| G[("generation table")]
  S -->|"saveDataUri (cap 3)"| ST[("STORAGE_DIR<br/>/media/*")]
  GEN[generations create] -->|"resolveStyle(userId, id)"| S
  S -->|"{ fragment, negative,<br/>referenceImagePaths } or null"| GEN
  GEN -->|"null → 400 BEFORE chargeCredits"| X[no spend]
  GEN -->|"readAsDataUri, model gates,<br/>style refs trimmed first"| CH["server-only<br/>referenceImages channel"]
```

## Key decisions / gotchas
- **It takes NO generation service, on purpose.** The dependency runs styles → generations (create()
  resolves a style on every styled request), so depending back would close a cycle. What this module
  needs from a generation is four facts and no behaviour, so it reads the row directly — the same
  acyclicity choice, for the same reason, that `entities/service.ts` documents on `copyGeneratedAsset`.
- **Zero money code.** A style is text. The only spend near it is the PREVIEW, which is an ordinary
  `POST /api/generations` the SPA makes; this service only records which generation a style cites.
- **Foreign == missing (404), but builtin == 400.** A foreign row and a nonexistent one must be
  indistinguishable or status codes become a probe for which ids exist. A BUILTIN is the opposite
  case: it demonstrably exists (it ships in the SPA bundle and this service lists it), so answering
  404 would be a lie — the objection is to the ACTION, not the id. `refuseBuiltin` therefore runs
  BEFORE `requireStyle`, or a builtin would 404 (it has no row) and hide the real reason.
- **`resolvePreviewUrl` is used in two modes and that is the design.** WRITING a citation refuses
  null (a citation that resolves to nothing is a preview that will never render); READING one treats
  null as simply "no preview", so a generation deleted from the gallery leaves the list working with
  an empty slot instead of throwing. Ownership is re-checked on every READ rather than trusted from
  write time.
- **One refusal message for all four preview failure modes** (foreign / missing / unfinished /
  not-an-image), the `copyGeneratedAsset` precedent — the difference between "not yours" and "not
  there" must not leak.
- **Builtins are immutable for everyone, including their author.** Their ids are cited by templates,
  films and shots saved months ago; a mutable builtin would silently re-render all of them.
- **Deleting a style does not touch films/shots that used it** (ADR D4). The stored `styleId` stays
  and the next generation resolves to nothing and fails honestly — a delete must not silently edit
  the user's films.
- **`resolveStyle` checks builtin FIRST**, so a user row could never shadow a builtin id
  even if it somehow carried one. Its `null` deliberately does not distinguish unknown from foreign
  from deleted: all three are the same 400 at the caller.
- **`resolveStyle` answers PATHS, never bytes** (amendment A2). This service does no I/O for a
  generation: it says what the style IS, and the generation service — which already owns the closed
  `referenceImages` channel, the model capability gates and the failure behaviour — decides what its
  model can honour and reads only what it will actually send. Returning data URIs here would make
  every style resolution pay for three file reads even on a model that takes no references at all.
  A builtin resolves with `referenceImagePaths: []` — not a special case, a fact: code has nowhere
  to keep a file.
- **`addReference` mirrors `films/shot-references.addReference` operation for operation**: builtin
  refusal → ownership gate → cap check → `saveDataUri` → append. The cap runs BEFORE any bytes touch
  the disk, so the 4th upload is a clean 400 rather than a stored file nobody can reach.
  `InvalidImageDataUriError` is mapped to `StyleValidationError` (400), never leaked as a 500.
- **`removeReference` leaves the FILE on disk** — a harmless orphan a future sweep reclaims, the same
  treatment shot references and entity media get. An unknown `refId` is a **no-op returning 200**,
  not a 404: the caller's goal ("this ref is gone") is already true, which makes a retried DELETE
  safe. The column goes back to NULL when the last one is removed, so "nothing attached" has one
  representation rather than drifting into `'[]'`.
- **Stored `{ id, path }`, wire `{ id, url }`.** The column mirrors `shot.reference_images_json`
  exactly; `toDto` renames the key on the way out because the SPA consumes it as an `<img src>`. One
  rename in one place beats every component re-deriving it.
- **`storage` is a REQUIRED dep, not optional** like the generation service's `entities`. An upload
  that silently no-ops because a dependency was missing is worse than a construction error, and
  there is exactly one caller in the app.
- `kind` is fixed to `'prompt'` here and absent from the wire input, so it has exactly one decision
  point until a second kind exists — and the reference package deliberately did NOT become a second
  kind (amendment A1): it is a capability of the existing constructor, which is what keeps every
  style id already stored in a film/shot/template valid.

## Commits
- _no commit yet_
