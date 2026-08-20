// apps/api/src/modules/templates/catalog/shorts-cold-open-loop.ts
// «Холодное открытие» — a story that opens on a line you cannot yet parse and
// closes on a line that makes the opening mean something else.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// ORIGIN. The cold open is television grammar — start after the beginning, let
// the audience catch up — and short form took it further than television ever
// could, because there is no title sequence to reach and no episode to sell. What
// short form added is the RETURN: the two-line creepypasta and the "wait, play it
// again" comment thread are the same mechanic, and once vertical platforms began
// counting every replay as a view (2025-03-31) the mechanic acquired a metric.
// This card is the shelf's only NARRATIVE loop — every other loopable card here
// loops visually, and this one loops on meaning.
//
// DISCLOSURE TIER: description. A photoreal domestic interior, but nobody is ever
// in frame and no place is identifiable, so it stays below the photoreal-people
// tier — the same line the b-roll and POV cards sit on (ADR §12).
//
// LOOPABLE: yes, BY CONSTRUCTION. It is the one card on the shelf where the loop
// is not a property of the last shot but the reason the thing exists.
//
// THE ONE THING EASY TO GET WRONG, and it is a WRITING failure rather than a
// prompting one: A PAYOFF THAT MERELY CONCLUDES INSTEAD OF RECONTEXTUALISING. If
// the last line finishes the story, the viewer is done — the loop mechanic never
// fires, and all you have built is a very short film with a strange ending. The
// last line has to reach BACKWARDS and change what the first line meant. The test
// is blunt and worth applying to any rewrite: after hearing beat 3, does beat 1
// mean something DIFFERENT — not merely something clearer?
//
// THE THREE LINES THIS CARD SHIPS, and why they pass that test:
//
//   1. «{{thing}} снова стоит у двери. Я его туда не ставил.»
//        Does not parse yet. Reads as an oddity.
//   2. «Первые три раза я думал, что просто забыл.»
//        Supplies the OBVIOUS reading — forgetfulness — and lets the viewer settle
//        into it. This beat exists to be wrong.
//   3. «Я живу здесь один. Я проверял.»
//        Recontextualises. On first hearing, beat 1 was about a bad memory. It is
//        now about somebody else in the flat, and "я его туда не ставил" is a
//        completely different sentence. That is the replay.
//
// Note what beat 2 is doing, because it is the part a rewrite usually deletes: it
// is not filler between the hook and the payoff, it is the WRONG ANSWER, offered
// confidently. Without it the twist has nothing to overturn.
//
// GRAMMAR, load-bearing twice over (the same discipline as brick-heist.ts):
//   · Every `thing` option is MASCULINE NOMINATIVE, which is what lets «Я ЕГО туда
//     не ставил» agree for all four. A feminine object («лампа», «коробка»)
//     silently breaks «его».
//   · The narrator is MALE, because «ставил» and «думал» and «проверял» are
//     masculine past forms. Switching to a female voice means rewriting all three
//     lines to «ставила / думала / проверяла». The voice id is not a cosmetic
//     choice on this card.
//
// WHY THE CAMERA NEVER MOVES: the loop closes on an object standing in a doorway,
// and the whole force of the ending is that the frame is the same frame. A camera
// that drifts between beats makes the return a coincidence instead of the point.
import type { Template } from '../types'

// Pasted into all three prompts. Safe box per ADR §11 — and the no-person clause
// is doing narrative work here, not just technical work: the story only lands if
// the flat is visibly empty, so the model must not helpfully add the narrator.
const FRAME =
  'FRAMING: vertical 9:16 format, the doorway and the hallway held in the UPPER TWO THIRDS of the frame with clear headroom above, the LOWER THIRD showing only bare empty floor, nothing load-bearing along the right edge. ' +
  'NO TEXT ANYWHERE IN FRAME: no letters, no numbers, no words, no captions, no subtitles, no signage, no door numbers, no notices, no labels, no logos, no watermark. ' +
  'NO PERSON ANYWHERE: nobody in frame, no hands, no silhouette, no figure in a doorway, no shadow of a person, no reflection of a person in any glass or mirror. The place is empty. ' +
  'THE CAMERA NEVER MOVES: locked off on a tripod, no pan, no push, no drift, identical framing for the entire shot.'

