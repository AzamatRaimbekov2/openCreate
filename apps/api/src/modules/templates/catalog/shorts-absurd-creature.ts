// apps/api/src/modules/templates/catalog/shorts-absurd-creature.ts
// «Абсурдное существо» — one impossible hybrid, one accessory that does not
// belong to it, and a narrator who explains nothing.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// ORIGIN. The impossible-hybrid creature is short form's most durable AI native:
// the 2025 "Italian brainrot" wave (Ballerina Cappuccina, Bombardiro Crocodilo)
// proved the appetite, and the "new species discovered" nature-documentary parody
// gave it a delivery vehicle that needs no plot. This template takes the second
// and deliberately not the first — no pseudo-Italian names, no sung narration.
// That genre has its own grammar and merging the two produces neither (the same
// correction cat-drama.ts makes about its own lineage).
//
// DISCLOSURE TIER: none. A snail with a lion's mane is fantastical on its face —
// no real person, place or event (ADR §12).
//
// LOOPABLE: yes. A slow continuous orbit across three beats that comes back
// around to the three-quarter front view it started on, so the cut from beat 3 to
// beat 1 is just the orbit continuing (ADR §10).
//
// THE ONE THING EASY TO GET WRONG: MAKING THE DESIGN COHERENT. Given a hybrid, a
// model will quietly resolve it — it will blend the parts into a plausible animal,
// scale the accessory to fit, and hand back something that looks like a competent
// concept-art creature. That is the failure. The appeal of this format is entirely
// in the wrongness of the join: the parts belong to different animals at different
// scales, and the accessory is BOLTED ON WRONG — it does not fit, nothing explains
// it, and the creature never uses it or acknowledges it. Every option fragment
// below says so, and the shots repeat it, because "absurd" is not a word a model
// renders and "the spectacles do not fit it and it never uses them" is.
//
// THE SECOND THING, which the narration carries: the register is a nature
// documentary that is completely sincere. Not jokey, not winking. The narrator
// states the impossible in the tone of a man reading out rainfall figures. If the
// narration performs the joke, the creature stops being funny and becomes a
// cartoon — the same failure the what-if documentary template documents at length.
//
// WHY THE BACKGROUND IS PLAIN AND SEAMLESS: two reasons that agree. A studio
// sweep is what "newly catalogued specimen" looks like, and — the practical one —
// an empty background is the only kind that survives an orbit. A model asked to
// orbit through a real environment invents a new environment on the far side, and
// then the loop cannot close.
import type { Template } from '../types'

// Pasted into all three prompts. Safe box per ADR §11.
const FRAME =
  'FRAMING: vertical 9:16 format, the creature held in the UPPER TWO THIRDS of the frame with clear headroom above it, the LOWER THIRD of the frame left as empty uncluttered floor sweep, nothing load-bearing along the right edge. ' +
  'BACKGROUND: a plain seamless neutral studio sweep, soft even light, absolutely nothing else in the frame — no props, no scenery, no second creature, no person. ' +
  'NO TEXT ANYWHERE IN FRAME: no letters, no numbers, no words, no captions, no subtitles, no lower thirds, no species labels, no scale bars, no logos, no watermark.'

// The clause the whole template turns on — see the header. Repeated per shot on
// purpose; one statement of it is not enough to stop a model tidying the design up.
const WRONG =
  'THE JOIN MUST STAY WRONG: the parts plainly belong to different animals at different scales and are not blended into a plausible single species, and the accessory is the wrong size for it, sits on it awkwardly, is never used, never adjusted and never acknowledged. Photorealistic fur, feathers, skin and hair throughout — a real animal photographed, not an illustration and not a concept render.'

