// apps/api/src/modules/templates/catalog/brick-heist.ts
// «Ограбление кирпичного банка» — the brickfilm heist. First of the eight-story
// «Брик-мульты» shelf (owner request 2026-07-30: "лего-мультфильмы с историями").
//
// THE GENRE (researched, not invented). A "brickfilm" is stop-motion animation
// shot with plastic construction bricks and their minifigures. It is one of the
// oldest amateur film traditions there is: the first known one is «Journey to the
// Moon», shot on Super 8 by Lars and Henrik Hassing in Denmark in 1973; the
// landmark is Lindsay Fleay's 16-minute «The Magic Portal» (Australia, 1989); the
// term itself dates to the brickfilms.com community around 2000, and YouTube plus
// the 2014 theatrical feature turned the look into something a general audience
// recognizes instantly. The community's own annual speed-animation contests
// (BRAWL) are why the conventions below are so uniform: thousands of people
// solving the same problems with the same 4-centimetre actors.
//
// THE THREE THINGS THAT MAKE IT READ AS A BRICKFILM, and each is a prompt
// instruction rather than a hope:
//
//  1. THE MOTION IS STEPPED. Stop-motion is shot at 12–15 fps, one frame at a
//     time, with NO motion blur — the jitter between frames is the signature. A
//     video model, trained on live action, defaults to buttery interpolated
//     motion, so "stepped jittery stop-motion, no motion blur" has to be demanded
//     in every single prompt. This is the same fight the 'hand-drawn' style
//     documents in presets.ts, and losing it produces the exact uncanny failure
//     that kills the illusion: brick characters moving like a CGI render.
//  2. THE FACE DOES NOT ACT. A minifigure head is a cylinder with a printed
//     expression; arms rotate at the shoulder only and the hands are C-shaped
//     claws that cannot really grip. So the performance is BODY and CAMERA. Left
//     alone a model will animate a rubbery cartoon face and instantly turn the
//     toy into a cartoon character, which is a different (worse) product — hence
//     "rigid unmoving printed face" in the option fragments.
//  3. THE SCALE IS FAKED WITH THE LENS. Tilt-shift macro, shallow depth of field,
//     visible studs, mould seams, dust and fingerprints on the plastic. That is
//     what says "somebody photographed this on a table" instead of "somebody
//     rendered this".
//
// WHY styleId IS 'cinematic' AND NOT '3d-cartoon': a brickfilm is PHOTOGRAPHED
// PHYSICAL PLASTIC, so the photoreal style is the correct one — and its negative
// prompt ("cartoon, anime, illustration") actively pushes away the failure mode
// in point 2. The same reasoning fruit-drama uses for hyperreal macro fruit.
//
// THE ARC. A heist is the tightest five-beat story that exists, which is why it
// leads the shelf: план → маски → сейф → погоня → твист. The twist is structural,
// not decorative — a heist that simply succeeds has no ending, and the "the bag
// was full of ordinary grey bricks" reveal is also a joke only this medium can
// tell. Five paid beats plus one free card.
//
// ASPECT 9:16: this one is a vertical microdrama. The beats are close-ups of
// hands, faces and a safe dial — the heist reads fine in a phone frame, and the
// shelf's verticals are the ones meant to be posted rather than watched.
//
// GRAMMAR (the load-bearing kind — see fruit-drama.ts's header): every `hero`
// and every `loot` option is MASCULINE NOMINATIVE, which is what lets beat 3's
// line «Вот он. {{loot}}. Двадцать лет я о нём мечтал.» decline correctly for
// every combination without a grammar engine. A feminine loot («корона»,
// «монета») silently breaks «он»/«о нём». Don't add one.
import type { Template } from '../types'

