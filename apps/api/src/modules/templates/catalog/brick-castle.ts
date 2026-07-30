// apps/api/src/modules/templates/catalog/brick-castle.ts
// «Побег из замка» — the brickfilm castle escape. Fourth of the «Брик-мульты»
// shelf (owner request 2026-07-30).
//
// THE GENRE: see brick-heist.ts's header for the brickfilm tradition and the three
// prompt instructions the look depends on (stepped stop-motion with no motion
// blur, a printed face that never acts, tilt-shift macro to fake the scale).
//
// WHY A CASTLE: after space, this is the medium's other founding subject — the
// toy's castle line is what most brick worlds were built from, and the community's
// «medieval» brickfilms are its oldest continuous sub-genre. It also gives the
// shelf its one FANTASY story, and fantasy is where the medium's cheapest trick
// works best: a monster that would cost a fortune in any other technique is, here,
// a thing you build out of the parts you already own.
//
// THE ARC — dungeon → guards → beast → bridge → freedom — is the escape shape, and
// the order is not interchangeable. Each beat is one obstacle harder than the last
// and each is a different KIND of obstacle: a lock (patience), men (stealth), a
// monster (courage), a drop (nerve). An escape story that repeats a kind of
// obstacle feels twice as long and half as tense.
//
// TWO FREE CARDS INSTEAD OF ONE, and this is the only story on the shelf that
// opens on a card: a period piece needs one line of place-and-date before the
// first image or the viewer spends beat 1 working out where they are. It costs
// nothing (a title card carries no generation) and it buys the whole medieval
// register in two seconds.
//
// ASPECT 9:16: dungeons, arrow slits, a spiral stair, a rope down a wall — this
// story is composed of TALL spaces, and a vertical frame is a gift here rather
// than a constraint.
//
// GRAMMAR: `hero` and `beast` options are all MASCULINE NOMINATIVE, so the film
// title «{{hero}} против {{beast}}» and beat 4's «Он не пройдёт мимо. {{beast}}
// чует страх.» agree for all nine combinations. A feminine beast («Ведьма»,
// «Змея») silently breaks «чует» in the reading the line is written for. See
// fruit-drama.ts on why the templates carry this convention instead of a grammar
// engine.
import type { Template } from '../types'

