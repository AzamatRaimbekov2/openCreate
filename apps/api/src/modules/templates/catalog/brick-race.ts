// apps/api/src/modules/templates/catalog/brick-race.ts
// «Большая гонка» — the brickfilm race. Third of the «Брик-мульты» shelf (owner
// request 2026-07-30).
//
// THE GENRE: see brick-heist.ts's header for the brickfilm tradition and for the
// three prompt instructions the look depends on (stepped stop-motion without
// motion blur, a printed face that never acts, tilt-shift macro for scale).
//
// WHY A RACE BELONGS ON THIS SHELF, and it is not just "cars are fun": the medium
// has exactly one native special effect — a model bursting into its component
// bricks — and a race is the only story shape that can use it TWICE, once as
// catastrophe (beat 4) and once as salvation (beat 5, the pit crew snapping the
// car back together out of the same loose parts). Brickfilmers call that pair the
// rebuild gag, and it is the single most satisfying thing this medium does. No
// other story on the shelf gets to do it.
//
// THE ARC — pole position → sabotage → start → crash → rebuild → finish — is the
// sports-film shape, and the sabotage is load-bearing rather than decorative: a
// crash the hero causes himself makes him incompetent, while a crash somebody
// engineered makes the comeback a moral event. Six paid beats plus one free card.
//
// ASPECT 16:9: a race is horizontal motion. A vertical frame can hold a driver's
// face but not two cars side by side, and two cars side by side is the sport.
// (All three tier models do 8s at 16:9; the boot assertion checks it.)
//
// GRAMMAR: `hero` and `rival` options are ALL MASCULINE NOMINATIVE, so beat 2's
// «{{rival}} не любит проигрывать» and the film title «{{hero}} против {{rival}}»
// agree for all nine combinations without a grammar engine. A feminine option
// («Гонщица», «Команда») breaks «не любит проигрывать»'s subject agreement in the
// reading the line is written for. See fruit-drama.ts on why this matters.
import type { Template } from '../types'

