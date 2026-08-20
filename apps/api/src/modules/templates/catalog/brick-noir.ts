// apps/api/src/modules/templates/catalog/brick-noir.ts
// «Кирпичный детектив» — the brickfilm noir. Sixth of the «Брик-мульты» shelf
// (owner request 2026-07-30).
//
// THE GENRE: see brick-heist.ts's header for the brickfilm tradition and the three
// prompt instructions the look depends on (stepped stop-motion with no motion
// blur, a printed face that never acts, tilt-shift macro to fake the scale).
//
// WHY NOIR IS THE BEST FIT ON THE WHOLE SHELF, and it is not a coincidence:
//   · The medium cannot act with its face — and noir is the one genre where a
//     motionless, unreadable face is CORRECT. Every limitation listed in the
//     heist header stops being a limitation here.
//   · Noir is lit, not staged. Venetian-blind stripes, a desk lamp, rain on a
//     window, a figure in a doorway: all of it is achievable on a table with one
//     lamp and a comb, which is exactly how brickfilmers have always shot it.
//   · The genre runs on voice-over. This shelf ships Russian voice lines on every
//     paid beat, and noir is the one story where narration is the form rather than
//     a crutch — and on the premium tier the model speaks them itself.
//
// THE PREMISE IS MEDIUM-NATIVE and could not be told any other way: a minifigure's
// HEAD IS MISSING. In this world a head is a detachable part, so a decapitation is
// simultaneously a murder mystery, a body-horror image and a completely innocent
// thing that happens to every one of these toys in a real toy box. That triple
// reading is the joke, and it is why this template exists rather than a generic
// "stolen jewels" case.
//
// THE ARC — the case → the client → the interrogation → the tail → the reveal →
// the walk away — is the hard-boiled shape, and the reveal is placed at beat 5 of
// 6 rather than last on purpose: noir does not end on the answer, it ends on the
// detective leaving. Beat 6 is the genre.
//
// ASPECT 9:16: an office, a doorway, a bar stool, a fire escape — vertical, all of
// it. The one story on the shelf where the phone frame is a stylistic asset.
//
// GRAMMAR: `hero` and `culprit` options are all MASCULINE NOMINATIVE so beat 5's
// «Голову взял {{culprit}}. И он всё ещё в этой комнате.» agrees for every
// combination — «взял» and «он» both depend on it. A feminine culprit («Сестра»,
// «Секретарша») silently breaks the line. See fruit-drama.ts for the convention.
import type { Template } from '../types'