export const shortsAbsurdCreature: Template = {
  id: 'shorts-absurd-creature',
  category: 'shorts',
  name: 'Абсурдное существо',
  tagline: 'Голубь на ногах скакового коня. В крошечных очках. Объяснений не будет.',
  description:
    'Фотореалистичный невозможный гибрид на нейтральном фоне, медленный облёт камерой и закадровый голос, ' +
    'который рассказывает о нём с полной серьёзностью диктора о природе. Аксессуар на существе не подходит ему ' +
    'по размеру, не объясняется и никогда не используется — в этом весь приём. ' +
    'Три бита по 8 секунд, облёт замыкается на исходном ракурсе. Ни одной надписи в кадре. ' +
    'Последнюю фразу диктора можно написать свою.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: 'Существо: {{creature}}',

  // See the header: fantastical on its face, and the orbit IS the loop — beat 3
  // arrives back at the opening three-quarter view rather than coming to rest.
  loopable: true,
  disclosureTier: 'none',

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
  // decision the user is actually making. The craft difference between the tiers
  // follows it, so the notes stay true once the keys land.
  tierNotes: {
    draft: 'Работает сейчас — единственный тариф с настроенным провайдером',
    standard: 'Сейчас не работает: нужен ключ провайдера',
    premium: 'Сейчас не работает: нужен ключ провайдера. Он же сам читает закадровый текст',
  },

  musicPrompt:
    'stately nature documentary underscore, warm sustained strings and a soft distant French horn, dignified and unhurried, entirely sincere, no comedy cues, no vocals',

  // TWO knobs. `creature` is the on-screen one ADR §9 requires and it replaces the
  // entire subject. `fact` is free text and lands ONLY in the closing spoken line —
  // never in a visual prompt (the rule from types.ts, asserted for every template).
  // The last line of the narration is exactly the thing a user wants to own and
  // exactly the thing that must not reach a paid prompt.
  variables: [
    {
      key: 'creature',
      kind: 'select',
      label: 'Кто это',
      hint: 'Части от разных животных и аксессуар, который ему не подходит.',
      defaultValue: 'pigeon-horse',
      options: [
        {
          value: 'pigeon-horse',
          label: 'Голубь на конских ногах',
          spoken: 'голубь на конских ногах',
          prompt:
            'a photorealistic city pigeon whose ordinary pigeon body sits on top of the long muscular legs of a racehorse, complete with hooves, the join between bird and horse rendered with total anatomical seriousness; it wears a pair of tiny round wire-rimmed spectacles far too small for its head, perched crookedly',
        },
        {
          value: 'snail-lion',
          label: 'Улитка с гривой льва',
          spoken: 'улитка с гривой льва',
          prompt:
            'a photorealistic garden snail the size of a large dog, with a full golden lion’s mane growing around its eyestalks; a small worn leather briefcase is strapped to the top of its shell with two buckled belts, sitting at an angle',
        },
        {
          value: 'axolotl-stag',
          label: 'Аксолотль с рогами оленя',
          spoken: 'аксолотль с рогами оленя',
          prompt:
            'a photorealistic pale pink axolotl, wet-skinned and feather-gilled, carrying the full branching antlers of a red stag that are plainly far too heavy for it; a chunky hand-knitted woollen scarf is wound twice around its neck and hangs down over one side',
        },
        {
          value: 'frog-moth',
          label: 'Лягушка с крыльями бражника',
          spoken: 'лягушка с крыльями бражника',
          prompt:
            'a photorealistic green tree frog with the broad furred wings of a hawk moth folded flat along its back, the scales and fur visible in macro detail; a small brass pocket watch on a chain hangs around one of its forelegs, dragging on the floor',
        },
      ],
    },
    {
      key: 'fact',
      kind: 'text',
      label: 'Последняя фраза диктора',
      hint: 'Одно предложение, сказанное совершенно всерьёз. Звучит в третьем бите.',
      defaultValue: 'Он не отзывается на имя, потому что имени у него нет',
      maxLength: 90,
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Экземпляр',
      durationSeconds: 8,
      prompt:
        'Photorealistic wildlife studio footage: {{creature}}. The camera begins a slow steady orbit around it from a three-quarter front view, moving to the left. The creature stands still and calm, breathing, blinking, entirely unbothered — it does not perform, does not react to the camera and does not move from its spot. ' +
        WRONG +
        ' ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'orbit', quality: 'ultra' },
      voiceover: { text: 'Перед вами — редчайший экземпляр. Науке он известен с прошлого четверга.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Осмотр',
      durationSeconds: 8,
      // The far side of the orbit. This is where a model most wants to redesign
      // the creature, because it has to invent the half it has not shown yet —
      // hence "the same creature, unchanged" said outright.
      prompt:
        'Photorealistic wildlife studio footage, same plain seamless sweep and same soft even light: {{creature}}. The slow steady orbit continues around the far side of the same creature, unchanged and identical, showing its back and the far profile. It shifts its weight once and settles. ' +
        WRONG +
        ' ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'orbit', quality: 'ultra' },
      voiceover: { text: 'Аксессуар не снимается. Мы проверяли дважды.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Круг замкнулся',
      durationSeconds: 8,
      // THE LOOP ANCHOR (ADR §10). The orbit is the loop mechanism: beat 3 does
      // not stop, it arrives, which is why the instruction is a frame match and
      // not "the camera comes to rest".
      prompt:
        'Photorealistic wildlife studio footage, same plain seamless sweep and same soft even light: {{creature}}. The slow steady orbit comes all the way back around to the three-quarter front view this video opened on. THE FINAL FRAME OF THIS SHOT MUST MATCH THE OPENING COMPOSITION OF THIS VIDEO EXACTLY — the same creature at the same angle in the same light in the same position, the camera still moving at the same speed — so that the end cuts back to the beginning seamlessly and the orbit simply continues. ' +
        WRONG +
        ' ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'orbit', quality: 'ultra' },
      voiceover: { text: '{{fact}}. Больше о нём ничего не известно.', voice: 'Nikolai' },
    },
  ],
}