export const brickRace: Template = {
  id: 'brick-race',
  category: 'brick',
  name: 'Большая гонка',
  tagline: 'Ему открутили колесо перед стартом. Он всё равно вышел на трассу.',
  description:
    'Кирпичный мультфильм про гонку: болиды из деталей конструктора, минифигурки в шлемах, ночной саботаж в боксах ' +
    'и авария, после которой машину собирают заново прямо на пит-лейне. Семь битов — квалификация, саботаж, старт, ' +
    'авария, пересборка, финиш. Широкий кадр 16:9, покадровая анимация, реплики на русском. ' +
    'Шесть платных кадров: выбери гонщика и соперника.',
  aspectRatio: '16:9',
  defaultStyleId: 'cinematic',
  titleTemplate: '{{hero}} против {{rival}}',

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
    'high-energy motorsport rock, driving drums and distorted electric guitar, revving engine percussion, a dark tense synth bridge during the night sabotage, hammering rebuild montage rhythm, euphoric anthemic victory chorus at the finish',

  variables: [
    {
      key: 'hero',
      kind: 'select',
      label: 'Кто за рулём',
      hint: 'Тот, кому открутят колесо.',
      defaultValue: 'veteran',
      options: [
        {
          value: 'veteran',
          label: 'Ветеран трассы',
          prompt:
            'a veteran minifigure racing driver in a scuffed red brick-built racing suit, printed grey stubble and a printed scar on his cylindrical head, open-face helmet under his arm, C-shaped claw hands, rigid unmoving printed face',
        },
        {
          value: 'rookie',
          label: 'Новичок',
          prompt:
            'a young minifigure rookie driver in a spotless white racing suit, wide printed eyes and a nervous printed smile on his cylindrical head, oversized helmet, C-shaped claw hands, rigid unmoving printed face',
        },
        {
          value: 'mechanic',
          label: 'Механик за рулём',
          prompt:
            'a minifigure mechanic in oil-stained blue overalls pressed into service as a driver, printed soot smudges and printed determined eyebrows on his cylindrical head, a plastic wrench still in his C-shaped claw hand, rigid unmoving printed face',
        },
      ],
    },
    {
      key: 'rival',
      kind: 'select',
      label: 'Кто соперник',
      hint: 'Тот, кто не любит проигрывать.',
      defaultValue: 'champion',
      options: [
        {
          value: 'champion',
          label: 'Чемпион',
          prompt:
            'a minifigure reigning champion in a gleaming black-and-gold racing suit, printed smirk and printed narrowed eyes on his cylindrical head, mirrored visor helmet, C-shaped claw hands, rigid unmoving printed face',
        },
        {
          value: 'billionaire',
          label: 'Миллиардер',
          prompt:
            'a minifigure billionaire team owner in a tailored white suit and printed sunglasses on his cylindrical head, a gold plastic chain around his neck, C-shaped claw hands, rigid unmoving printed face',
        },
        {
          value: 'robot',
          label: 'Робот',
          prompt:
            'a minifigure driver with a chrome-silver robot head printed with a single red optic slit, matte black brick-built body, mechanical claw hands, rigid unmoving printed face',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Квалификация',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} climbs out of a brick-built open-wheel racing car on pole position, grandstands packed with hundreds of tiny minifigures behind him, a brick-built pit wall and timing screens, hard afternoon sunlight, visible brick studs and mould seams, dust and fingerprints on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'crane', quality: 'ultra' },
      title: { text: 'Первый круг в его жизни — и сразу поул.', position: 'top' },
      voiceover: { text: 'Поул. Мой первый поул за двадцать лет.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Саботаж',
      durationSeconds: 8,
      // Not decoration: a crash the hero causes makes him incompetent, a crash
      // somebody engineered makes beat 5 a moral event instead of a repair.
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{rival}} crouches beside the hero’s brick-built racing car alone in a dark garage at night, twisting a wheel pin loose with a plastic wrench, a single work lamp throwing his long shadow across the studded floor, visible brick studs, dust on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'dolly-in', quality: 'ultra' },
      voiceover: { text: '{{rival}} не любит проигрывать. Он этого не допустит.', voice: 'Svetlana' },
    },
    {
      kind: 'clip',
      beat: 'Старт',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: a row of brick-built racing cars quivering on the grid, five red lights on a brick-built gantry go out, the cars launch forward and the whole grid blurs into stepped motion, {{hero}} gripping the wheel with both C-shaped claw hands, cotton wool tyre smoke, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'low-angle', cameraMotion: 'pan', quality: 'ultra' },
      voiceover: { text: 'Свет погас — и они пошли! Держись за ним!', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Авария',
      durationSeconds: 8,
      // The medium's one native special effect, used as catastrophe. Beat 5 uses the
      // same loose bricks as salvation — that pair is the rebuild gag.
      prompt:
        'a miniature world built entirely from plastic construction bricks: the loosened wheel tears off the hero’s brick-built racing car mid-corner and the whole car explodes apart into a fountain of loose individual bricks that tumble across the track, {{hero}} skidding along the tarmac still strapped to his seat plate, marshals running, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'handheld', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Колесо! У него отвалилось колесо!', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Пересборка',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: a swarm of minifigure mechanics snap the scattered loose bricks back into a whole racing car in the pit lane, hands and parts flying in stepped stop-motion, {{hero}} already climbing back into the half-finished seat, sparks of orange cellophane, harsh pit lighting, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'orbit', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: 'Соберите её. Любой ценой. Я доеду.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Финиш',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: the rebuilt brick-built car crosses the finish line half a stud ahead of {{rival}}, a minifigure marshal waving a chequered flag plate, the grandstand of tiny minifigures thrown up in celebration, confetti of loose coloured bricks in the air, golden hour light, lens flare, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'low-angle', cameraMotion: 'dolly-out', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: 'На полстуда впереди! Он выиграл на разобранной машине!', voice: 'Nikolai' },
    },
    {
      kind: 'title',
      beat: 'Клиффхэнгер',
      durationSeconds: 2,
      title: { text: 'СЛЕДУЮЩИЙ ЭТАП · ЧАСТЬ 2 →', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
