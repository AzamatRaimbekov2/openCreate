// apps/api/src/modules/templates/catalog/brick-city.ts
// «День минифигурки» — the brickfilm comedy of everyday life. Eighth and last of
// the «Брик-мульты» shelf (owner request 2026-07-30).
//
// THE GENRE: see brick-heist.ts's header for the brickfilm tradition and the three
// prompt instructions the look depends on (stepped stop-motion with no motion
// blur, a printed face that never acts, tilt-shift macro to fake the scale).
//
// WHY THIS ONE CLOSES THE SHELF, and why it is the only comedy: the other seven
// stories treat the minifigure's body as a character in costume. This one treats it
// as a BODY WITH REAL LIMITATIONS and makes those limitations the jokes — which is
// the oldest running gag in the medium and the one thing only this medium can be
// funny about:
//   · the hands are C-shaped claws that cannot hold a mug, a pen or a phone;
//   · the arms rotate at the shoulder and nowhere else, so nothing can be lifted
//     above the head or brought to the face;
//   · the legs bend only at the hip, so the figure cannot sit in a chair properly
//     or climb its own stairs;
//   · the face is printed, so the expression stays identical through every
//     humiliation of the day. That last one is the punchline of the whole template:
//     the character's unchanging printed half-smile through five disasters is
//     funnier than any animated reaction could be.
// This is also why the beats are deliberately small. A story about a bad Tuesday
// only works if nothing in it is dramatic.
//
// THE ARC — morning → traffic → work → collapse → one small win — is the sitcom
// day, and the ending is a DELIBERATE ANTICLIMAX: he wins nothing except one part
// clicking into place. The shelf's other seven stories end on gold, freedom, a
// finish line or a burning ship; this one ends on a person feeling slightly better,
// which is the note the shelf needs to close on. Five paid beats plus one free
// card.
//
// ASPECT 9:16: a kitchen, a lift, a desk, a bus queue. The everyday is vertical,
// and this is also the story most likely to be posted rather than watched.
//
// GRAMMAR: `hero` and `problem` options are all MASCULINE NOMINATIVE so beat 4's
// «Опять {{problem}}. Ну конечно. Именно сегодня.» reads correctly for every
// combination — a feminine problem («Пробка», «Почта») turns the line into
// something a Russian speaker would not say. See fruit-drama.ts for the convention.
import type { Template } from '../types'

