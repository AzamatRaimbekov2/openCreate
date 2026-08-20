// apps/api/src/modules/templates/catalog/shorts-figurine-pov.ts
// «Фигурка в большом мире» — the user's OWN character, small, on a real table,
// shot as if on a phone.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// ORIGIN. The blind-box collectible boom of 2024–26 produced a native short-form
// format alongside it: not the unboxing, but the AFTERWARDS — the figure carried
// around and photographed in oversized ordinary places. A café table, a car
// cupholder, a train windowsill. Shot on a phone, shallow depth of field, no
// commentary. It works because the appeal is not the object, it is the CONTINUITY:
// the same small character keeps turning up, and the viewer is following a
// character rather than watching a product.
//
// WHOSE CHARACTER, AND WHY THAT IS THE DESIGN: the figure here is the USER'S,
// supplied through the entity library and tagged per shot — it is deliberately
// NOT a knob, and no real collectible line is named anywhere in this file, in an
// option label, or in a prompt. Two independent reasons, and either alone would
// be enough. The commercial one: those are live trademarks with active enforcement,
// and template copy is product copy on a public endpoint (this is the same rule
// the brick shelf follows about the toy brand, and templates.test.ts enforces both
// catalog-wide). The product one is better: a template that shipped a fixed set of
// cute figures would be a worse version of this format, because the format's whole
// engine is that it is YOUR character. Ours would be nobody's.
//
// DISCLOSURE TIER: description. Photoreal everyday interiors, but no person ever
// appears and no place is identifiable, so it sits where the b-roll and POV cards
// sit (ADR §12).
//
// LOOPABLE: yes. A–B–A: the establishing phone frame, a closer one, then back to
// the opening (ADR §10).
//
// THE ONE THING EASY TO GET WRONG: CHARACTER DRIFT BETWEEN BEATS. Three separate
// generations share no context, so the figure in beat 2 is a different figure
// unless something forces it not to be — and the whole format collapses the
// instant the viewer notices it is not the same character. The fix is REFERENCE
// CONDITIONING, and the anti-pattern is re-describing the character in words: a
// paragraph of "a small vinyl figure with round ears and a wide grin" pasted into
// all three prompts produces three plausible figures that are not each other.
// That is why the prompts below say «the tagged reference character, unchanged»
// and never describe it.
//
// WHICH MEANS THE TIER LADDER IS INVERTED ON THIS CARD, and it is the one thing
// to know before running a batch here: of the three tier models, ONLY wan-2-7
// (standard) carries `referenceMode` — it is the first video model in our catalog
// that can hold a character across shots, and its r2v path engages automatically
// when references are present. seedance-1-5-pro (draft) and veo-3-1-fast (premium)
// have no reference mode at all, so on those tiers the figure WILL drift, and
// paying more makes it worse rather than better. The tierNotes say so in the
// product's own words rather than leaving a user to discover it three generations
// in.
//
// AND AS OF 2026-08-20 THAT COLLIDES WITH DEPLOYMENT REALITY, which this file has
// to say out loud rather than sell around: the only tier whose provider is
// reachable on production is DRAFT, and draft is precisely the tier that cannot
// hold the character. So today this card generates, and generates a different
// figure in each of its three beats — which is the one failure this format cannot
// absorb. It is authored, correct and priced like its neighbours, and it becomes
// the card it is meant to be the moment a DashScope key exists and the standard
// tier lights up. The tierNotes say exactly that, in those words, on all three
// pills. Nobody should have to buy three generations to find it out.
//
// WHY 'PHONE FOOTAGE' AND NOT 'CINEMATIC': the format is photographed by a person
// at a table, and its credibility comes from looking like it. Handheld, natural
// available light, shallow macro depth of field, no grade, no rig.
// ─────────────────────────────────────────────────────────────────────────────
// NOT REGISTERED IN catalog/index.ts AS OF 2026-08-20 — read this before adding
// it back.
//
// The card is finished and correct. What it is missing is a tier it can run on:
// its format needs reference conditioning to hold the character across three
// separate generations, the only tier model that has it is wan-2-7, and wan-2-7's
// provider (Alibaba DashScope) has no key on this deployment. The one tier that
// DOES run — draft, on seedance-1-5-pro — has no `referenceMode` at all, so it
// produces a different figurine in each of the three beats.
//
// That is the distinction that kept it off the shelf: every other shorts card
// merely DEGRADES on the working tier, and this one is BROKEN on it. Three
// different figurines is not a cheaper version of "that character in a big
// world", it is the absence of the format, and a first batch that teaches a user
// the card cannot do its one job is worse than a card they never saw.
//
// THE RETURN CONDITION, precisely: re-register it the moment ANY tier it pins is
// both reachable on the deployment AND carries `referenceMode` at 9:16/8s —
// a DashScope key lighting up wan-2-7 is the expected route, but any
// reference-capable 9:16 model that serves 8s natively would do. Adding it back
// is the import plus one line in catalog/index.ts; nothing in this file changes.
// ─────────────────────────────────────────────────────────────────────────────
import type { Template } from '../types'

