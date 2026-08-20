// apps/api/src/modules/templates/catalog/brick-pirates.ts
// «Пираты кирпичного моря» — the brickfilm pirate adventure. Seventh of the
// «Брик-мульты» shelf (owner request 2026-07-30).
//
// THE GENRE: see brick-heist.ts's header for the brickfilm tradition and the three
// prompt instructions the look depends on (stepped stop-motion with no motion
// blur, a printed face that never acts, tilt-shift macro to fake the scale).
//
// WHY PIRATES: alongside space and castle, this is the third of the medium's
// founding subjects — and it is the one that forces the medium's most beloved
// practical effect. YOU CANNOT ANIMATE WATER. Brickfilmers build the sea out of
// blue and transparent plates and TILT them between frames, so a storm is a floor
// that rocks; spray is pulled cotton wool. Asking a video model for "stormy sea"
// gets photoreal fluid simulation and the table-top illusion dies instantly, which
// is why every marine beat below specifies waves BUILT FROM PLATES. This is the
// single most important prompt instruction in this file.
//
// THE ARC — the map → the storm → the island → the chest → the betrayal → the split
// — is the treasure shape, and the betrayal is structural rather than a twist: a
// treasure story that ends when the chest opens has no second half, because the
// question the genre actually asks is not "is there gold" but "what does the gold
// do to them". Six paid beats, and the LONGEST story on the shelf at eight beats
// total, because it is the one with a genuine act break (the storm) before the goal
// is even in sight.
//
// TWO FREE CARDS: an opening card for the place-and-name (same reasoning as
// brick-castle — a period adventure needs its register set before the first image)
// and the closing serial card.
//
// ASPECT 16:9: a ship, a horizon, a beach. Nothing in this story is vertical.
//
// GRAMMAR: `captain` and `treasure` options are all MASCULINE NOMINATIVE — for
// `treasure` that means the HEAD noun is masculine («сундук дублонов», not
// «шкатулка») — because beat 4's line is «{{treasure}}. Он мой. Я двадцать лет шёл
// за ним.» A feminine treasure («Корона», «Шкатулка») silently breaks «он»,
// «мой» and «за ним» in one line. See fruit-drama.ts for the convention.
import type { Template } from '../types'