export const brickCity: Template = {
  id: 'brick-city',
  category: 'brick',
  name: 'День минифигурки',
  tagline: 'Клешнёй не взять кружку. И это только утро.',
  description:
    'Кирпичный мультфильм про обычный день: минифигурка не может взять кружку клешнёй, стоит в кирпичной пробке, ' +
    'теряет башню документов и всё-таки находит одну маленькую победу к вечеру. Шесть битов — утро, пробка, работа, ' +
    'провал, победа. Комедия из ограничений самой игрушки: руки-клешни, негнущиеся ноги и одно печатное выражение ' +
    'лица на все катастрофы. Вертикаль 9:16, покадровая анимация, реплики на русском. ' +
    'Пять платных кадров: выбери героя, главную помеху и его победу.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: 'День минифигурки: {{hero}}',

  // Plastic minifigures — stylised and fantastical, no label required (the same
  // call the whole shelf makes, argued in brick-heist.ts). Not loopable: the
  // story resolves.
  loopable: false,
  disclosureTier: 'none',

  models: {
    draft: 'pixverse-v6',
    standard: 'wan-2-7',
    premium: 'veo-3-1-fast',
  },
  tierNotes: {
    premium: 'Минифигурки говорят сами — модель генерирует речь вместе с видео',
  },

  musicPrompt:
    'light comedic ukulele and pizzicato strings, bumbling bassoon and woodblock mishaps, a deadpan tuba shrug, gentle warm resolution on solo piano at the end of the day',

  variables: [
    {
      key: 'hero',
      kind: 'select',
      label: 'Кто герой',
      hint: 'Обычная минифигурка с обычным вторником.',
      defaultValue: 'clerk',
      options: [
        {
          value: 'clerk',
          label: 'Клерк',
          prompt:
            'a minifigure office clerk in a rumpled grey suit torso and printed crooked tie, printed neutral half-smile and printed tired eyes on his cylindrical head, C-shaped claw hands, rigid unmoving printed face',
        },
        {
          value: 'courier',
          label: 'Курьер',
          prompt:
            'a minifigure delivery courier in a bright green jacket torso and printed cap, an oversized plastic delivery box strapped to his back, printed neutral half-smile on his cylindrical head, C-shaped claw hands, rigid unmoving printed face',
        },
        {
          value: 'barista',
          label: 'Бариста',
          prompt:
            'a minifigure barista in a brown apron torso and printed beanie, printed neutral half-smile and printed stubble on his cylindrical head, C-shaped claw hands, rigid unmoving printed face',
        },
      ],
    },
    {
      key: 'problem',
      kind: 'select',
      label: 'Что всё портит',
      hint: 'Мужской род — так требует реплика в четвёртом бите.',
      defaultValue: 'coffee',
      options: [
        {
          value: 'coffee',
          label: 'Кофе',
          prompt: 'a tipped-over plastic coffee cup and a spreading brown puddle plate across a keyboard tile',
        },
        {
          value: 'boss',
          label: 'Начальник',
          prompt:
            'a large minifigure boss in a pinstripe suit torso with a printed shouting face and printed thick eyebrows, one claw hand jabbing forward',
        },
        {
          value: 'printer',
          label: 'Принтер',
          prompt:
            'a brick-built office printer jammed and spewing a long concertina of white paper tiles across the floor',
        },
      ],
    },
    {
      // The one free-text knob. It lands only in the last spoken line — never in a
      // visual prompt (the rule from types.ts, asserted for every template). The
      // small win is the whole point of the story, so it is the thing to let the
      // user own.
      key: 'win',
      kind: 'text',
      label: 'Маленькая победа дня',
      hint: 'Одна фраза. Звучит в последнем бите. Чем мельче победа, тем лучше.',
      defaultValue: 'Я нашёл ту деталь, которую искал полгода.',
      maxLength: 120,
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Утро',
      durationSeconds: 8,
      // The anatomical gag, stated first because it teaches the audience the rules
      // of the body they are about to watch fail for five more beats.
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} tries again and again to pick up a plastic mug from a brick-built kitchen counter, his C-shaped claw hands closing on nothing, his arms only able to rotate at the shoulder, the same printed half-smile throughout, grey morning light through a brick-built window, visible brick studs and mould seams, dust and fingerprints on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'static', quality: 'ultra' },
      title: { text: 'Обычный вторник. Ничего особенного.', position: 'top' },
      voiceover: { text: 'Так. Ещё раз. Просто взять кружку. Просто взять.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Пробка',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} stands motionless in a dense jam of brick-built cars on a studded grey road, a hundred tiny minifigure drivers all facing forward in identical stillness, brick-built tower blocks and a stopped tram behind them, flat overcast light, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-in', quality: 'ultra' },
      voiceover: { text: 'Двадцать минут. Мы стоим двадцать минут на одном месте.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Работа',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} carries a swaying tower of white paper tiles taller than himself across a brick-built open-plan office, unable to bend his arms or see past the stack, rows of identical minifigure colleagues at brick-built desks ignoring him, flat fluorescent light, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'pan', quality: 'ultra' },
      voiceover: { text: 'Только не сейчас. Только доне... ой.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Провал',
      durationSeconds: 8,
      // The unchanging printed face is the joke here: five disasters, one expression.
      prompt:
        'a miniature world built entirely from plastic construction bricks: the paper tiles fan across the office floor around {{hero}} while {{problem}} makes everything worse in the same frame, his printed half-smile completely unchanged, colleagues turning to look, harsh overhead fluorescent light, visible brick studs and mould seams, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'handheld', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Опять {{problem}}. Ну конечно. Именно сегодня.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Победа',
      durationSeconds: 8,
      // A deliberate anticlimax. The other seven stories on the shelf end on gold or
      // freedom; the shelf needs one that ends on a person feeling slightly better.
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} sits alone on the studded floor of his small brick-built flat in the evening, clicking one single small brick into place on a half-built model on the rug, warm lamplight on the plastic, the city dark in the window behind him, the same printed half-smile as always, visible brick studs, dust on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'dolly-out', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 400,
      voiceover: { text: '{{win}}', voice: 'Dmitry' },
    },
    {
      kind: 'title',
      beat: 'Клиффхэнгер',
      durationSeconds: 2,
      title: { text: 'СРЕДА · ЧАСТЬ 2 →', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
