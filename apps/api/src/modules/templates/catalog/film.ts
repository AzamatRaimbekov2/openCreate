// apps/api/src/modules/templates/catalog/film.ts
// «Фильм» — a big-screen movie TRAILER, the first of the three FORMAT templates
// (owner request 2026-07-18: «как фильм / как сериал / как аниме» — ready
// settings and prompts to generate by, aimed at the Cinema editor with Wan).
//
// WHY A TRAILER AND NOT "A MOVIE": a feature film does not fit six beats; a
// trailer IS six beats — cold open, hero, threat, escalation, climax, title.
// The trailer grammar is instantly readable (everyone has seen a thousand) and
// it is the one film format where 8-second shots are the native cut length.
//
// THE LOOK: anamorphic-widescreen photorealism — the 'cinematic' style preset
// plus prompts that insist on film grain, practical light and negative space.
// No character names anywhere: the knobs re-aim the SAME arc from noir to space
// opera without touching a single beat.
//
// STANDARD TIER IS wan-2-7 deliberately (the owner works through Cinema+Wan):
// it holds 8s at 16:9, ships its own soundtrack, and — uniquely among our video
// models — takes CHARACTER REFERENCES (r2v), so a tagged entity stays the same
// person from the cold open to the climax.
import type { Template } from '../types'

