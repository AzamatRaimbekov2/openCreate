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
import { fruitDrama } from './fruit-drama'
import { catDrama } from './cat-drama'
import { talkingFood } from './talking-food'

export const TEMPLATES: Template[] = [fruitDrama, catDrama, talkingFood]

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
