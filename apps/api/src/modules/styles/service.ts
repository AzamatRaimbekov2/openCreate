// apps/api/src/modules/styles/service.ts
// The style registry (ADR: style-studio D1) — the thing that answers "what does
// styleId X mean, for THIS caller?" from two sources: the seven builtin styles
// that ship as code, and the caller's own rows in the `style` table.
//
// WHY IT TAKES NO GENERATION SERVICE. The dependency runs the other way: the
// generation service calls resolveStyleFragments on every styled create(), so
// depending back on it would close a cycle. What this module needs from a
// generation is four facts and no behaviour, so it reads the row DIRECTLY —
// the same deliberate acyclicity choice, for the same reason, that
// entities/service.ts documents on copyGeneratedAsset.
//
// ZERO MONEY CODE. A style is text. The only spend anywhere near it is the
// PREVIEW, and that is an ordinary POST /api/generations the SPA makes on its
// own; this service merely records which generation a style cites. The registry
// never charges, never refunds, and never touches the ledger.
import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { resolveBuiltinStyle, STYLE_MAX_REFERENCES, STYLE_PRESETS } from '@opencreate/contracts'
import type {
  CreateStyleInput,
  Style,
  StyleFragments,
  StyleReferenceImage,
  UpdateStyleInput,
} from '@opencreate/contracts'
import type { Db } from '../../db/client'
import type { StorageProvider } from '../../storage/local'
import { InvalidImageDataUriError } from '../../storage/dataUri'
import { generation, style } from '../../db/schema'

// What a resolved style MEANS to the money path (ADR style-studio D3, extended
// by amendment A2): the two composition strings, plus the stored paths of the
// package's images.
//
// PATHS, NOT BYTES, and that split is the design. This service does no I/O for a
// generation: it answers what the style is, and the generation service — which
// already owns the closed server-only referenceImages channel, the model
// capability gates and the failure behaviour — decides what its model can
// honour and reads only what it will actually send. Handing back data URIs here
// would make every style resolution pay for three file reads even on a model
// that cannot take a single reference.
export type ResolvedStyle = StyleFragments & { referenceImagePaths: string[] }

// The stored shape, byte-identical to shot.reference_images_json. The WIRE shape
// renames `path` to `url` (styleReferenceImageSchema) because the SPA consumes it
// as an <img src>; the column keeps the shot's spelling so the two reference
// stores stay recognizably the same thing.
type StoredStyleReference = { id: string; path: string }

// Foreign and missing raise the SAME error (films/canvas precedent): an
// attacker must not learn which style ids exist by reading status codes.
export class StyleNotFoundError extends Error {
  constructor() {
    super('Style not found')
    this.name = 'StyleNotFoundError'
  }
}

// A 400, not a 404, and the distinction is deliberate. Editing a BUILTIN is
// refused because builtins are code, not because the id is unknown — a builtin
// demonstrably exists (it ships in the SPA bundle and this very service lists
// it), so answering "not found" would be a lie. The same class carries the
// preview-citation refusal.
export class StyleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StyleValidationError'
  }
}

// ONE message for every way a preview citation can fail — foreign, missing,
// unfinished, or not an image. Four default-deny checks that must stay
// indistinguishable, or the difference between "not yours" and "not there"
// becomes a probe for other people's generation ids (copyGeneratedAsset and the
// canvas chain edge share this exact wording discipline).
const PREVIEW_REFUSAL = 'previewGenerationId must cite your own succeeded image generation'

// `storage` arrived with the reference package and is REQUIRED rather than
// optional: an upload that silently no-ops because a dependency was missing is
// worse than a construction error, and there is exactly one caller in the app.
type Deps = { db: Db; storage: StorageProvider }

export type StyleService = ReturnType<typeof createStyleService>