export const film: Template = {
  id: 'film',
  category: 'format',
  name: 'Фильм',
  tagline: 'Трейлер большого кино: шесть битов от холодного открытия до титула.',
  description:
    'Голливудская грамматика трейлера, уже разложенная по таймлайну: мир — герой — угроза — эскалация — ' +
    'кульминация — титульная карта. Выбери героя и мир, впиши название — и получи широкоэкранный тизер ' +
    'с закадровым голосом и киношным зерном. Каждый бит — отдельный кадр, который можно переписать в редакторе.',
  aspectRatio: '16:9',
  defaultStyleId: 'cinematic',
  titleTemplate: '{{title}}',

  // Photoreal people, shot as live action — the tier the disclosure rule is
  // actually aimed at, even though the film itself is fiction. Not loopable: a
  // trailer is an escalation into a title card, and the title card is the end.
  loopable: false,
  disclosureTier: 'in-player',

  // All three tiers natively hold 8s at 16:9 (the invariant templates.test.ts
  // enforces). wan-2-7 is the standard tier ON PURPOSE — see the header.
  models: {
    draft: 'pixverse-v6',
    standard: 'wan-2-7',
    premium: 'veo-3-1-fast',
  },
  tierNotes: {
    standard: 'Держит персонажа по референсу — тегай героя из «Сущностей»',
    premium: 'Синхронный звук сцены — модель генерирует его вместе с видео',
  },

  musicPrompt:
    'epic cinematic trailer score, low braams, rising string ostinato, thunderous percussion hits, tense silence before the drop, hollywood blockbuster',

  variables: [
    {
      key: 'hero',
      kind: 'select',
      label: 'Герой',
      hint: 'Один и тот же трейлер, три разных фильма.',
      defaultValue: 'detective',
      options: [
        {
          value: 'detective',
          label: 'Детектив',
          prompt:
            'a weathered middle-aged detective in a rain-soaked trench coat, tired eyes, stubble',
          spoken: 'детектив',
        },
        {
          value: 'cosmonaut',
          label: 'Космонавт',
          prompt:
            'a lone cosmonaut in a scuffed white pressure suit with a cracked helmet visor',
          spoken: 'космонавт',
        },
        {
          value: 'samurai',
          label: 'Самурай',
          prompt:
            'a wandering samurai in dark travel-worn robes, a katana at the hip, a straw hat shading the eyes',
          spoken: 'самурай',
        },
      ],
    },
    {
      key: 'world',
      kind: 'select',
      label: 'Мир',
      defaultValue: 'neon-city',
      options: [
        {
          value: 'neon-city',
          label: 'Неоновый мегаполис',
          prompt:
            'a rain-drenched neon megacity at night, wet asphalt mirroring holographic billboards, steam rising from vents',
        },
        {
          value: 'dead-desert',
          label: 'Мёртвая пустыня',
          prompt:
            'an endless sun-bleached desert with half-buried colossal ruins, heat haze, a bone-white sky',
        },
        {
          value: 'north-harbor',
          label: 'Северный порт',
          prompt:
            'a fog-drowned northern harbor town, rusting trawlers, sodium lamps glowing through freezing mist',
        },
      ],
    },
    {
      // Free text lands ONLY in the title card and the last spoken line —
      // never in a visual prompt (the catalog-wide test enforces this).
      key: 'title',
      kind: 'text',
      label: 'Название фильма',
      hint: 'Появится на титульной карте и прозвучит в финале.',
      defaultValue: 'Последний рубеж',
      maxLength: 40,
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Холодное открытие',
      durationSeconds: 8,
      prompt:
        'slow aerial establishing shot over {{world}}, vast scale, tiny signs of life far below, heavy atmosphere, anamorphic widescreen, film grain, teal and amber grade, cinematic photorealism',
      preset: { styleId: 'cinematic', cameraShot: 'aerial', cameraMotion: 'crane', quality: 'ultra' },
      // ~70% of trailers are first met muted in a feed — the premise rides
      // burned-in text, the voiceover doubles it for the rest.
      title: { text: 'В мире, который забыл о надежде…', position: 'bottom' },
      voiceover: { text: 'В мире, который забыл о надежде…', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Герой',
      durationSeconds: 8,
      prompt:
        '{{hero}} standing alone in {{world}}, seen in a slow push-in from behind as they turn their head into profile, wind moving fabric, a single practical light source carving the face out of darkness, anamorphic widescreen, film grain, cinematic photorealism',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'dolly-in', quality: 'ultra' },
      voiceover: { text: 'Остался только один, кто помнит, как всё было.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Угроза',
      durationSeconds: 8,
      prompt:
        'something immense and wrong arrives in {{world}}: shadows stretch, lights die street by street, crowds freeze mid-step and look up, dread without showing the threat itself, anamorphic widescreen, film grain, cinematic photorealism',
      preset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'static', quality: 'ultra' },
      voiceover: { text: 'Но прошлое всегда приходит за своим.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Эскалация',
      durationSeconds: 8,
      prompt:
        '{{hero}} running through {{world}}, debris in the air, near-misses, quick urgent motion, sparks and rain crossing the frame, desperate momentum, anamorphic widescreen, film grain, cinematic photorealism',
      preset: { styleId: 'cinematic', cameraShot: 'medium', cameraMotion: 'handheld', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Времени больше нет.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Кульминация',
      durationSeconds: 8,
      prompt:
        '{{hero}} facing the storm at the heart of {{world}}, tiny figure against an overwhelming force, coat and dust whipping in the shockwave, one defiant step forward, epic scale, anamorphic widescreen, film grain, cinematic photorealism',
      preset: { styleId: 'cinematic', cameraShot: 'low-angle', cameraMotion: 'crane', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Кто-то должен встать первым.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Финальный кадр',
      durationSeconds: 8,
      prompt:
        'extreme close-up of the eyes of {{hero}}, a slow blink, reflections of {{world}} burning in the iris, everything else falls silent and dark, anamorphic widescreen, film grain, cinematic photorealism',
      preset: {
        styleId: 'cinematic',
        cameraShot: 'extreme-close-up',
        cameraMotion: 'static',
        quality: 'ultra',
      },
      transition: 'crossfade',
      transitionMs: 400,
      // The spoken title — the one place the free-text knob is HEARD.
      voiceover: { text: '{{title}}. Скоро.', voice: 'Nikolai' },
    },
    {
      // Free title card — ffmpeg draws it over black; serialization of the
      // trailer grammar: the name lands last, after the eyes.
      kind: 'title',
      beat: 'Титул',
      durationSeconds: 3,
      title: { text: '{{title}}', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
