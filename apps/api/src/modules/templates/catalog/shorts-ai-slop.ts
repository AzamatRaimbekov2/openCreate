// apps/api/src/modules/templates/catalog/shorts-ai-slop.ts
// «Нарочитый ИИ-треш» — a generation broken on purpose, captioned as the joke.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// ORIGIN. "AI slop" started as an insult — the term for the flood of cheap,
// malformed generated video that arrived with the first accessible models — and
// short form did what short form does with an insult: adopted it as a genre. By
// 2026 the deliberately broken clip with a flat caption over it is its own
// recognised format, and it is the only one on this shelf where the model's
// failure modes are the content rather than the risk. It is also the shelf's
// pressure valve: every other card here is engineering AGAINST artefacts, and
// this one sells them.
//
// DISCLOSURE TIER: none. Nothing about it could be mistaken for a record of
// anything — its entire subject is being obviously generated (ADR §12).
//
// LOOPABLE: NO, and deliberately. The gag is an escalation — fine, wobbling,
// collapsed — and a loop would put the collapse next to the "fine" and flatten
// the curve. This is the second of the two non-loopable cards on the shelf.
//
// THE ONE THING EASY TO GET WRONG, and it is counterintuitive: BEING TOO GOOD.
// Half-broken reads as incompetence; fully broken reads as a joke. There is no
// middle. And 2026 models are competent enough that a plain prompt now comes back
// clean — the artefacts this format is built from have to be ASKED FOR, by name,
// aggressively, or the template silently produces a nice wedding video. So the
// prompts below demand the specific failures: fingers multiplying, limbs changing
// count between frames, objects passing through each other, people sliding across
// the floor without their legs moving, faces melting and re-forming, background
// figures duplicating and dissolving. It is a stranger thing to write than any
// other prompt in this catalog, and it is the entire craft of the card.
//
// THE ONE FAILURE WE CANNOT USE, worth writing down because it is the most
// canonical one of all: GARBLED TEXT. Melting signage and invented lettering are
// the single most recognisable slop signature there is — and ADR §11 forbids
// prompted in-frame text without exception, on every template, because it is the
// worst-behaved thing 2026 models do and the only failure mode that is free to
// eliminate. We do not carve out an exception for the one card that would enjoy
// it. The breakage here is GEOMETRIC AND PHYSICAL, never typographic.
//
// THE ONE PIECE OF TEXT THIS CARD DOES CARRY, and why it is not a contradiction:
// the caption. Everywhere else on the shelf the templates ship text-free (ADR
// §11) — but here the caption is the format, not a decoration on it, and it is
// COMPOSITED by ffmpeg over the finished clip, never prompted. The model is still
// asked for zero letters. That distinction is the whole of §11: captions are
// composited, never generated. It is a free-text knob, top position, inside the
// safe box, on the first beat only.
//
// AND THE AUDIO IS SINCERE. The narration is read straight, in the tone of a
// pleasant corporate explainer, and the music bed is chirpy stock ukulele. Both
// are load-bearing: the joke is the gap between what is said and what is shown,
// and a narrator who is in on it closes the gap.
import type { Template } from '../types'

// Pasted into all three prompts. The framing half is ADR §11's safe box; the text
// half is the paragraph above, and it is the one clause in this file that is NOT
// asking for a failure.
const FRAME =
  'FRAMING: vertical 9:16 format, the subject held in the UPPER TWO THIRDS of the frame with clear headroom above, the LOWER THIRD of the frame left empty and uncluttered, nothing load-bearing along the right edge. ' +
  'NO TEXT ANYWHERE IN FRAME: no letters, no numbers, no words, no captions, no subtitles, no signage, no labels, no logos, no watermark — no lettering of any kind, not even garbled or invented lettering.'