export const brickHeist: Template = {
  id: 'brick-heist',
  category: 'brick',
  name: 'Ограбление кирпичного банка',
  tagline: 'Идеальный план. Четыре минифигурки. Один сейф.',
  description:
    'Кирпичный мультфильм в жанре ограбления: минифигурки в масках берут банк, собранный из деталей конструктора. ' +
    'Шесть битов — план на столе, маски, вскрытие сейфа, погоня по кирпичному городу и твист в финале. ' +
    'Съёмка макро с наклоном фокуса, рваная покадровая анимация, вертикаль 9:16, реплики на русском. ' +
    'Пять платных кадров: выбери главаря, добычу и название банды.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: 'Ограбление века: {{loot}}',

  // All three tier models natively do 8s at 9:16 — the invariant assertTemplatesValid()
  // checks at boot. veo-3-1-fast is premium because it generates the dialogue
  // itself, and a heist is whispered orders: the voices ARE the scene.
  models: {
    draft: 'pixverse-v6',
    standard: 'wan-2-7',
    premium: 'veo-3-1-fast',
  },
  tierNotes: {
    premium: 'Минифигурки говорят сами — модель генерирует речь вместе с видео',
  },

  musicPrompt:
    'tense heist caper jazz, muted trumpet and walking upright bass, ticking clock percussion, sneaking pizzicato strings, building into a frantic big-band chase climax',

  variables: [
    {
      key: 'hero',
      kind: 'select',
      label: 'Кто главарь',
      hint: 'Тот, кто придумал план. Канон жанра — грабитель в полосатой маске.',
      defaultValue: 'striped',
      options: [
        {
          value: 'striped',
          label: 'Грабитель в маске',
          prompt:
            'a minifigure burglar in a black knit balaclava printed on his cylindrical head, black-and-white striped torso, C-shaped claw hands, rigid unmoving printed face',
        },
        {
          value: 'expolice',
          label: 'Бывший полицейский',
          prompt:
            'a minifigure ex-police officer with a printed stubbled face and stern printed eyebrows on his cylindrical head, dark navy uniform torso with a torn-off badge, C-shaped claw hands, rigid unmoving printed face',
        },
        {
          value: 'grandpa',
          label: 'Дедушка-взломщик',
          prompt:
            'an elderly minifigure safecracker with a printed white moustache and round printed glasses on his cylindrical head, brown knitted cardigan torso, C-shaped claw hands, rigid unmoving printed face',
        },
      ],
    },
    {
      key: 'loot',
      kind: 'select',
      label: 'Что в сейфе',
      hint: 'То, ради чего всё это. Мужской род — так требует реплика в третьем бите.',
      defaultValue: 'ingot',
      options: [
        {
          value: 'ingot',
          label: 'Золотой слиток',
          prompt: 'a stack of gleaming gold-coloured plastic brick ingots',
        },
        {
          value: 'diamond',
          label: 'Алмаз',
          prompt: 'an enormous translucent blue faceted plastic gem piece the size of a minifigure head',
        },
        {
          value: 'idol',
          label: 'Золотой идол',
          prompt: 'a small golden plastic idol figurine with printed carved eyes, brick-built pedestal',
        },
      ],
    },
    {
      // The one free-text knob, and it lands ONLY on the closing card — never in a
      // visual prompt (the rule from types.ts, asserted for every template). A gang
      // name is exactly the thing a user wants to own and exactly the thing that
      // does not belong in a paid prompt.
      key: 'crew',
      kind: 'text',
      label: 'Название банды',
      hint: 'Выводится на финальной карточке. Коротко и заглавными — так смешнее.',
      defaultValue: 'БРИГАДА КИРПИЧ',
      maxLength: 40,
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'План',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} leans over a hand-drawn bank blueprint spread across a brick-built table in a dim backroom, three other minifigures crowd around it, one claw hand points at the vault, a single bare bulb swings above them, visible brick studs and mould seams, dust and fingerprints on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'dolly-in', quality: 'ultra' },
      // The hook. Vertical brickfilms are watched muted first — beat 1 carries the
      // premise as burned-in text or the viewer never hears the voices at all.
      title: { text: 'План был идеальным...', position: 'top' },
      voiceover: { text: 'Заходим в три ночи. Сигнализация — моя забота.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Маски',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} and three minifigures snap black printed masks onto their cylindrical heads in unison and step through the revolving door of a brick-built bank at night, cold blue street light behind them, their shadows long across the studded floor, visible brick studs and mould seams, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'low-angle', cameraMotion: 'static', quality: 'ultra' },
      voiceover: { text: 'Маски. Тихо. Никакой самодеятельности.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Сейф',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: extreme macro of a C-shaped claw hand turning the dial of a massive brick-built vault door, the door swings open and warm light spills out onto {{loot}} inside, {{hero}} stares into the vault, visible brick studs and mould seams, dust on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: {
        styleId: 'cinematic',
        cameraShot: 'extreme-close-up',
        cameraMotion: 'dolly-in',
        quality: 'ultra',
      },
      // The line the grammar note in the header exists for: «он» and «о нём» agree
      // with every loot option because all three are masculine nominative.
      voiceover: { text: 'Вот он. {{loot}}. Двадцать лет я о нём мечтал.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Погоня',
      durationSeconds: 8,
      // The brick-built destruction convention: in a brickfilm a crash is the model
      // bursting into loose parts. It is the medium's one native special effect and
      // the reason a chase is worth animating at all.
      prompt:
        'a miniature world built entirely from plastic construction bricks: a brick-built getaway car slews around a corner of a brick city street, a police car clips a lamppost behind it and bursts apart into a shower of loose individual bricks mid-air, {{hero}} leans out of the window clutching a canvas sack, siren lights streaking, visible brick studs, dust on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'handheld', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Гони! ГОНИ! Не оборачивайся!', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Твист',
      durationSeconds: 8,
      // The ending. A heist that just succeeds has no ending — and "the sack is
      // full of ordinary grey bricks" is a punchline only this medium can tell.
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} tips the canvas sack out onto a brick-built table in a safehouse and a heap of plain grey ordinary bricks tumbles out, he stares down at them with his rigid unmoving printed face, another minifigure slowly turns to look at him, harsh single bulb overhead, visible brick studs, dust on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'dolly-out', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: 'Это... это обычные детали. Нас подменили.', voice: 'Dmitry' },
    },
    {
      // Free — a title card carries no generation (ffmpeg draws it over black), and
      // the "PART 2" convention is what makes a shelf of stories a series.
      kind: 'title',
      beat: 'Клиффхэнгер',
      durationSeconds: 2,
      title: { text: '{{crew}} вернётся · ЧАСТЬ 2 →', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