export function createStyleService({ db, storage }: Deps) {
  // Resolve a cited generation to the caller's own stored image, or null.
  // Used in two modes and that is the whole design:
  //  · WRITING a citation (updateStyle) — null must be refused, because a
  //    citation that resolves to nothing is a preview that will never render;
  //  · READING one (toDto) — null is simply "no preview". A generation deleted
  //    from the gallery, or one that failed after the fact, must leave the style
  //    listing fine with an empty slot, never throw. Ownership is re-checked on
  //    every read rather than trusted from write time, so a row that somehow
  //    cites a foreign generation still shows the caller nothing.
  function resolvePreviewUrl(userId: string, generationId: string | null): string | null {
    if (!generationId) return null
    const row = db.select().from(generation).where(eq(generation.id, generationId)).get()
    if (!row || row.userId !== userId || row.status !== 'succeeded' || row.type !== 'image')
      return null
    return (JSON.parse(row.mediaJson) as string[])[0] ?? null
  }

  // The stored package, as an array. NULL — every row written before the column
  // existed, and every style with nothing attached — reads as [], never null,
  // so no caller here or on the wire branches on absence.
  const readRefs = (row: typeof style.$inferSelect): StoredStyleReference[] =>
    row.referenceImagesJson ? (JSON.parse(row.referenceImagesJson) as StoredStyleReference[]) : []

  function toDto(userId: string, row: typeof style.$inferSelect): Style {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      builtin: false,
      fragment: row.fragment,
      negative: row.negative,
      recommendedModelId: row.recommendedModelId,
      previewUrl: resolvePreviewUrl(userId, row.previewGenerationId),
      // path → url at the wire boundary: the value is the same '/media/…' string
      // either way, and the rename is where it belongs — one place, on the way
      // out — rather than in every component that renders a thumbnail.
      referenceImages: readRefs(row).map(
        (ref): StyleReferenceImage => ({ id: ref.id, url: ref.path }),
      ),
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }
  }

  // The builtin half of the list, derived from the same table the composer uses.
  // `label` becomes `name`: one word for "what this style is called", whichever
  // source it came from, is what lets a picker render both without branching.
  function builtinDtos(): Style[] {
    return Object.values(STYLE_PRESETS).map((preset) => ({
      id: preset.id,
      name: preset.label,
      kind: 'prompt' as const,
      builtin: true,
      fragment: preset.fragment,
      negative: preset.negative,
      recommendedModelId: preset.recommendedModelId,
      // Builtins are code: no row, so no preview and no history. The nulls are
      // information, not padding — they tell a client there is nothing to show.
      previewUrl: null,
      // Empty for the same reason, and permanently: a builtin has nowhere to
      // store an uploaded file. [] rather than a missing key so the picker maps
      // builtins and user rows through the identical code path.
      referenceImages: [],
      createdAt: null,
      updatedAt: null,
    }))
  }

  // Ownership gate. Every mutating path goes through it, and it answers the
  // same error for a foreign row as for one that does not exist.
  function requireStyle(userId: string, styleId: string) {
    const row = db
      .select()
      .from(style)
      .where(and(eq(style.id, styleId), eq(style.userId, userId)))
      .get()
    if (!row) throw new StyleNotFoundError()
    return row
  }

  // Builtins are immutable for EVERYONE, including whoever wrote them: their
  // ids are cited by templates, films and shots that were saved months ago, and
  // a mutable builtin would silently re-render all of them.
  function refuseBuiltin(styleId: string): void {
    if (resolveBuiltinStyle(styleId))
      throw new StyleValidationError(`${styleId} is a builtin style and cannot be modified`)
  }

  return {
    // Builtins FIRST, then the caller's own, oldest first — a stable order the
    // picker can render without sorting, with the familiar seven on top.
    listStyles(userId: string): Style[] {
      const own = db
        .select()
        .from(style)
        .where(eq(style.userId, userId))
        .orderBy(asc(style.createdAt))
        .all()
      return [...builtinDtos(), ...own.map((row) => toDto(userId, row))]
    },

    createStyle(userId: string, input: CreateStyleInput): Style {
      const id = randomUUID()
      const now = new Date()
      db.insert(style)
        .values({
          id,
          userId,
          // Trim at the domain boundary: " Неон " and "Неон" are one style.
          name: input.name.trim(),
          // Fixed for the MVP. The wire cannot set it (createStyleInputSchema
          // has no `kind`), so this is the only place it is decided.
          kind: 'prompt',
          fragment: input.fragment.trim(),
          negative: input.negative.trim(),
          recommendedModelId: input.recommendedModelId ?? null,
          previewGenerationId: null,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      return toDto(userId, db.select().from(style).where(eq(style.id, id)).get()!)
    },

    updateStyle(userId: string, styleId: string, input: UpdateStyleInput): Style {
      // Builtin check BEFORE the ownership lookup: a builtin has no row, so
      // requireStyle would answer 404 and hide the real reason from the user.
      refuseBuiltin(styleId)
      requireStyle(userId, styleId)
      // The citation is validated the same way every other cite-a-generation
      // path validates one — the client may send any id, which is exactly why
      // the id alone proves nothing. Refused BEFORE the write, so a rejected
      // preview leaves the style untouched.
      if (input.previewGenerationId !== undefined) {
        if (!resolvePreviewUrl(userId, input.previewGenerationId))
          throw new StyleValidationError(PREVIEW_REFUSAL)
      }
      db.update(style)
        .set({
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.fragment !== undefined ? { fragment: input.fragment.trim() } : {}),
          ...(input.negative !== undefined ? { negative: input.negative.trim() } : {}),
          // Nullable, not merely optional: `null` CLEARS the recommendation,
          // absent leaves it alone. Hence the undefined check.
          ...(input.recommendedModelId !== undefined
            ? { recommendedModelId: input.recommendedModelId }
            : {}),
          ...(input.previewGenerationId !== undefined
            ? { previewGenerationId: input.previewGenerationId }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(style.id, styleId))
        .run()
      return toDto(userId, db.select().from(style).where(eq(style.id, styleId)).get()!)
    },

    // Deleting a style does NOT touch the films and shots that used it (ADR D4).
    // Their stored styleId stays, and the next generation on that shot resolves
    // to nothing and fails honestly with "unknown style" — the same shape as a
    // deleted generation read as an empty slot. Rewriting other aggregates from
    // here would be a delete that silently edits the user's films.
    deleteStyle(userId: string, styleId: string): void {
      refuseBuiltin(styleId)
      requireStyle(userId, styleId)
      db.delete(style).where(eq(style.id, styleId)).run()
    },

    // Attach one image to the package (ADR style-studio A1/A4), mirroring
    // films/shot-references.addReference operation for operation — same cap-first
    // ordering, same storage call, same error mapping — because it guards the
    // same things: a bounded number of files, written only for their owner.
    async addReference(userId: string, styleId: string, dataUri: string): Promise<Style> {
      // Builtin check BEFORE the ownership lookup, exactly as updateStyle does:
      // a builtin has no row, so requireStyle would answer 404 and hide the real
      // reason ("this one is code") behind a misleading "not found".
      refuseBuiltin(styleId)
      const row = requireStyle(userId, styleId)
      // Budget checked BEFORE any bytes touch the disk, so the (N+1)th upload is
      // a clean 400 rather than a stored file nobody can ever reach. >= because
      // at the cap the next upload is the one that overflows it.
      if (readRefs(row).length >= STYLE_MAX_REFERENCES)
        throw new StyleValidationError(
          `a style can carry at most ${STYLE_MAX_REFERENCES} reference images`,
        )
      // Fresh media key, independent of the style id: saveDataUri → parseImageDataUri
      // re-guards the DISK (raster only — no svg stored-XSS — and a decoded-byte cap)
      // even though the wire schema already refused svg. A rejected payload is the
      // client's fault, so it becomes a 400 rather than a 500 leaking the storage
      // error class out of the service.
      let path: string
      try {
        path = await storage.saveDataUri(dataUri, randomUUID())
      } catch (err) {
        if (err instanceof InvalidImageDataUriError) throw new StyleValidationError(err.message)
        throw err
      }
      const next: StoredStyleReference[] = [...readRefs(row), { id: randomUUID(), path }]
      db.update(style)
        .set({ referenceImagesJson: JSON.stringify(next), updatedAt: new Date() })
        .where(eq(style.id, styleId))
        .run()
      return toDto(userId, db.select().from(style).where(eq(style.id, styleId)).get()!)
    },

    // Detach one image. The stored FILE is deliberately left on disk — a harmless
    // orphan a future sweep reclaims — the same treatment shot references and
    // entity media get: the alternative is a delete that can fail halfway and
    // leave the row pointing at nothing. An unknown refId is a NO-OP rather than
    // a 404, because the caller's goal ("this ref is gone") is already true, which
    // also makes a retried DELETE safe.
    removeReference(userId: string, styleId: string, refId: string): Style {
      refuseBuiltin(styleId)
      const row = requireStyle(userId, styleId)
      const next = readRefs(row).filter((ref) => ref.id !== refId)
      db.update(style)
        .set({
          // Back to NULL when the last one goes, so "nothing attached" has ONE
          // representation in the column rather than drifting into '[]'.
          referenceImagesJson: next.length ? JSON.stringify(next) : null,
          updatedAt: new Date(),
        })
        .where(eq(style.id, styleId))
        .run()
      return toDto(userId, db.select().from(style).where(eq(style.id, styleId)).get()!)
    },

    // THE function the generation service calls, on every styled create, before
    // it charges. Builtin first — those ids are immutable and shared, so a user
    // row could never shadow one even if it somehow carried the same id — then
    // the caller's own row, then null.
    //
    // Null means "this caller cannot use this style", and it deliberately does
    // NOT distinguish unknown from foreign from deleted: all three are the same
    // 400 at the caller, so a generation request cannot be used to probe which
    // style ids exist.
    //
    // It answers the WHOLE package (amendment A2) — fragments and image paths in
    // one lookup — because the two always travel together and a second query
    // would be a second place for the ownership rule to be forgotten. A builtin
    // resolves with an empty path list, which is not a special case but a fact:
    // code has nowhere to keep a file.
    resolveStyle(userId: string, styleId: string): ResolvedStyle | null {
      const builtin = resolveBuiltinStyle(styleId)
      if (builtin)
        return {
          fragment: builtin.fragment,
          negative: builtin.negative,
          referenceImagePaths: [],
        }
      const row = db
        .select()
        .from(style)
        .where(and(eq(style.id, styleId), eq(style.userId, userId)))
        .get()
      return row
        ? {
            fragment: row.fragment,
            negative: row.negative,
            referenceImagePaths: readRefs(row).map((ref) => ref.path),
          }
        : null
    },
  }
}