export const brickPirates: Template = {
  id: 'brick-pirates',
  category: 'brick',
  name: 'Пираты кирпичного моря',
  tagline: 'Карта, шторм, остров и сундук. Делить будут не все.',
  description:
    'Кирпичный мультфильм про пиратов: корабль из деталей конструктора, море из синих пластин, шторм, остров, ' +
    'сундук в песке и предательство на берегу. Восемь битов — вступительная карточка, карта, шторм, остров, сундук, ' +
    'предательство, делёж и финальная карточка. Широкий кадр 16:9, покадровая анимация, реплики на русском. ' +
    'Шесть платных кадров: выбери капитана, сокровище и название корабля.',
  aspectRatio: '16:9',
  defaultStyleId: 'cinematic',
  titleTemplate: 'Пираты кирпичного моря: «{{ship}}»',

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
    'swashbuckling pirate orchestral adventure, galloping strings and cannon-fire drums, howling brass and crashing cymbals through the storm, hushed suspenseful strings at the chest, a dark minor turn at the betrayal',

  variables: [
    {
      key: 'captain',
      kind: 'select',
      label: 'Кто капитан',
      hint: 'Тот, кто двадцать лет шёл за сокровищем.',
      defaultValue: 'hook',
      options: [
        {
          value: 'hook',
          label: 'Капитан с крюком',
          prompt:
            'a minifigure pirate captain in a red coat torso and black tricorn hat piece, printed eyepatch and printed grin on his cylindrical head, a plastic hook where one C-shaped claw hand should be, rigid unmoving printed face',
        },
        {
          value: 'onelegged',
          label: 'Одноногий капитан',
          prompt:
            'a grizzled minifigure pirate captain in a long blue coat torso with a plastic peg leg, printed bushy beard and printed scowl on his cylindrical head, C-shaped claw hands, rigid unmoving printed face',
        },
        {
          value: 'young',
          label: 'Юный капитан',
          prompt:
            'a young minifigure pirate captain in an oversized captain’s coat torso and crooked hat piece, printed freckles and printed bright eyes on his cylindrical head, C-shaped claw hands, rigid unmoving printed face',
        },
      ],
    },
    {
      key: 'treasure',
      kind: 'select',
      label: 'Что в сундуке',
      hint: 'Мужской род в главном слове — так требует реплика у сундука.',
      defaultValue: 'doubloons',
      options: [
        {
          value: 'doubloons',
          label: 'Сундук дублонов',
          prompt: 'a brick-built chest overflowing with gold-coloured round plastic coin tiles',
        },
        {
          value: 'gem',
          label: 'Алмаз',
          prompt:
            'a single enormous translucent purple faceted plastic gem resting on black velvet inside a brick-built chest',
        },
        {
          value: 'idol',
          label: 'Золотой идол',
          prompt:
            'a golden plastic idol figurine with printed carved eyes standing inside a brick-built chest packed with straw-coloured pieces',
        },
      ],
    },
    {
      // The one free-text knob. It names the film and appears on the opening card —
      // never in a visual prompt (the rule from types.ts, asserted for every
      // template). A ship's name is the one thing every player of this game wants
      // to write themselves.
      key: 'ship',
      kind: 'text',
      label: 'Название корабля',
      hint: 'Идёт в название фильма и на вступительную карточку.',
      defaultValue: 'ЧЁРНЫЙ КИРПИЧ',
      maxLength: 40,
    },
  ],

  shots: [
    {
      // Free. Opens the story: a period adventure needs its place, year and ship
      // name before the first image, and a card costs nothing.
      kind: 'title',
      beat: 'Титул',
      durationSeconds: 2,
      title: { text: 'КИРПИЧНОЕ МОРЕ, 1712 · «{{ship}}»', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
    {
      kind: 'clip',
      beat: 'Карта',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{captain}} bends over a torn treasure map spread on a brick-built table in a cramped ship’s cabin, a plastic candle and a brass compass tile beside it, his first mate watching from the shadows behind him, warm lantern light swinging across the studded walls, visible brick studs and mould seams, dust and fingerprints on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'dolly-in', quality: 'ultra' },
      title: { text: 'Двадцать лет он искал этот остров.', position: 'top' },
      voiceover: { text: 'Здесь. Вот эта бухта. Мы почти пришли.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Шторм',
      durationSeconds: 8,
      // The instruction this whole file turns on: the sea is BUILT AND TILTED, not
      // simulated. Ask for "stormy water" and you get photoreal fluid and lose the
      // table-top illusion in one frame.
      prompt:
        'a miniature world built entirely from plastic construction bricks: a brick-built pirate ship pitches on a sea assembled from stacked blue and transparent plastic plates tilted into waves, spray of pulled-apart cotton wool bursting over the bow, minifigure sailors clinging to the rigging of thin plastic string, lightning of white transparent rods, {{captain}} lashed to the wheel, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'handheld', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Держать курс! Я сказал — ДЕРЖАТЬ КУРС!', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Остров',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: a brick-built longboat grinds onto a beach of tan studded plates, {{captain}} steps ashore between plastic palm trees, a wrecked hull half-buried in the sand behind him, the sea of blue and transparent plates flat and bright to the horizon, hard tropical sunlight, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'crane', quality: 'ultra' },
      voiceover: { text: 'Двадцать лет. И вот я стою на этом песке.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Сундук',
      durationSeconds: 8,
      // The masculine-head-noun line the grammar note exists for.
      prompt:
        'a miniature world built entirely from plastic construction bricks: minifigure pirates heave a brick-built chest out of a sand pit and the lid swings open to reveal {{treasure}}, warm reflected light thrown up onto their printed faces, plastic shovels dropped in the sand around them, {{captain}} reaching in with one claw hand, visible brick studs, dust on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: {
        styleId: 'cinematic',
        cameraShot: 'extreme-close-up',
        cameraMotion: 'dolly-in',
        quality: 'ultra',
      },
      voiceover: { text: '{{treasure}}. Он мой. Я двадцать лет шёл за ним.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Предательство',
      durationSeconds: 8,
      // Not a twist — the act break. A treasure story that ends when the chest opens
      // never asks the question the genre exists to ask.
      prompt:
        'a miniature world built entirely from plastic construction bricks: the first mate levels a plastic flintlock pistol at {{captain}}’s back on the beach while the crew slowly steps away from him, the open chest between them, long low shadows across the studded sand at sunset, visible brick studs and mould seams, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'orbit', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Прости, капитан. Двадцать лет ждал не только ты.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Делёж',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: the pirates squabble over the spilled treasure on the beach at dusk, coins and gems scattered across the studded sand, two of them wrestling in the background, {{captain}} sitting alone at the water’s edge with his back to all of it, the ship burning far out on the plate-built sea, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-out', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 400,
      voiceover: { text: 'Золото они поделили. Корабль сожгли. Домой не вернулся никто.', voice: 'Svetlana' },
    },
    {
      kind: 'title',
      beat: 'Клиффхэнгер',
      durationSeconds: 2,
      title: { text: 'ОСТРОВ НЕ ОТПУСКАЕТ · ЧАСТЬ 2 →', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
