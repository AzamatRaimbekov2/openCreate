// apps/api/src/modules/templates/catalog/brick-build.ts
// «Стройка века» — the brickfilm construction epic. Fifth of the «Брик-мульты»
// shelf (owner request 2026-07-30).
//
// THE GENRE: see brick-heist.ts's header for the brickfilm tradition and the three
// prompt instructions the look depends on (stepped stop-motion with no motion
// blur, a printed face that never acts, tilt-shift macro to fake the scale).
//
// WHY A CONSTRUCTION STORY IS THE MOST HONEST STORY ON THIS SHELF: the medium's
// subject IS building. Every other story here uses bricks to depict something
// else; this one is about the thing the audience is actually watching — parts going
// together, a structure rising, a structure coming apart. The community has made
// timelapse build films since the medium existed, and the only thing this template
// adds to that is a person to care about.
//
// THE ARC — pit → crane → the slab falls → the night shift → the ribbon — is the
// work story, and its shape is deliberate: the disaster is CAUSED BY NOTHING. No
// villain, no sabotage, no twist. A sling slips and eight tonnes of plastic comes
// apart in mid-air. That is what separates it from brick-race (where a rival
// engineers the crash): here the antagonist is the job, and the heroism is that
// somebody stayed all night. Five paid beats plus one free card.
//
// ASPECT 9:16: a tower is the one subject a vertical frame renders better than a
// wide one — the whole story is looking UP at something that is not finished yet.
//
// GRAMMAR: `hero` and `building` options are all MASCULINE NOMINATIVE, which is
// what makes beat 4's line — «{{building}} должен стоять к утру» — agree for every
// combination. A feminine building («Башня», «Арена») silently breaks «должен»,
// and a neuter one («Здание») breaks it differently. See fruit-drama.ts on why the
// templates carry this convention rather than a grammar engine.
import type { Template } from '../types'

export const brickBuild: Template = {
  id: 'brick-build',
  category: 'brick',
  name: 'Стройка века',
  tagline: 'Кран уронил плиту за день до открытия. Прораб остался на ночь.',
  description:
    'Кирпичный мультфильм про стройку: котлован из деталей конструктора, кран, сорвавшаяся плита, которая ' +
    'рассыпается в воздухе на детали, и ночная смена, чтобы успеть к утру. Шесть битов — котлован, подъём, ' +
    'обрушение, ночная смена, открытие. Вертикаль 9:16, покадровая анимация, реплики на русском. ' +
    'Пять платных кадров: выбери прораба и то, что он строит.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: 'Стройка века: {{building}}',

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
    'industrious upbeat orchestral work theme, hammering anvil percussion and brass stabs, plunging low strings and silence when the slab falls, patient lonely piano through the night shift, proud full fanfare at the opening ceremony',

  variables: [
    {
      key: 'hero',
      kind: 'select',
      label: 'Кто прораб',
      hint: 'Тот, кто останется на ночь.',
      defaultValue: 'foreman',
      options: [
        {
          value: 'foreman',
          label: 'Прораб в каске',
          prompt:
            'a stocky minifigure site foreman in a yellow safety helmet and hi-vis orange vest torso, printed moustache and printed tired eyes on his cylindrical head, a rolled plastic blueprint in his C-shaped claw hand, rigid unmoving printed face',
        },
        {
          value: 'welder',
          label: 'Сварщик',
          prompt:
            'a minifigure welder in scorched grey overalls with a flipped-up printed welding visor on his cylindrical head, printed soot smudges on his face, a plastic torch in his C-shaped claw hand, rigid unmoving printed face',
        },
        {
          value: 'crane',
          label: 'Крановщик',
          prompt:
            'a lean minifigure crane operator in a faded blue jacket torso and printed flat cap on his cylindrical head, printed squinting eyes, a thermos piece in his C-shaped claw hand, rigid unmoving printed face',
        },
      ],
    },
    {
      key: 'building',
      kind: 'select',
      label: 'Что строят',
      hint: 'Мужской род — так требует реплика в ночной смене.',
      defaultValue: 'tower',
      options: [
        {
          value: 'tower',
          label: 'Небоскрёб',
          prompt:
            'a half-finished brick-built skyscraper of glossy dark-blue transparent panels and grey structural bricks, bare scaffolding on the top floors',
        },
        {
          value: 'stadium',
          label: 'Стадион',
          prompt:
            'a half-finished brick-built stadium bowl with tiered seating plates in three colours and a ring of floodlight masts',
        },
        {
          value: 'bridge',
          label: 'Мост',
          prompt:
            'a half-finished brick-built suspension bridge with two grey towers and cables of thin plastic string, one span still missing',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Котлован',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} stands at the lip of a brick-built excavation pit at sunrise holding an unrolled blueprint, a brick-built digger and a dozen tiny minifigure workers below him, {{building}} rising in outline behind the fence, visible brick studs and mould seams, dust and fingerprints on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'crane', quality: 'ultra' },
      title: { text: 'Сдать объект нужно было в пятницу.', position: 'top' },
      voiceover: { text: 'Работаем. У нас девять дней и ни одного лишнего часа.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Подъём',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: a brick-built tower crane lifts an enormous grey slab plate high above {{building}}, the sling of thin plastic string stretching taut, {{hero}} watching from the ground with one claw hand raised, hard midday sun, visible brick studs, dust on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'low-angle', cameraMotion: 'crane', quality: 'ultra' },
      voiceover: { text: 'Тише. Тише! Не дёргай, она сама пойдёт.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Обрушение',
      durationSeconds: 8,
      // No villain here, on purpose: the antagonist is the job. Compare brick-race,
      // where the crash is engineered — that story needs a rival, this one needs a
      // slipped sling.
      prompt:
        'a miniature world built entirely from plastic construction bricks: the sling slips and the huge slab plate drops, exploding on impact into a spreading wave of loose individual bricks that scatter across the site, minifigure workers thrown backwards, a cloud of pulled cotton wool dust rising, {{hero}} shielding his printed face with one claw arm, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'handheld', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'БЕРЕГИСЬ! Все назад, назад!', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Ночная смена',
      durationSeconds: 8,
      // The masculine-agreement line the grammar note in the header exists for.
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} works alone through the night on the unfinished {{building}}, snapping bricks back into place by the light of one work lamp, rain of thin transparent rods falling around him, the rest of the site dark and empty, visible brick studs and mould seams, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'dolly-in', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: '{{building}} должен стоять к утру. Значит, будет стоять.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Открытие',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: a red ribbon plate is cut with oversized plastic scissors in front of the finished {{building}}, a crowd of tiny minifigures applauding, {{hero}} standing slightly apart at the back still in his work clothes, confetti of loose coloured bricks in the air, warm morning light, lens flare, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-out', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: 'Никто и не заметил, что ночью его тут не было. И ладно.', voice: 'Svetlana' },
    },
    {
      kind: 'title',
      beat: 'Клиффхэнгер',
      durationSeconds: 2,
      title: { text: 'НОВЫЙ ОБЪЕКТ · ЧАСТЬ 2 →', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