export const brickNoir: Template = {
  id: 'brick-noir',
  category: 'brick',
  name: 'Кирпичный детектив',
  tagline: 'У минифигурки пропала голова. И это не фигура речи.',
  description:
    'Кирпичный мультфильм в стиле нуар: детектив-минифигурка расследует исчезновение головы — в мире, где голова ' +
    'это съёмная деталь. Семь битов — дело, клиентка, допрос в баре, ночная слежка, разоблачение и уход под дождём. ' +
    'Свет через жалюзи, дождь за окном, вертикаль 9:16, покадровая анимация, закадровый голос на русском. ' +
    'Шесть платных кадров: выбери детектива и виновного.',
  aspectRatio: '9:16',
  defaultStyleId: 'cinematic',
  titleTemplate: '{{hero}} и пропавшая голова',

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
    'film noir jazz, smoky muted trumpet over brushed drums and walking double bass, rain-soaked melancholy, a lone piano in the empty office, one sharp brass stab at the reveal, unresolved fading ending',

  variables: [
    {
      key: 'hero',
      kind: 'select',
      label: 'Кто ведёт дело',
      hint: 'Канон жанра — плащ, шляпа и долги.',
      defaultValue: 'trench',
      options: [
        {
          value: 'trench',
          label: 'Детектив в плаще',
          prompt:
            'a minifigure private detective in a beige trench coat torso and a brown fedora piece, printed five o’clock shadow and printed weary eyes on his cylindrical head, C-shaped claw hands, rigid unmoving printed face',
        },
        {
          value: 'rookie',
          label: 'Молодой следователь',
          prompt:
            'a young minifigure police investigator in a cheap grey suit torso and loosened printed tie, printed earnest eyes and neat printed hair on his cylindrical head, a plastic notebook in his C-shaped claw hand, rigid unmoving printed face',
        },
        {
          value: 'retired',
          label: 'Отставной сыщик',
          prompt:
            'an elderly minifigure retired detective in a worn cardigan torso, printed white stubble and printed heavy bags under his eyes on his cylindrical head, a plastic cane in his C-shaped claw hand, rigid unmoving printed face',
        },
      ],
    },
    {
      key: 'culprit',
      kind: 'select',
      label: 'Кто виноват',
      hint: 'Мужской род — так требует реплика в разоблачении.',
      defaultValue: 'butler',
      options: [
        {
          value: 'butler',
          label: 'Дворецкий',
          prompt:
            'a tall minifigure butler in a black tailcoat torso with a printed white bow tie, printed impassive face on his cylindrical head, a silver plastic tray in his C-shaped claw hands',
        },
        {
          value: 'twin',
          label: 'Брат-близнец',
          prompt:
            'a minifigure identical twin in the same clothes as the victim, printed identical face with one printed scar across the cheek on his cylindrical head, C-shaped claw hands',
        },
        {
          value: 'client',
          label: 'Сам клиент',
          prompt:
            'a wealthy minifigure client in a camel overcoat torso and printed pencil moustache on his cylindrical head, a plastic cigarette holder in his C-shaped claw hand',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Дело',
      durationSeconds: 8,
      // One lamp and a comb: the whole noir grammar is achievable on a table, which
      // is why this genre and this medium have always suited each other.
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} sits behind a brick-built desk in a dark office, a headless minifigure body standing upright on the blotter in front of him, venetian blind stripes of light and shadow falling across the studded wall and his coat, rain of thin transparent rods streaking the window behind him, visible brick studs and mould seams, dust on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'dolly-in', quality: 'ultra' },
      title: { text: 'Голова. Просто взяли и унесли голову.', position: 'top' },
      voiceover: { text: 'В этом городе теряют многое. Но голову — впервые.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Клиентка',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: a minifigure woman in a black hat piece and printed veil stands in the lit doorway of the dark office, silhouetted, holding out a plastic banknote tile, {{hero}} leaning back out of the lamplight watching her, harsh backlight through the door, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'static', quality: 'ultra' },
      voiceover: { text: 'Найдите её. Я заплачу вдвое. Только не задавайте вопросов.', voice: 'Elena' },
    },
    {
      kind: 'clip',
      beat: 'Допрос',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} leans over a minifigure barman across a brick-built bar counter, rows of transparent bottle pieces glowing behind them, cigarette smoke of thin pulled cotton wool hanging under a low lamp, other minifigure drinkers turned away, visible brick studs and mould seams, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'close-up', cameraMotion: 'handheld', quality: 'ultra' },
      voiceover: { text: 'Ты видел, кто выходил отсюда в ту ночь. Говори.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Слежка',
      durationSeconds: 8,
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} presses into a doorway of a wet brick-built street at night watching a figure walk away under a streetlamp, neon signs of transparent coloured bricks reflected in the puddles of glossy black plates, his hat brim pulled low, visible brick studs, dust on the plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'pan', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 300,
      voiceover: { text: 'Он вёл меня к себе сам. Все они в итоге ведут.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Разоблачение',
      durationSeconds: 8,
      // The masculine-agreement line the grammar note exists for.
      prompt:
        'a miniature world built entirely from plastic construction bricks: {{hero}} points one C-shaped claw hand at {{culprit}} in a crowded brick-built drawing room, the missing minifigure head sitting on the mantelpiece behind him under a glass dome piece, every other minifigure turned to stare, hard single-source light from a standing lamp, visible brick studs, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'dolly-in', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Голову взял {{culprit}}. И он всё ещё в этой комнате.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Уход',
      durationSeconds: 8,
      // Noir does not end on the answer. It ends on the detective leaving — which is
      // why the reveal is beat 5 and this is beat 6.
      prompt:
        'a miniature world built entirely from plastic construction bricks: the repaired minifigure stands whole again with its head back on in a lit window, while {{hero}} walks away from the house into pouring rain of thin transparent rods, seen from behind, collar up, one streetlamp flaring, cold blue night light on the wet plastic, stop-motion brickfilm animation, stepped jittery motion, no motion blur, tilt-shift macro photography, shallow depth of field',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-out', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 400,
      voiceover: { text: 'Голову вернули на место. Меня никто не поблагодарил.', voice: 'Dmitry' },
    },
    {
      kind: 'title',
      beat: 'Клиффхэнгер',
      durationSeconds: 2,
      title: { text: 'НОВОЕ ДЕЛО · ЧАСТЬ 2 →', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
