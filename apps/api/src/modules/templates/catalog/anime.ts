// apps/api/src/modules/templates/catalog/anime.ts
// «Аниме» — a battle-episode cold open in TV-anime grammar, the third FORMAT
// template (owner request 2026-07-18: «как фильм / как сериал / как аниме»).
//
// THE FORMAT: the six-beat opening every seasonal action anime runs — city
// establishing shot, the hero walk, the enemy reveal, the power-up (the sakuga
// money-shot), the clash, the after-battle quiet — closed by a «Продолжение
// следует» card, which is how real TV anime ends literally every episode.
//
// THE LOOK: styleId 'anime' does the base cel-shaded work; the prompts then
// insist on the tropes that make it read as ANIME and not "cartoon" — speed
// lines, impact frames, dramatic held poses, wind-blown sakura, god rays.
//
// THE KNOBS are the two axes fans actually pick a show by: WHO the hero is and
// WHAT their power looks like. The power substitutes into the power-up and the
// clash beats, so one select re-colors the two most spectacular shots.
import type { Template } from '../types'

export const anime: Template = {
  id: 'anime',
  category: 'format',
  name: 'Аниме',
  tagline: 'Боевой эпизод: пробуждение силы, сакуга-битва и «Продолжение следует».',
  description:
    'Открытие серии сёнен-аниме по канону: город на рассвете, проход героя, явление врага, пробуждение силы, ' +
    'битва и тишина после неё. Выбери героя и стихию — линии скорости, импакт-кадры и драматичные стойки уже ' +
    'прописаны в промптах. Финальная карта «Продолжение следует» — как в настоящем ТВ-аниме.',
  aspectRatio: '16:9',
  defaultStyleId: 'anime',
  titleTemplate: 'Аниме: {{hero}}',

  // Same ladder as the other two formats — 8s at 16:9 on every tier (the
  // invariant templates.test.ts enforces). wan-2-7 standard: references keep
  // the SAME hero across episodes, which for a series is the whole point.
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
    'epic japanese anime opening theme, taiko drums, driving electric guitar, soaring strings, heroic chorus swell, j-rock energy',

  variables: [
    {
      key: 'hero',
      kind: 'select',
      label: 'Герой',
      defaultValue: 'swordboy',
      options: [
        {
          value: 'swordboy',
          label: 'Школьник с катаной',
          prompt:
            'a japanese high-school boy in a worn dark uniform carrying a long katana, messy black hair, determined eyes',
          spoken: 'школьник с катаной',
        },
        {
          value: 'sorceress',
          label: 'Девушка-маг',
          prompt:
            'a young sorceress with long silver hair and a flowing dark coat, glowing runes orbiting her hands',
          spoken: 'девушка-маг',
        },
        {
          value: 'ronin',
          label: 'Киборг-ронин',
          prompt:
            'a cyborg ronin in a tattered straw cloak, a cracked ceramic mask, one glowing mechanical eye',
          spoken: 'киборг-ронин',
        },
      ],
    },
    {
      key: 'power',
      kind: 'select',
      label: 'Стихия силы',
      hint: 'Красит два самых зрелищных кадра — пробуждение и битву.',
      defaultValue: 'fire',
      options: [
        {
          value: 'fire',
          label: 'Огонь',
          prompt: 'blazing orange fire aura, embers spiraling upward, heat distortion',
        },
        {
          value: 'lightning',
          label: 'Молния',
          prompt: 'crackling blue lightning arcs, branching electric bolts, strobing flashes',
        },
        {
          value: 'ice',
          label: 'Лёд',
          prompt: 'crystalline ice shards, frost spreading in fractal patterns, cold blue glow',
        },
      ],
    },
  ],

  shots: [
    {
      kind: 'clip',
      beat: 'Город на рассвете',
      durationSeconds: 8,
      prompt:
        'sweeping aerial establishing shot of a japanese city at dawn, telephone wires against a pink-orange sky, trains crossing a river bridge, birds scattering, 2D anime style, cel shading, detailed background art, god rays',
      preset: { styleId: 'anime', cameraShot: 'aerial', cameraMotion: 'pan', quality: 'ultra' },
      title: { text: 'Этот город снова в опасности', position: 'bottom' },
      voiceover: { text: 'Этот город снова в опасности.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Проход героя',
      durationSeconds: 8,
      prompt:
        '{{hero}} walking slowly toward the camera down an empty street, wind-blown sakura petals crossing the frame, coat and hair moving in the wind, long morning shadows, resolute expression, 2D anime style, cel shading, dramatic composition',
      preset: { styleId: 'anime', cameraShot: 'medium', cameraMotion: 'dolly-out', quality: 'ultra' },
      voiceover: { text: 'Я дал себе слово: больше никто не пострадает.', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Явление врага',
      durationSeconds: 8,
      prompt:
        'a towering dark entity materializes above the rooftops, its silhouette blotting out the dawn, windows shattering outward in slow motion, tiny figures fleeing below, ominous purple-black smoke, 2D anime style, cel shading, dramatic low-angle scale',
      preset: { styleId: 'anime', cameraShot: 'low-angle', cameraMotion: 'dolly-in', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Ты опоздал, герой. Этот город уже мой.', voice: 'Nikolai' },
    },
    {
      kind: 'clip',
      beat: 'Пробуждение силы',
      durationSeconds: 8,
      // The sakuga money-shot — the beat this whole format exists for.
      prompt:
        '{{hero}} plants their feet and unleashes their power: {{power}} erupting around their body, ground cracking in a radial shockwave, hair and clothes whipping upward, screaming with effort, impact frames, dramatic speed lines, sakuga animation, 2D anime style, cel shading',
      preset: { styleId: 'anime', cameraShot: 'close-up', cameraMotion: 'orbit', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'Вот она… моя настоящая сила!', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Битва',
      durationSeconds: 8,
      prompt:
        '{{hero}} clashes with the towering dark entity above the city, {{power}} trailing behind every strike, shockwaves rippling the clouds, debris suspended mid-air, extreme dynamic angles, impact frames, dramatic speed lines, sakuga animation, 2D anime style, cel shading',
      preset: { styleId: 'anime', cameraShot: 'wide', cameraMotion: 'handheld', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 200,
      voiceover: { text: 'ЭТО КОНЕЦ!', voice: 'Dmitry' },
    },
    {
      kind: 'clip',
      beat: 'Тишина после битвы',
      durationSeconds: 8,
      prompt:
        '{{hero}} standing alone amid settling dust and drifting ash, the dark entity gone, morning light breaking through parting clouds onto the scarred street, breathing hard, a small tired smile, falling sakura petals, 2D anime style, cel shading, soft god rays',
      preset: { styleId: 'anime', cameraShot: 'wide', cameraMotion: 'dolly-out', quality: 'ultra' },
      transition: 'crossfade',
      transitionMs: 400,
      voiceover: { text: 'Пока я стою на ногах — этот город будет жить.', voice: 'Dmitry' },
    },
    {
      // The canonical TV-anime episode ending — a free card, and the reason a
      // viewer expects episode two.
      kind: 'title',
      beat: 'Финал серии',
      durationSeconds: 3,
      title: { text: 'Продолжение следует', position: 'center' },
      transition: 'crossfade',
      transitionMs: 400,
    },
  ],
}
