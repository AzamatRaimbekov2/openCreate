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
// «Буран» keeps second place for the same reason it used to lead: it is the
// template picked to be worked on; the brainrot dramas close the page.
export const TEMPLATES: Template[] = [film, serial, anime, buran, fruitDrama, catDrama, talkingFood]

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
