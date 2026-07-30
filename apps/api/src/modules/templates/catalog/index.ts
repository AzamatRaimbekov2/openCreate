// apps/api/src/modules/templates/catalog/index.ts
// The template registry — the single ordered list the /templates gallery renders.
//
// ADR: docs/wiki/decisions/template-catalog.md
//
// One file per template, on purpose. This catalog is meant to grow to dozens; a
// single templates.ts would be a thousand lines of prompt prose within a month,
// and prompts are the thing that gets iterated on most. One file per template
// keeps each one reviewable in a diff, keeps blame legible, and means adding a
// template is a new file plus one line here — never an edit to a shared blob.
//
// Order matters: it is the order of the cards in the gallery. Cheapest/simplest
// last is deliberate — the dramas are the reason someone opens this page.
import type { Template } from '../types'
import { anime } from './anime'
import { brickBuild } from './brick-build'
import { brickCastle } from './brick-castle'
import { brickCity } from './brick-city'
import { brickHeist } from './brick-heist'
import { brickNoir } from './brick-noir'
import { brickPirates } from './brick-pirates'
import { brickRace } from './brick-race'
import { brickSpace } from './brick-space'
import { buran } from './buran'
import { film } from './film'
import { fruitDrama } from './fruit-drama'
import { catDrama } from './cat-drama'
import { serial } from './serial'
import { talkingFood } from './talking-food'

// This order is the order of the SHELVES too, not just the cards: the gallery
// groups by category in first-seen order. The FORMAT shelf (Фильм · Сериал ·
// Аниме — owner request 2026-07-18) leads: a format is the widest door into
// CinemaStudio — a starting grid the user rewrites, not a finished joke.
//
// БРИК-МУЛЬТЫ takes second place (owner request 2026-07-30: «лего-мультфильмы с
// историями», and «много готовых шаблонов»). It is the only shelf that is eight
// COMPLETE STORIES — arcs that resolve, picked to be watched rather than
// rewritten (format) or posted (brainrot) — and it is the largest shelf in the
// catalog, so burying it under a single-template shelf would misrepresent what
// the page now contains. Its own eight are ordered by how legible the story is
// from its name: heist and space sell themselves, «День минифигурки» needs the
// card read.
//
// «Буран» slides to third and keeps the role it has always had: the template
// picked to be worked ON. The brainrot dramas still close the page.
export const TEMPLATES: Template[] = [
  film,
  serial,
  anime,
  brickHeist,
  brickSpace,
  brickRace,
  brickCastle,
  brickBuild,
  brickNoir,
  brickPirates,
  brickCity,
  buran,
  fruitDrama,
  catDrama,
  talkingFood,
]

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
