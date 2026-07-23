// apps/api/src/modules/films/shot-split.ts
// Splitting one Cinema shot at a point on the timeline — the NLE's split-at-
// playhead. ADR: docs/wiki/decisions/cinema-studio.md.
//
// WHY THIS ENDPOINT EXISTS AT ALL. The split IS composable on the client: shorten
// shot A, add a shot B citing the same generation with a shifted trim window, and
// reorder B directly after A. But that is a THREE-call, non-atomic sequence, and a
// failure between calls (a dropped request, a reload) leaves a half-split film —
// A already shortened, B never created, or B created but never reordered. This
// endpoint collapses the three writes into ONE db transaction so the split is
// whole-or-nothing.
//
// WHY ITS OWN MODULE. films/service.ts is already well past the 500-line guideline;
// the task was explicit about not worsening it. This follows the shot-references
// precedent exactly: a small, self-contained sibling that reimplements the
// ownership gate locally and leans on the film service only for the read shape.
//
// Two disciplines carried over from the rest of the codebase:
//  1. OWNERSHIP IS THE TYPE SIGNATURE. requireShot takes userId first and scopes
//     every query by it; the SAME 404 for "missing" and "not yours" so an attacker
//     cannot probe id existence.
//  2. THE MONEY PATH IS UNTOUCHED. A split creates no generation and cites no new
//     asset — it only re-slices timeline metadata that already exists. It imports
//     no ledger; if it ever did, the design has gone wrong.
import { randomUUID } from 'node:crypto'
import { and, asc, eq, gt } from 'drizzle-orm'
import type { FilmDetail } from '@opencreate/contracts'
import type { Db } from '../../db/client'
import { film, shot } from '../../db/schema'
import { FilmNotFoundError, FilmValidationError } from './service'
import type { FilmService } from './service'

// The film service narrowed to the ONE method split needs: getFilm returns the
// exact FilmDetail shape GET /api/films/:id returns, so the split can hand the
// client a full, ordered replacement for its film cache in one response. Stating
// the narrowing in the type (like shot-references narrows generations to `create`)
// keeps this module from growing its own read path and lets a test pass a fake.
type SplitFilms = Pick<FilmService, 'getFilm'>

// Append gap for the LAST-shot case, mirroring films/service.ts's ORDER_STEP. When
// A has a successor, B lands at the MIDPOINT of A's and the successor's order
// indices instead — the REAL `order_index` column exists precisely so this insert
// needs no whole-list renumber (see schema.ts shot.orderIndex and reorderShots).
const ORDER_STEP = 1000

export type ShotSplitService = ReturnType<typeof createShotSplitService>

export function createShotSplitService({ db, films }: { db: Db; films: SplitFilms }) {
  // Ownership gate, reimplemented locally (like shot-references) so this module
  // stays self-contained: the film must be the caller's AND the shot must belong to
  // it. Same 404 for both, so a foreign id is indistinguishable from a missing one.
  function requireShot(userId: string, filmId: string, shotId: string) {
    const filmRow = db
      .select({ id: film.id })
      .from(film)
      .where(and(eq(film.id, filmId), eq(film.userId, userId)))
      .get()
    if (!filmRow) throw new FilmNotFoundError()
    const shotRow = db
      .select()
      .from(shot)
      .where(and(eq(shot.id, shotId), eq(shot.filmId, filmId)))
      .get()
    if (!shotRow) throw new FilmNotFoundError()
    return shotRow
  }

  // Split shot A at `atMs` (measured from A's OWN start). A keeps its trim in-point
  // and is truncated to atMs; a NEW shot B is inserted DIRECTLY AFTER A, citing the
  // SAME generation, with its trim window shifted by atMs and the remaining
  // duration. The whole thing is ONE transaction so a crash can never leave a
  // half-split film. Returns the updated FilmDetail (same shape as GET /api/films/:id).
  function splitShot(userId: string, filmId: string, shotId: string, atMs: number): FilmDetail {
    // `a` is the PRE-split snapshot — read before the transaction mutates the row —
    // so a.durationMs/a.trimStartMs below are the ORIGINAL values B is derived from.
    const a = requireShot(userId, filmId, shotId)
    // The invariant the wire schema cannot check: the cut must land STRICTLY INSIDE
    // the shot. atMs>=durationMs would leave B a zero/negative length; atMs<=0 an
    // empty A. The schema already rejects non-positive atMs, but the SERVICE owns the
    // whole `0 < atMs < durationMs` rule so it holds even when called directly — and
    // it is the only layer that can see durationMs. Same 400 validation_failed either way.
    if (atMs <= 0 || atMs >= a.durationMs)
      throw new FilmValidationError('atMs must be greater than 0 and less than the shot duration')

    db.transaction((tx) => {
      // B's order index: the MIDPOINT between A and its successor (so B slots between
      // them with no renumber), or A + STEP when A is the last shot. The REAL column
      // makes fractional midpoints representable — this is the "future midpoint
      // insert" the order-index spacing was designed for.
      const next = tx
        .select({ orderIndex: shot.orderIndex })
        .from(shot)
        .where(and(eq(shot.filmId, filmId), gt(shot.orderIndex, a.orderIndex)))
        .orderBy(asc(shot.orderIndex))
        .limit(1)
        .get()
      const bOrderIndex = next ? (a.orderIndex + next.orderIndex) / 2 : a.orderIndex + ORDER_STEP

      // A is truncated to the split offset; its trim in-point is unchanged.
      tx.update(shot).set({ durationMs: atMs }).where(eq(shot.id, a.id)).run()

      // B continues the SAME clip past the cut. It copies what describes the FOOTAGE:
      //  · generationId — the same source clip (a split cites, it does not generate),
      //  · prompt / promptPreset / modelId — how that clip was (or would be) made,
      //  · audio — the clip's native-audio flag is a property of the CLIP, and B plays
      //    the same clip, so its window carries the same soundtrack behaviour.
      // It deliberately does NOT copy what belongs to A's MOMENT (owner-approved):
      //  · title — a title card is one beat's card, not both halves',
      //  · voiceover — a line authored for A's timing,
      //  · entityRefs / referenceImages — attached for A's frame; carrying them would
      //    silently re-bill the same cast onto B's next generation.
      // And B enters from A with NO transition: the two halves are contiguous frames
      // of one clip, so a crossfade between them would double-expose the footage.
      tx.insert(shot)
        .values({
          id: randomUUID(),
          filmId,
          orderIndex: bOrderIndex,
          generationId: a.generationId,
          prompt: a.prompt,
          promptPresetJson: a.promptPresetJson,
          entityRefsJson: null,
          referenceImagesJson: null,
          modelId: a.modelId,
          durationMs: a.durationMs - atMs,
          trimStartMs: a.trimStartMs + atMs,
          transition: 'none',
          transitionMs: 0,
          titleJson: null,
          voiceoverJson: null,
          audio: a.audio,
          createdAt: new Date(),
        })
        .run()

      // Bump the film's updatedAt in the SAME transaction — the split is one logical
      // change to the film's timeline, so its "last touched" moment moves with it.
      tx.update(film).set({ updatedAt: new Date() }).where(eq(film.id, filmId)).run()
    })

    // Hand back the whole FilmDetail (both halves already in timeline order) so the
    // client replaces its film cache wholesale rather than reconciling two shots.
    return films.getFilm(userId, filmId)
  }

  return { splitShot }
}