export const brickCastle: Template = {
  id: 'brick-castle',
  category: 'brick',
  name: 'Побег из замка',
  tagline: 'Темница, стража, дракон и обрыв. Один выход — вниз.',
  description:
    'Кирпичный мультфильм в средневековом замке из деталей конструктора: минифигурка бежит из темницы мимо стражи, ' +
    'через логово чудовища и по обрушенному мосту. Семь битов — вступительная карточка, темница, стража, чудовище, ' +
    'мост, свобода и финальная карточка. Вертикаль 9:16, покадровая анимация, реплики на русском. ' +
    'Пять платных кадров: выбери героя, чудовище и его клятву на воле.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: '{{hero}} против {{beast}}',

  models: {
    draft: 'pixverse-v6',
    standard: 'wan-2-7',
    premium: 'veo-3-1-fast',
  },
  tierNotes: {
    premium: 'Минифигурки говорят сами — модель генерирует речь вместе с видео',
  },

  musicPrompt:
    'medieval orchestral adventure, lute and hand drums, dark male choir and low strings in the dungeon, snarling brass at the beast, soaring heroic horns and bells at the escape',

  variables: [
    {
      key: 'hero',
      kind: 'select',
      label: 'Кто бежит',
      hint: 'Тот, кого бросили в темницу.',
      defaultValue: 'knight',
      options: [
        {
          value: 'knight',
          label: 'Рыцарь без доспехов',
          prompt:
            'a minifigure knight stripped of his armour, torn undershirt torso, printed bruised face and printed determined eyes on his cylindrical head, C-shaped claw hands, rigid unmoving printed face',
        },
        {
          value: 'thief',
          label: 'Вор',
          prompt:
            'a wiry minifigure thief in a dark hooded cloak, printed sly grin and printed narrowed eyes on his cylindrical head, a bent plastic lockpick in his C-shaped claw hand, rigid unmoving printed face',
        },
        {
          value: 'jester',
          label: 'Шут',
          prompt:
            'a minifigure court jester in a patched purple-and-yellow motley torso and a printed painted grin on his cylindrical head, a two-pronged plastic cap piece, C-shaped claw hands, rigid unmoving printed face',
        },
      ],
    },
    {
      key: 'beast',
      kind: 'select',
      label: 'Кто в подземелье',
      hint: 'Третье препятствие. Мужской род — так требуют реплики.',
      defaultValue: 'dragon',
      options: [
        {
          value: 'dragon',
          label: 'Дракон',
          prompt:
            'an enormous brick-built green dragon with hinged jaw plates, transparent red eye pieces and folded wing panels, curled around a pile of gold-coloured bricks',
        },
        {
          value: 'skeleton',
          label: 'Скелет',
          prompt:
            'a towering brick-built skeleton assembled from bone-white pieces with a printed skull head and a rusted plastic axe in its claw hands',
        },
        {
          value: 'troll',
          label: 'Тролль',
          prompt:
            'a hulking brick-built troll of grey and moss-green pieces with a printed snarling face, tusks, and a knotted plastic club',
        },
      ],
    },
    {
      // The one free-text knob. It lands only in a spoken line — never in a visual
      // prompt (the rule from types.ts, asserted for every template). What a man
      // shouts when he gets out is the line a user most wants to write themselves.
      key: 'oath',
      kind: 'text',
      label: 'Что герой кричит на воле',
      hint: 'Одна фраза. Звучит в последнем бите.',
      defaultValue: 'Я вернусь! И заберу свой замок обратно!',
      maxLength: 120,
    },
  ],

  shots: [
    {
      // Free. The one card that OPENS a story on this shelf: a period piece needs
      // its place and date before the first image, or beat 1 is spent guessing.
      kind: 'title',
      beat: 'Титул',
      durationSeconds: 2,
      title: { text: 'ГОД 1387. ЗАМОК ЧЁРНОЙ СКАЛЫ.', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
    {
      kind: 'clip',
      beat: 'Темница',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} works a bent plastic pin into the lock of a brick-built dungeon door, chained by one wrist to a studded stone wall, a single shaft of moonlight through a barred arrow slit high above him, rat pieces on the floor, visible brick studs and mould seams, dust and fingerprints on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'dolly-in', quality: 'ultra' },
      title: { text: 'Тридцать ночей он точил эту деталь...', position: 'top' },
      voiceover: { text: 'Ещё немного. Ещё один поворот — и я свободен.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Стража',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} presses flat into an alcove of a brick-built spiral stairwell as two minifigure guards in printed chainmail torsos and plastic halberds march past a hand’s width away, torchlight of orange transparent bricks flickering on the studded walls, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'static', quality: 'ultra' },
      voiceover: { text: 'Не дыши. Не двигайся. Просто не дыши.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Чудовище',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{beast}} rears up in a cavern beneath the castle as {{hero}} freezes mid-step on a narrow ledge, cotton wool steam drifting from between the beast’s jaw plates, orange transparent brick firelight from below raking both of them, visible brick studs and mould seams, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'low-angle', cameraMotion: 'dolly-in', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Он не пройдёт мимо. {{beast}} чует страх.', voice: 'Svetlana' },
    },
    {
      kind: 'clip',
      beat: 'Мост',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} sprints across a collapsing brick-built drawbridge as its planks fall away behind him one loose brick at a time into a black chasm, arrows of grey plastic rods thudding into the boards, wind whipping his cloak plate, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'pan', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Не смотри вниз! НЕ СМОТРИ ВНИЗ!', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Свобода',
      durationSeconds: 8,
      // The only beat that carries the user's own words.
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} stands on a studded green hillside at sunrise with the brick-built castle burning far behind him, both C-shaped claw hands raised, mist of pulled cotton wool in the valley below, warm golden light on the plastic, visible brick studs and mould seams, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'crane', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: '{{oath}}', voice: 'Dmitry' },
    },
    {
      kind: 'title',
      beat: 'Клиффхэнгер',
      durationSeconds: 2,
      title: { text: 'ОСАДА · ЧАСТЬ 2 →', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