// Pasted into all three prompts. Safe box per ADR §11 — and the text clause earns
// its place here more than almost anywhere, because every one of these settings is
// a surface covered in branded packaging in real life: a café table, a dashboard,
// a desk. The no-person clause keeps hands out for the reason the POV card
// documents at length.
const FRAME =
  'FRAMING: vertical 9:16 format, the figure and the surface it stands on held in the UPPER TWO THIRDS of the frame with clear headroom above, the LOWER THIRD left as empty uncluttered table or surface, nothing load-bearing along the right edge. ' +
  'NO TEXT ANYWHERE IN FRAME: no letters, no numbers, no words, no captions, no subtitles, no brand names, no cup logos, no product packaging, no menus, no labels, no signage, no watermark, no screens showing interface. ' +
  'NO PERSON IN FRAME: no hands, no fingers, no arms, no face, no figure in the background, no reflection of a person in glass or metal.'

// The identity clause, repeated in every shot. It names the reference instead of
// describing the character — see the header on why the description is the trap.
const SAME =
  'THE CHARACTER IS THE TAGGED REFERENCE CHARACTER, UNCHANGED: exactly the same figure as in the reference image and exactly the same figure in every shot of this video — same shape, same proportions, same colours, same markings, same expression. Do not redesign it, do not stylise it, do not add or remove any feature. It is a small solid figure standing still on the surface; it does not walk, gesture or change pose beyond the smallest settle.'

