// apps/web/src/modules/Soul/model/portraitSheet.ts
// The reference sheet as DATA: which view is filled, which is missing, and what
// the next mint will cost — all pure, all derived from the contract tables.
//
// WHY THE PRICE IS COMPUTED HERE AND NOT INSIDE A BUTTON:
// a sheet is N paid jobs, and which model renders a view depends on a state the
// user cannot see (does a primary photo exist yet?). The server owns that rule
// (soul.ts SOUL_HERO_MODEL_ID / SOUL_SHEET_MODEL_ID); the web must MIRROR it to
// print the price BEFORE the click — never to choose the model. Reading the
// credits off the live catalog (instead of hardcoding 2 and 8) means a catalogue
// re-price cannot leave the button lying about what the user is about to spend.
import {
  PORTRAIT_SHEET_VIEWS,
  SOUL_HERO_MODEL_ID,
  SOUL_SHEET_MODEL_ID,
} from '@opencreate/contracts'
import type { CatalogModel, Entity, EntityImage, PortraitView } from '@opencreate/contracts'

export type SheetSlot = {
  // One of the four sheet views, in PORTRAIT_SHEET_VIEWS order
  view: PortraitView
  // The portrait filling it, or null when this view has not been minted yet
  image: EntityImage | null
}

// The sheet, always four slots, always in order — a missing view is a slot with
// no image, never an absent row. The grid must not re-flow as portraits land.
export function sheetSlots(entity: Entity): SheetSlot[] {
  return PORTRAIT_SHEET_VIEWS.map((view) => ({
    view,
    // An ordinary upload has `view: null` and therefore fills no slot
    image: entity.images.find((image) => image.view === view) ?? null,
  }))
}

// The state the model rule keys on. NOT "has any image": a user can upload a
// photo to a soul character, and that upload is a primary — which is exactly
// what lets flux-kontext-pro reference it.
export function hasPrimaryPhoto(entity: Entity): boolean {
  return entity.primaryImageId !== null
}

export function missingViews(entity: Entity): PortraitView[] {
  return sheetSlots(entity)
    .filter((slot) => slot.image === null)
    .map((slot) => slot.view)
}

// A soul portrait is always an IMAGE model; a video model in this slot would be
// a catalogue bug, and returning null (rather than guessing) keeps the button
// disabled instead of quoting a price from the wrong price table.
function imageModelCredits(models: CatalogModel[], modelId: string): number | null {
  const model = models.find((candidate) => candidate.id === modelId)
  if (!model || model.type !== 'image') return null
  return model.credits
}

export function heroCredits(models: CatalogModel[]): number | null {
  return imageModelCredits(models, SOUL_HERO_MODEL_ID)
}

export function sheetCredits(models: CatalogModel[]): number | null {
  return imageModelCredits(models, SOUL_SHEET_MODEL_ID)
}

// What minting `views` costs RIGHT NOW. With no photo yet, the FIRST view is the
// hero shot (cheap, unreferenced) and every later one references it (expensive)
// — so a fresh four-view sheet is 2 + 3×8 = 26, and the same four views on a
// character that already has a photo are 4×8. Null while the catalog is still
// loading: a button with an unknown price must be disabled, not optimistic.
export function priceViews(
  views: readonly PortraitView[],
  entityHasPrimaryPhoto: boolean,
  models: CatalogModel[],
): number | null {
  if (views.length === 0) return 0

  const sheet = sheetCredits(models)
  if (sheet === null) return null

  if (entityHasPrimaryPhoto) return sheet * views.length

  const hero = heroCredits(models)
  if (hero === null) return null
  return hero + sheet * (views.length - 1)
}