export const shortsColdOpenLoop: Template = {
  id: 'shorts-cold-open-loop',
  category: 'shorts',
  name: 'Холодное открытие',
  tagline: 'Первая фраза непонятна. Последняя объясняет её — и всё начинается заново.',
  description:
    'Единственный шаблон на полке, который зацикливается не картинкой, а смыслом. ' +
    'Ролик начинается посреди ситуации, на фразе, которую пока нельзя понять; вторая фраза подсовывает ' +
    'очевидное — и неверное — объяснение; третья переворачивает первую, и её хочется услышать заново. ' +
    'Статичная камера, пустая прихожая, ни одного человека в кадре, ни одной надписи. ' +
    'Три бита по 8 секунд, финальный кадр совпадает с первым.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: '{{thing}} у двери',

  // Loopable by construction — see the header. 'description' because the interior
  // is photoreal but empty of people and unidentifiable as a place.
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
  // decision the user is actually making. The craft difference between the tiers
  // follows it, so the notes stay true once the keys land.
  tierNotes: {
    draft: 'Работает сейчас — единственный тариф с настроенным провайдером',
    standard: 'Сейчас не работает: нужен ключ провайдера',
    premium: 'Сейчас не работает: нужен ключ провайдера. Он же сам произносит все три реплики — а здесь весь ролик и есть три реплики',
  },

  musicPrompt:
    'sparse unsettling domestic ambient, a single low piano note repeating at long intervals, distant room tone, faint tape hiss, no melody, no percussion, no vocals',

  // TWO knobs, both on-screen (ADR §9). `thing` is spoken AND visible — it is the
  // object standing in the doorway in every beat; `home` replaces the whole
  // interior. Twelve combinations of one story, which is the honest shape here:
  // the SCRIPT is the product on this card, so the knobs vary the picture around
  // it rather than pretending to vary the writing.
  variables: [
    {
      key: 'thing',
      kind: 'select',
      label: 'Что стоит у двери',
      hint: 'Мужской род — так требуют реплики. Женский вариант тихо ломает «его».',
      defaultValue: 'suitcase',
      options: [
        {
          value: 'suitcase',
          label: 'Чемодан',
          spoken: 'чемодан',
          prompt: 'a battered brown leather suitcase standing upright, handle up, as if someone had just set it down',
        },
        {
          value: 'chair',
          label: 'Стул',
          spoken: 'стул',
          prompt: 'a plain wooden kitchen chair standing squarely in the middle of the hallway, facing the door',
        },
        {
          value: 'umbrella',
          label: 'Зонт',
          spoken: 'зонт',
          prompt: 'a closed black umbrella standing propped against the wall, still wet, a small pool of water beneath it',
        },
        {
          value: 'bicycle',
          label: 'Велосипед',
          spoken: 'велосипед',
          prompt: "a child's small bicycle standing upright on its own without a stand, front wheel turned towards the door",
        },
      ],
    },
    {
      key: 'home',
      kind: 'select',
      label: 'Где ты живёшь',
      hint: 'Меняет всю прихожую. Свет везде один — поздний вечер.',
      defaultValue: 'flat',
      options: [
        {
          value: 'flat',
          label: 'Городская квартира',
          spoken: 'городская квартира',
          prompt:
            'the narrow hallway of a city apartment late at night, one warm lamp on a side table, a loaded coat rack, a heavy front door with a chain hanging unfastened',
        },
        {
          value: 'dacha',
          label: 'Дом за городом',
          spoken: 'дом за городом',
          prompt:
            'the hallway of an old wooden country house late at night, painted plank walls, a paraffin lamp on a shelf, a heavy front door with a long iron bolt drawn back',
        },
        {
          value: 'corridor',
          label: 'Общий коридор',
          spoken: 'общий коридор',
          prompt:
            'the shared corridor of a large apartment block late at night, a long receding row of identical doors, one fluorescent tube flickering at the far end, scuffed lino',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Непонятная фраза',
      durationSeconds: 8,
      // The frame the whole card returns to. Nothing happens in it on purpose:
      // the tension is entirely in the line over a still, ordinary picture.
      prompt:
        'Photorealistic interior, ordinary available light, locked-off camera: {{home}}. {{thing}} stands just inside the front door. Nothing moves in the shot except the very slight flicker of the light. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'static', quality: 'ultra' },
      voiceover: { text: '{{thing}} снова стоит у двери. Я его туда не ставил.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Неверное объяснение',
      durationSeconds: 8,
      // The beat that exists to be wrong. See the header — deleting it is the most
      // common way a rewrite kills this card.
      prompt:
        'Photorealistic interior, same locked-off camera and same available light: {{home}}. A closer view of {{thing}} standing exactly where it was, unmoved and untouched. Still nothing happens. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'static', quality: 'ultra' },
      voiceover: { text: 'Первые три раза я думал, что просто забыл.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Переворот',
      durationSeconds: 8,
      // THE LOOP ANCHOR (ADR §10), and the recontextualisation. The frame match is
      // not decoration here: cutting back to beat 1 is the payoff, because beat 1
      // is now a different sentence.
      prompt:
        'Photorealistic interior, same locked-off camera and same available light: {{home}}. The exact same view this video opened on, with {{thing}} standing just inside the front door exactly as before, nothing changed, nobody present. THE FINAL FRAME OF THIS SHOT MUST MATCH THE OPENING COMPOSITION OF THIS VIDEO EXACTLY — the same hallway from the same angle in the same light with the object in the same place — so that the end cuts back to the beginning seamlessly. ' +
        FRAME,
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'static', quality: 'ultra' },
      voiceover: { text: 'Я живу здесь один. Я проверял.', voice: 'Dmitry' },
    },
  ],
}
