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
import { shortsAbsurdCreature } from './shorts-absurd-creature'
import { shortsAiSlop } from './shorts-ai-slop'
import { shortsAsmrImpossible } from './shorts-asmr-impossible'
import { shortsBRoll } from './shorts-b-roll'
import { shortsColdOpenLoop } from './shorts-cold-open-loop'
import { shortsLofiLoop } from './shorts-lofi-loop'
import { shortsPovImmersion } from './shorts-pov-immersion'
import { shortsStylisedEveryday } from './shorts-stylised-everyday'
import { shortsTalkingObject } from './shorts-talking-object'
import { shortsTimelapseCycle } from './shorts-timelapse-cycle'
import { shortsWhatIfDoc } from './shorts-what-if-doc'
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
// ШОРТСЫ takes third place (ADR shorts-studio, 2026-08-20). It is the shelf the
// batch runner exists for, and it is ordered ahead of «Буран» and the dramas for
// the same reason БРИК-МУЛЬТЫ is ordered ahead of them: it is a whole pack rather
// than one card, and it is the shelf a user arrives wanting. Its own eight run
// from the two formats that need no explanation at all (ASMR, the lo-fi loop)
// through the ones whose card has to be read (the pseudo-documentary, the
// deliberate slop).
//
// EVERY CARD ON THAT SHELF IS THE SAME SHAPE, and it is not a coincidence — it is
// arithmetic (ADR §6). Three clips × 8 seconds, no title cards, 24 seconds total,
// on the vertical triple pixverse-v6 / wan-2-7 / veo-3-1-fast whose native
// duration tables intersect at exactly {8}. So every shorts card costs the same
// 168 / 405 / 420 credits, which is the property a batch runner needs: the price
// of a run is rows × beats × one number, and a user reading the itemised confirm
// does not have to hold eight different per-template rates in their head.
//
// «Фигурка в большом мире» (shorts-figurine-pov.ts) IS AUTHORED AND DELIBERATELY
// NOT REGISTERED HERE. Its format needs a tier that can hold a character across
// shots, and the only such tier model (wan-2-7, the sole one carrying
// `referenceMode`) is unreachable on this deployment — so the only tier that runs
// today is the only tier that cannot do the card's one job, and its first batch
// would teach a user that the format does not work. The other cards DEGRADE on
// the working tier; that one is BROKEN on it, and a tier note is not enough when
// the tier that works is the wrong one. IT GOES BACK ON THE SHELF the moment a
// reference-capable tier is reachable — a DashScope key for wan-2-7, or any 9:16
// model with `referenceMode` at 8s. Re-add the import and one line below.
//
// Nine of the eleven are LOOPABLE, and their final beat's prompt says so
// explicitly — a claim templates.test.ts checks against that prompt rather than
// trusting the flag (ADR §10). The two that are not — the pseudo-documentary and
// the deliberate slop — are escalations whose payoff is in the last beat, and each
// says so in its own header rather than pretending otherwise.
//
// WAVE 2 (2026-08-20) added four: «От первого лица» (POV), «Фигурка в большом
// мире» (the user's own tagged character in an oversized real world), «Холодное
// открытие» (the shelf's only NARRATIVE loop — it loops on meaning, not on
// picture) and «Круг в одном кадре» (time-lapse, whose loop is free because a
// cycle returns). Two formats the research surfaced were deliberately NOT taken:
// the explainer, which needs composited lower-thirds and a 6–9 beat arc that this
// grid does not have, and audio-reactive beat-sync, which needs beat markers
// extracted BEFORE generation — a different pipeline. Both are real formats and
// both would have to be faked here, so neither shipped.
//
// «Буран» slides to fourth and keeps the role it has always had: the template
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
  shortsAsmrImpossible,
  shortsLofiLoop,
  shortsTimelapseCycle,
  shortsBRoll,
  shortsPovImmersion,
  shortsTalkingObject,
  shortsAbsurdCreature,
  shortsStylisedEveryday,
  shortsColdOpenLoop,
  shortsWhatIfDoc,
  shortsAiSlop,
  buran,
  fruitDrama,
  catDrama,
  talkingFood,
]

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