export const shortsFigurinePov: Template = {
  id: 'shorts-figurine-pov',
  category: 'shorts',
  name: 'Фигурка в большом мире',
  tagline: 'Твой персонаж на столе кафе. Снято на телефон, и во всех трёх кадрах он — тот же самый.',
  description:
    'Маленькая фигурка в огромном обычном мире: столик в кафе, подстаканник в машине, подоконник в поезде. ' +
    'Съёмка «на телефон» — естественный свет, малая глубина резкости, без грейда. ' +
    'Персонаж здесь ТВОЙ: отметь сущность из библиотеки на каждом кадре, и модель удержит именно его. ' +
    'Важно: держит персонажа только средний тариф — на дешёвом и на премиуме фигурка «поплывёт». ' +
    'Три бита по 8 секунд: общий кадр, деталь, возврат к первому.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: '{{spot}}',

  loopable: true,
  disclosureTier: 'description',

  // THE TIER LADDER, AND WHY DRAFT IS seedance-1-5-pro RATHER THAN pixverse-v6
  // (changed 2026-08-20, and the reason is deployment reality rather than craft).
  //
  // All three of these serve 9:16 at 8s natively — the invariant
  // assertTemplatesValid() checks at boot (ADR §6) — and 8s is still the only
  // legal length here, because it is the intersection of the three duration
  // tables. What changed is that NONE of the original triple could actually
  // generate on production: pixverse-v6 and veo-3-1-fast both route to Runware,
  // whose production key is a placeholder, and wan-2-7 routes to Alibaba
  // DashScope, whose key is unset. The boot check verifies ratio and duration; it
  // does not verify that a provider is reachable, so the shelf passed every check
  // and then failed on the first real click.
  //
  // seedance-1-5-pro runs on kie.ai, which is verified working in production, and
  // it slots in with nothing else changing: 9:16 yes, 8s yes, and 56 credits at 8s
  // — the SAME price pixverse-v6 charged. So every shorts card still costs
  // 168 / 405 / 420, the shelf keeps its one-number property, and the ascending
  // ladder still holds (56 < 135 < 140).
  //
  // Standard and premium are deliberately LEFT ALONE. They light up the moment a
  // Runware or DashScope key exists, and pointing all three tiers at one working
  // model would make the tier picker a lie — three prices for identical output.
  // What we owe the user instead is the truth on the pill, which is what the
  // tierNotes below now carry.
  models: {
    draft: 'seedance-1-5-pro',
    standard: 'wan-2-7',
    premium: 'veo-3-1-fast',
  },
  // Provider availability leads every note, because on this deployment it is the
  // decision the user is actually making. The craft difference follows it, so the
  // notes stay true once the keys land.
  //
  // AND ON THIS CARD THE TWO DISAGREE, which is why all three notes are long. The
  // inverted ladder (standard is the only tier with reference conditioning, so it
  // is the only tier this format actually works on) points at exactly the tier the
  // deployment cannot reach. Draft therefore generates today AND drifts, standard
  // holds the character AND is dark, premium does neither. Saying all three out
  // loud costs us nothing and saves a user three wasted generations.
  tierNotes: {
    draft: 'Работает сейчас — единственный тариф с настроенным провайдером. НО персонажа по референсу он не держит: фигурка будет меняться от кадра к кадру',
    standard: 'ЕДИНСТВЕННЫЙ тариф, который держит твоего персонажа по референсу — и сейчас он не работает: нужен ключ провайдера',
    premium: 'Сейчас не работает: нужен ключ провайдера. Персонажа по референсу всё равно не держит',
  },

  musicPrompt:
    'warm lo-fi bedroom pop instrumental, soft nylon guitar, gentle tape wobble, light shaker, cosy and unhurried, no vocals',

  // TWO knobs, both on-screen (ADR §9) — and note what is deliberately NOT a knob:
  // the character. It comes from the user's entity library, which is the whole
  // point of the card (see the header). What the knobs vary is the world around it.
  variables: [
    {
      key: 'spot',
      kind: 'select',
      label: 'Где он стоит',
      hint: 'Обычное место, снятое с высоты фигурки — от этого оно и кажется огромным.',
      defaultValue: 'cafe',
      options: [
        {
          value: 'cafe',
          label: 'Столик в кафе',
          spoken: 'столик в кафе',
          prompt:
            'a scuffed wooden café table seen from the height of a small figure standing on it: an enormous ceramic cup and saucer looming behind, a crumpled paper napkin like a landscape, the blurred room and window far beyond',
        },
        {
          value: 'car',
          label: 'Подстаканник в машине',
          spoken: 'подстаканник в машине',
          prompt:
            'the centre console of a car seen from the height of a small figure standing in the cup holder: the gear lever rising like a tower beside it, the dashboard a wide plateau, the windscreen and the road beyond thrown far out of focus',
        },
        {
          value: 'train',
          label: 'Подоконник в поезде',
          spoken: 'подоконник в поезде',
          prompt:
            'the narrow windowsill of a train carriage seen from the height of a small figure standing on it: the huge window filling the frame behind, countryside sliding past outside in a soft blur, a folded ticket stub and a bottle cap on the sill',
        },
        {
          value: 'desk',
          label: 'Стол у клавиатуры',
          spoken: 'стол у клавиатуры',
          prompt:
            'a home desk seen from the height of a small figure standing on it: the keys of a mechanical keyboard rising like a wall of steps beside it, a coiled cable across the desk, the dark blurred room behind',
        },
      ],
    },
    {
      key: 'light',
      kind: 'select',
      label: 'Какой свет',
      hint: 'Меняет настроение кадра целиком — при малой глубине резкости свет и есть фон.',
      defaultValue: 'window',
      options: [
        {
          value: 'window',
          label: 'Дневной из окна',
          spoken: 'дневной свет',
          prompt: 'soft overcast daylight from a large window to one side, gentle shadows, neutral colour',
        },
        {
          value: 'rain',
          label: 'Дождь за стеклом',
          spoken: 'дождь за стеклом',
          prompt: 'grey rainy light, the glass beyond running with droplets throwing moving speckled shadows across the surface',
        },
        {
          value: 'golden',
          label: 'Вечернее солнце',
          spoken: 'вечернее солнце',
          prompt: 'low evening sun raking in almost horizontally, a long shadow stretching from the figure, warm amber highlights',
        },
        {
          value: 'neon',
          label: 'Ночные огни',
          spoken: 'ночные огни',
          prompt: 'night, lit only by coloured signage and passing headlights far outside, soft magenta and cyan pools of light, deep shadow between them',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Общий кадр',
      durationSeconds: 8,
      prompt:
        'Handheld phone footage, natural available light, shallow macro depth of field, no colour grading: {{spot}}, {{light}}. The camera holds at the figure’s own eye level so the ordinary objects around it read as enormous. Very slight handheld drift, nothing else moves. ' +
        SAME +
        ' ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'handheld', quality: 'ultra' },
    },
    {
      kind: 'clip',
      beat: 'Деталь',
      durationSeconds: 8,
      // The B of A–B–A, and the beat where drift is most visible — a close-up is
      // where a viewer checks whether it is the same character. Hence SAME again.
      prompt:
        'Handheld phone footage, natural available light, shallow macro depth of field, no colour grading, same place and same light: {{spot}}, {{light}}. A much closer view of the figure, the background falling completely out of focus behind it, the texture of the surface sharp beneath its feet. ' +
        SAME +
        ' ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'extreme-close-up', cameraMotion: 'handheld', quality: 'ultra' },
    },
    {
      kind: 'clip',
      beat: 'Возврат',
      durationSeconds: 8,
      // THE LOOP ANCHOR (ADR §10). A–B–A, stated as a frame match — "the wide
      // again" is a request a model satisfies from a different side of the table.
      prompt:
        'Handheld phone footage, natural available light, shallow macro depth of field, no colour grading, same place and same light: {{spot}}, {{light}}. The same view this video opened on, from the same height and the same angle, everything back where it was. THE FINAL FRAME OF THIS SHOT MUST MATCH THE OPENING COMPOSITION OF THIS VIDEO EXACTLY, so that the end cuts back to the beginning seamlessly. ' +
        SAME +
        ' ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'handheld', quality: 'ultra' },
    },
  ],
}