export const shortsAiSlop: Template = {
  id: 'shorts-ai-slop',
  category: 'shorts',
  name: 'Нарочитый ИИ-треш',
  tagline: 'Сгенерировано плохо. Специально. Подпись объясняет, почему это смешно.',
  description:
    'Единственный шаблон на полке, который просит модель сломаться — и просит настойчиво, ' +
    'потому что современные модели сами по себе уже слишком аккуратны. Пальцы множатся, руки срастаются, ' +
    'предметы проходят сквозь друг друга, люди едут по полу не двигая ногами. ' +
    'Закадровый голос при этом совершенно серьёзен, а музыка бодрая — в этом зазоре вся шутка. ' +
    'Три бита по 8 секунд: всё хорошо, что-то не так, полный распад. Подпись на первом бите — своя.',
  aspectRatio: '9:16',
  // NULL, AND THIS IS THE SHARPEST TRAP IN THE FILE. Every other photoreal card
  // on this shelf uses 'cinematic' — but that preset's negative prompt is
  // "cartoon, anime, illustration, low quality, deformed" (presets.ts), and
  // `deformed` is the exact thing this template is buying. Stamping 'cinematic'
  // here would spend a paragraph of prompt asking for melted faces and then hand
  // the model a negative prompt telling it not to melt them. Same reason every
  // preset below omits styleId and sets quality to 'none': "ultra detailed, 8k,
  // masterpiece, best quality" is likewise an instruction to be good at this.
  // This is the one card in the catalog that wants no quality floor at all.
  defaultStyleId: null,
  titleTemplate: '{{subject}}: как получилось',

  // See the header: being obviously generated is the card's entire subject, so
  // nothing about it could be mistaken for a record. NOT loopable: the gag is an
  // escalation, and looping would put the collapse next to the 'fine'.
  loopable: false,
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
    premium: 'Сейчас не работает: нужен ключ провайдера. Он же сам читает закадровый текст — ровным довольным голосом поверх распада',
  },

  musicPrompt:
    'chirpy royalty-free corporate stock music, bright strummed ukulele, handclaps and glockenspiel, relentlessly upbeat and generic, tinny production, completely sincere, no vocals',

  // TWO knobs. `subject` is the on-screen one ADR §9 requires. `caption` is free
  // text and lands ONLY in the composited overlay — never in a visual prompt (the
  // rule from types.ts, asserted for every template). The caption is the joke and
  // the joke is the thing a user most wants to write themselves.
  variables: [
    {
      key: 'subject',
      kind: 'select',
      label: 'Что снимаем',
      hint: 'Чем банальнее и «дороже» жанр, тем сильнее падение.',
      defaultValue: 'wedding',
      options: [
        {
          value: 'wedding',
          label: 'Свадебный танец',
          spoken: 'свадебный танец',
          prompt:
            'a couple’s first dance at a wedding reception, guests seated at round tables around the floor, string lights overhead, a photographer crouching at the edge of the frame',
        },
        {
          value: 'cooking',
          label: 'Кулинарный ролик',
          spoken: 'кулинарный ролик',
          prompt:
            'a cooking demonstration at a bright kitchen counter, hands chopping vegetables on a wooden board, a pan on the hob behind, ingredients laid out in small bowls',
        },
        {
          value: 'gym',
          label: 'Тренировка в зале',
          spoken: 'тренировка в зале',
          prompt:
            'a person setting up under a loaded barbell in a busy gym, racks and mirrors behind them, other people training in the background',
        },
        {
          value: 'dogshow',
          label: 'Выставка собак',
          spoken: 'выставка собак',
          prompt:
            'a handler trotting a large dog around a show ring on a short lead, a judge standing at the centre, spectators along the barrier behind',
        },
      ],
    },
    {
      key: 'caption',
      kind: 'text',
      label: 'Подпись на первом бите',
      hint: 'Та самая строчка, ради которой всё это. Коротко и без объяснений.',
      defaultValue: 'когда сэкономил на генерации',
      maxLength: 60,
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Всё хорошо',
      durationSeconds: 8,
      // Beat 1 is nearly clean on purpose — the escalation needs a floor, and the
      // "one small thing" is what makes the viewer lean in instead of scrolling.
      prompt:
        'Ordinary handheld phone footage, natural light, unremarkable and sincere: {{subject}}. Everything looks almost normal — except that ONE SMALL THING IS WRONG and nobody in frame notices it: a hand in the background has six fingers, and one person’s arm bends the wrong way at the elbow for a moment and then does not. ' +
        FRAME,
      preset: { cameraShot: 'medium', cameraMotion: 'handheld', quality: 'none' },
      // The one composited caption on the shelf — see the header on why this is
      // not a contradiction of ADR §11. Top position keeps it inside the safe box.
      title: { text: '{{caption}}', position: 'top' },
      voiceover: { text: 'Обычный день. Всё идёт как надо.', voice: 'Elena' },
    },
    {
      kind: 'clip',
      beat: 'Что-то не так',
      durationSeconds: 8,
      prompt:
        'Ordinary handheld phone footage, natural light, same scene: {{subject}}. THE GENERATION IS VISIBLY FAILING NOW: fingers multiply and merge into each other, two people’s hands fuse where they touch and pull apart wrongly, an object in the foreground passes straight through a solid surface, a background figure duplicates into two identical copies and one of them dissolves, limbs change count between one moment and the next. Everyone in frame carries on completely normally as if nothing were happening. ' +
        FRAME,
      preset: { cameraShot: 'medium', cameraMotion: 'handheld', quality: 'none' },
      voiceover: { text: 'Небольшие сложности. Но в целом — ничего страшного.', voice: 'Elena' },
    },
    {
      kind: 'clip',
      beat: 'Распад',
      durationSeconds: 8,
      // Fully broken. Half-broken reads as incompetence; this beat exists so the
      // clip lands on the other side of that line, unmistakably.
      prompt:
        'Ordinary handheld phone footage, natural light, same scene: {{subject}}. TOTAL GENERATION COLLAPSE: faces melt and re-form as different faces, a person slides smoothly across the floor without their legs moving at all, teeth multiply, an arm stretches far past its length and snaps back, objects change size and colour from moment to moment, the floor and the ceiling bend into each other, gravity stops applying to one half of the frame, background figures duplicate endlessly and smear. Everyone in frame carries on completely normally as if nothing were happening. ' +
        FRAME,
      preset: { cameraShot: 'wide', cameraMotion: 'handheld', quality: 'none' },
      voiceover: { text: 'И вот результат. Спасибо за просмотр.', voice: 'Elena' },
    },
  ],
}
